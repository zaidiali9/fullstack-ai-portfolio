/**
 * Start a production server for E2E tests on a fresh PGlite database:
 * wipe .data/e2e -> apply migrations -> seed demo data -> next start.
 * Requires `npm run build` beforehand.
 */
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.env.PGLITE_DIR ?? ".data/e2e");
fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync(`${dir}.lock`, { force: true });
const env = { ...process.env, PGLITE_DIR: dir };
execSync("npx tsx drizzle/migrate.ts", { stdio: "inherit", env });
execSync("npx tsx --conditions=react-server drizzle/seed.ts", { stdio: "inherit", env });
const port = process.env.E2E_PORT ?? "3103";
const server = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "--port", port], { stdio: "inherit", env, shell: process.platform === "win32" });
const stop = () => server.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", (code) => process.exit(code ?? 0));
