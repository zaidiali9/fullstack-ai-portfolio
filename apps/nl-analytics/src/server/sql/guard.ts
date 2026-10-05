import { parse } from "libpg-query";
import { DATASET_SCHEMA, TABLE_NAMES } from "./dataset";

/**
 * Read-only allowlist guard for SQL that will run against the demo dataset.
 *
 * Uses the real PostgreSQL 18 parser (libpg-query, WASM), so the guard sees the query exactly as the
 * database will. Everything not explicitly allowed is rejected:
 *   - exactly one statement, and it must be a SELECT (CTEs allowed, data-modifying CTEs are not)
 *   - every AST node type must be on NODE_TYPES (no DDL/DML/utility/locking/INTO/params nodes)
 *   - tables: only demo.<dataset table>, unqualified dataset tables, or CTEs defined in the query
 *   - functions: only FUNCTIONS (aggregates, date/math/string helpers); no pg_* or admin functions
 *   - casts: only plain scalar types (no regclass/oid tricks)
 *   - special values: only date/time ones (CURRENT_USER and friends are rejected)
 * This is the first of several layers: execution also uses a READ ONLY transaction, a role that can
 * only read the demo schema, a cost ceiling, a timeout and a row limit (see execute.ts).
 */

export const MAX_SQL_CHARS = 4000;

export type GuardResult = { ok: true; sql: string; tables: string[] } | { ok: false; code: GuardCode; reason: string };
export type GuardCode = "empty" | "too_long" | "syntax" | "multiple_statements" | "not_select" | "node" | "table" | "function" | "type" | "clause" | "value";

const NODE_TYPES = new Set([
  "SelectStmt",
  "ResTarget",
  "ColumnRef",
  "String",
  "A_Star",
  "A_Const",
  "Integer",
  "Float",
  "Boolean",
  "A_Expr",
  "BoolExpr",
  "FuncCall",
  "RangeVar",
  "RangeSubselect",
  "RangeFunction",
  "JoinExpr",
  "Alias",
  "SortBy",
  "WithClause",
  "CommonTableExpr",
  "SubLink",
  "TypeCast",
  "TypeName",
  "CaseExpr",
  "CaseWhen",
  "CoalesceExpr",
  "NullTest",
  "BooleanTest",
  "MinMaxExpr",
  "SQLValueFunction",
  "WindowDef",
  "GroupingSet",
  "List",
  "RowExpr",
  "A_ArrayExpr",
]);

/** Fields that are never allowed anywhere (SELECT INTO, FOR UPDATE/SHARE). */
const FORBIDDEN_FIELDS = new Set(["intoClause", "lockingClause"]);

const FUNCTIONS = new Set([
  // aggregates
  "count", "sum", "avg", "min", "max", "stddev", "stddev_samp", "stddev_pop", "variance", "var_samp", "var_pop",
  "percentile_cont", "percentile_disc", "mode", "string_agg", "array_agg", "bool_and", "bool_or", "every", "corr",
  // window
  "row_number", "rank", "dense_rank", "percent_rank", "cume_dist", "ntile", "lag", "lead", "first_value", "last_value", "nth_value",
  // math
  "round", "trunc", "ceil", "ceiling", "floor", "abs", "sign", "sqrt", "power", "ln", "log", "exp", "mod", "div", "width_bucket",
  // date/time
  "date_trunc", "date_part", "extract", "now", "age", "make_date", "make_interval", "to_char", "to_date", "justify_days", "justify_interval", "date_bin", "generate_series",
  // text
  "lower", "upper", "initcap", "length", "char_length", "substring", "substr", "left", "right", "trim", "btrim", "ltrim", "rtrim", "concat", "concat_ws",
  "replace", "split_part", "position", "strpos", "lpad", "rpad", "starts_with", "format",
  // misc
  "nullif", "greatest", "least", "coalesce", "cast", "array_length", "unnest",
]);

const TYPES = new Set([
  "int2", "int4", "int8", "smallint", "integer", "int", "bigint", "numeric", "decimal", "float4", "float8", "real", "double precision",
  "text", "varchar", "char", "bpchar", "date", "timestamp", "timestamptz", "time", "interval", "bool", "boolean",
]);

const SQL_VALUE_FUNCTIONS = new Set([
  "SVFOP_CURRENT_DATE",
  "SVFOP_CURRENT_TIME",
  "SVFOP_CURRENT_TIME_N",
  "SVFOP_CURRENT_TIMESTAMP",
  "SVFOP_CURRENT_TIMESTAMP_N",
  "SVFOP_LOCALTIME",
  "SVFOP_LOCALTIME_N",
  "SVFOP_LOCALTIMESTAMP",
  "SVFOP_LOCALTIMESTAMP_N",
]);

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const strs = (list: Json | undefined): string[] =>
  Array.isArray(list) ? list.map((n) => ((n as { String?: { sval?: string } })?.String?.sval ?? "").toLowerCase()) : [];

/** Remove trailing semicolons/whitespace; a single trailing ";" is normal in hand-written SQL. */
export function normalizeSql(input: string): string {
  return input.trim().replace(/(;\s*)+$/, "").trim();
}

class Reject extends Error {
  constructor(
    readonly code: GuardCode,
    message: string,
  ) {
    super(message);
  }
}

function collectCtes(node: Json, out: Set<string>) {
  if (Array.isArray(node)) for (const n of node) collectCtes(n, out);
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "CommonTableExpr" && v && typeof v === "object" && !Array.isArray(v)) {
        const name = (v as { ctename?: string }).ctename;
        if (name) out.add(name.toLowerCase());
      }
      collectCtes(v, out);
    }
  }
}

function checkTypeName(v: Record<string, Json>) {
  const name = strs(v.names);
  const type = name[name.length - 1] ?? "";
  if ((name.length === 2 && name[0] !== "pg_catalog") || name.length > 2 || !TYPES.has(type)) {
    throw new Reject("type", `Type "${name.join(".")}" is not allowed.`);
  }
  if (v.arrayBounds) throw new Reject("type", "Array types are not allowed.");
}

function check(node: Json, ctes: Set<string>, tables: Set<string>) {
  if (Array.isArray(node)) {
    for (const n of node) check(n, ctes, tables);
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (FORBIDDEN_FIELDS.has(key)) throw new Reject("clause", key === "intoClause" ? "SELECT INTO is not allowed." : "Row locking (FOR UPDATE/SHARE) is not allowed.");
    // The parser emits some typed fields without a node wrapper (TypeCast.typeName is a bare TypeName).
    if (key === "typeName" && value && typeof value === "object" && !Array.isArray(value)) checkTypeName(value as Record<string, Json>);
    if (/^[A-Z]/.test(key)) {
      if (!NODE_TYPES.has(key)) throw new Reject("node", `"${key}" is not allowed in read-only queries.`);
      const v = (value ?? {}) as Record<string, Json>;
      if (key === "CommonTableExpr") {
        if (v.ctequery && typeof v.ctequery === "object" && !("SelectStmt" in (v.ctequery as object))) {
          throw new Reject("not_select", "WITH clauses may only contain SELECT queries.");
        }
        // CTE names are trusted as table names below. A CTE called pg_<something> could otherwise let an
        // out-of-scope reference to the real catalog relation pass (catalog relations all start with pg_).
        if (String(v.ctename ?? "").toLowerCase().startsWith("pg_")) throw new Reject("table", "WITH names may not start with pg_.");
      }
      if (key === "RangeVar") {
        const schema = typeof v.schemaname === "string" ? v.schemaname.toLowerCase() : null;
        const rel = String(v.relname ?? "").toLowerCase();
        if (typeof v.catalogname === "string") throw new Reject("table", "Cross-database references are not allowed.");
        if (schema ? schema !== DATASET_SCHEMA || !TABLE_NAMES.has(rel) : !TABLE_NAMES.has(rel) && !ctes.has(rel)) {
          throw new Reject("table", `Table "${schema ? `${schema}.` : ""}${rel}" is not part of the dataset.`);
        }
        if (!ctes.has(rel) || schema) tables.add(rel);
      }
      if (key === "FuncCall") {
        const name = strs(v.funcname);
        const fn = name[name.length - 1] ?? "";
        if (name.length > 2 || (name.length === 2 && name[0] !== "pg_catalog") || !FUNCTIONS.has(fn)) {
          throw new Reject("function", `Function "${name.join(".")}" is not allowed.`);
        }
      }
      if (key === "TypeName") checkTypeName(v);
      if (key === "SQLValueFunction" && !SQL_VALUE_FUNCTIONS.has(String(v.op))) {
        throw new Reject("value", "Only date/time special values (like CURRENT_DATE) are allowed.");
      }
      if (key === "SelectStmt" && v.op && v.op !== "SETOP_NONE") {
        // UNION/INTERSECT/EXCEPT branches are plain objects under larg/rarg; check them as SELECTs.
        for (const side of ["larg", "rarg"] as const) {
          const branch = v[side];
          if (branch && typeof branch === "object") check({ SelectStmt: branch } as Json, ctes, tables);
        }
        const rest = { ...v };
        delete rest.larg;
        delete rest.rarg;
        check(rest as Json, ctes, tables);
        continue;
      }
    }
    check(value, ctes, tables);
  }
}

/** Validate SQL. Never throws for bad input; returns a reason the user (and the model's repair turn) can read. */
export async function guardSql(input: string): Promise<GuardResult> {
  const sql = normalizeSql(input ?? "");
  if (!sql) return { ok: false, code: "empty", reason: "The query is empty." };
  if (sql.length > MAX_SQL_CHARS) return { ok: false, code: "too_long", reason: `The query is longer than ${MAX_SQL_CHARS} characters.` };
  let ast: { stmts?: { stmt?: Record<string, Json> }[] };
  try {
    ast = (await parse(sql)) as typeof ast;
  } catch (err) {
    // Only genuine parse errors (SqlError with sqlDetails) are the user's to see. Anything else — e.g.
    // the WASM module failing to load — is an infrastructure fault: rethrow so it becomes a generic 500
    // with a request id, never a message that leaks server paths.
    const details = (err as { sqlDetails?: { message?: string; cursorPosition?: number } }).sqlDetails;
    if (!details?.message) throw err;
    return { ok: false, code: "syntax", reason: `SQL syntax error: ${details.message}${typeof details.cursorPosition === "number" ? ` (at character ${details.cursorPosition + 1})` : ""}` };
  }
  const stmts = ast.stmts ?? [];
  if (stmts.length !== 1) return { ok: false, code: "multiple_statements", reason: "Only one statement is allowed." };
  const stmt = stmts[0]!.stmt ?? {};
  if (Object.keys(stmt)[0] !== "SelectStmt") return { ok: false, code: "not_select", reason: "Only SELECT queries are allowed (the data is read-only)." };
  const ctes = new Set<string>();
  collectCtes(stmt as Json, ctes);
  const tables = new Set<string>();
  try {
    check(stmt as Json, ctes, tables);
  } catch (err) {
    if (err instanceof Reject) return { ok: false, code: err.code, reason: err.message };
    throw err;
  }
  if (tables.size === 0) return { ok: false, code: "table", reason: "The query must read from the dataset." };
  return { ok: true, sql, tables: [...tables].sort() };
}
