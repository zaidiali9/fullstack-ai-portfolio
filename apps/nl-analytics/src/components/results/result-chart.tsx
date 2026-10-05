"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartSpec } from "@db/schema";
import { formatCell, formatCompact, label, type Cell as CellValue } from "@/lib/format";

export interface ResultView {
  columns: { name: string; kind: "number" | "text" | "date" | "boolean" }[];
  rows: CellValue[][];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
  sql: string;
}

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const axis = { stroke: "var(--muted-foreground)", fontSize: 12, tickLine: false, axisLine: false } as const;
const tooltipStyle = { contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)", fontSize: 12 } };

/** Describe the chart in words for screen readers (the table tab has the full data). */
function describe(spec: ChartSpec, result: ResultView) {
  const y = (spec.y ?? []).map(label).join(" and ");
  return spec.type === "number" ? `${y}: ${formatCell(result.rows[0]?.[result.columns.findIndex((c) => c.name === spec.y?.[0])] ?? null, "number")}` : `${spec.type} chart of ${y} by ${label(spec.x ?? "")}, ${result.rowCount} points`;
}

export function ResultChart({ spec, result, height = 300 }: { spec: ChartSpec; result: ResultView; height?: number }) {
  const idx = (name: string | null | undefined) => result.columns.findIndex((c) => c.name === name);
  if (spec.type === "number") {
    const i = idx(spec.y?.[0]);
    const v = i >= 0 ? result.rows[0]?.[i] : null;
    return (
      <div className="flex flex-col items-center justify-center py-8" role="img" aria-label={describe(spec, result)}>
        <p className="font-heading text-5xl font-bold tabular-nums">{formatCell(v ?? null, "number")}</p>
        <p className="mt-2 text-sm text-muted-foreground">{label(spec.y?.[0] ?? "")}</p>
      </div>
    );
  }
  if (spec.type === "table" || !spec.x || !spec.y?.length) return null;
  const xi = idx(spec.x);
  const ys = (spec.y ?? []).filter((y) => idx(y) >= 0);
  const data = result.rows.map((r) => Object.fromEntries([[spec.x!, r[xi]], ...ys.map((y) => [y, r[idx(y)]])]));
  const series = ys.map((y, i) => ({ key: y, name: label(y), color: COLORS[i % COLORS.length]! }));

  let chart: React.ReactElement;
  if (spec.type === "pie") {
    chart = (
      <PieChart>
        <Pie data={data} dataKey={ys[0]!} nameKey={spec.x} innerRadius="45%" outerRadius="80%" paddingAngle={1} isAnimationActive={false}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip {...tooltipStyle} formatter={(v) => formatCell(v as number, "number")} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    );
  } else {
    const common = { data, margin: { top: 8, right: 12, bottom: 4, left: 4 } };
    const xAxis = <XAxis dataKey={spec.x} {...axis} minTickGap={16} />;
    const yAxis = <YAxis {...axis} width={56} tickFormatter={(v: number) => formatCompact(v)} />;
    const grid = <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />;
    const tip = <Tooltip {...tooltipStyle} formatter={(v) => formatCell(v as number, "number")} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />;
    const legend = series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null;
    chart =
      spec.type === "bar" ? (
        <BarChart {...common}>
          {grid}
          {xAxis}
          {yAxis}
          {tip}
          {legend}
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          ))}
        </BarChart>
      ) : spec.type === "area" ? (
        <AreaChart {...common}>
          {grid}
          {xAxis}
          {yAxis}
          {tip}
          {legend}
          {series.map((s) => (
            <Area key={s.key} dataKey={s.key} name={s.name} stroke={s.color} fill={s.color} fillOpacity={0.2} isAnimationActive={false} />
          ))}
        </AreaChart>
      ) : (
        <LineChart {...common}>
          {grid}
          {xAxis}
          {yAxis}
          {tip}
          {legend}
          {series.map((s) => (
            <Line key={s.key} dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={data.length <= 24} isAnimationActive={false} />
          ))}
        </LineChart>
      );
  }
  return (
    <div role="img" aria-label={describe(spec, result)} style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {chart}
      </ResponsiveContainer>
    </div>
  );
}
