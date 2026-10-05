/**
 * One-off database setup for the Railway deployment (see deploy/README.md). Runs INSIDE Railway (as its own
 * `setup` service, or temporarily in an app's service on the free plan), so database credentials stay on Railway's
 * private network and are never printed:
 *   1. create one database per app on the shared Postgres (if missing)
 *   2. run each app's `npm run setup` (migrations + seed data) against its own database
 * Env: ADMIN_DATABASE_URL, <APP>_DATABASE_URL per app; optional SETUP_APPS="booking,nl-analytics" to limit.
 * Exits 0 on success so Railway's default ON_FAILURE restart policy leaves it stopped.
 */
import { spawnSync } from "node:child_process";
import postgres from "postgres";

const APPS = [
  { app: "helpdesk", db: "helpdesk", env: "HELPDESK_DATABASE_URL" },
  { app: "kb-chat", db: "kb_chat", env: "KB_CHAT_DATABASE_URL" },
  { app: "storefront", db: "storefront", env: "STOREFRONT_DATABASE_URL" },
  { app: "booking", db: "booking", env: "BOOKING_DATABASE_URL" },
  { app: "nl-analytics", db: "nl_analytics", env: "NL_ANALYTICS_DATABASE_URL" },
];
const only = process.env.SETUP_APPS?.split(",").map((s) => s.trim()).filter(Boolean);
const selected = only?.length ? APPS.filter((a) => only.includes(a.app)) : APPS;

function need(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`[setup] missing ${name}`);
    process.exit(1);
  }
  return v;
}

const admin = postgres(need("ADMIN_DATABASE_URL"), { max: 1, onnotice: () => {} });
try {
  const [{ server_version }] = await admin`show server_version`;
  const ext = await admin`select name from pg_available_extensions where name in ('vector', 'btree_gist') order by name`;
  console.log(`[setup] Postgres ${server_version}; extensions available: ${ext.map((e) => e.name).join(", ") || "none"}`);
  for (const { db } of selected) {
    const exists = await admin`select 1 from pg_database where datname = ${db}`;
    if (exists.length) console.log(`[setup] database ${db}: exists`);
    else {
      await admin.unsafe(`create database ${db}`);
      console.log(`[setup] database ${db}: created`);
    }
  }
} finally {
  await admin.end();
}

for (const { app, env } of selected) {
  console.log(`\n[setup] ===== ${app}: migrate + seed =====`);
  const started = Date.now();
  // The setup service's own APP_URL belongs to whichever service hosts this job; seeds don't need it, and an unresolved
  // value ("https://") fails each app's env validation, so let the app fall back to its default.
  const { APP_URL: _ignored, ...base } = process.env;
  const r = spawnSync("npm", ["run", "setup"], {
    cwd: `apps/${app}`,
    stdio: "inherit",
    // NODE_ENV is left unset: seed scripts don't sign sessions, so they don't need BETTER_AUTH_SECRET.
    env: { ...base, DATABASE_URL: need(env) },
  });
  if (r.status !== 0) {
    console.error(`[setup] ${app} failed (exit ${r.status})`);
    process.exit(1);
  }
  console.log(`[setup] ${app} done in ${Math.round((Date.now() - started) / 1000)}s`);
}
console.log("\n[setup] all done");
