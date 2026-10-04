/**
 * Seed script: fictional demo organizations, users, KB articles and tickets (SEED DATA).
 *
 *   npm run db:seed              -> seed data only; newest tickets are marked "AI unavailable"
 *   npm run db:seed -- --with-ai -> also runs REAL triage + KB embeddings with the configured model
 *
 * Seed tickets never get invented AI output: older tickets carry category/priority set by seed
 * "agents" (triage_status = manual); AI fields are only filled by real model calls.
 */
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { inArray } from "drizzle-orm";
import { db, dbHandle, schema } from "@/db";
import { DEMO_PASSWORD } from "@/lib/demo";
import { runTriage } from "@/server/ai/features";
import { embedPendingArticles } from "@/server/kb";
import { ARTICLES, ORGS, TICKETS, USERS } from "./seed-data";

const withAi = process.argv.includes("--with-ai");
const DAY = 86_400_000;
const now = Date.now();

async function main() {
  const started = Date.now();
  // 1. Remove previous seed data (cascades to memberships, tickets, messages, KB, audit, emails).
  await db.delete(schema.organizations).where(inArray(schema.organizations.slug, ORGS.map((o) => o.slug)));
  await db.delete(schema.user).where(inArray(schema.user.email, USERS.map((u) => u.email)));

  // 2. Users with hashed demo passwords (same scrypt hashing Better Auth uses at sign-up).
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const userIds = new Map<string, string>();
  for (const u of USERS) {
    const id = randomUUID();
    userIds.set(u.key, id);
    await db.insert(schema.user).values({ id, name: u.name, email: u.email, emailVerified: true });
    await db.insert(schema.account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: passwordHash });
  }

  // 3. Organizations + memberships.
  const orgIds = new Map<string, string>();
  for (const o of ORGS) {
    const [org] = await db.insert(schema.organizations).values({ name: o.name, slug: o.slug }).returning();
    orgIds.set(o.key, org!.id);
    await db.insert(schema.memberships).values(
      Object.entries(o.members).map(([userKey, role]) => ({ orgId: org!.id, userId: userIds.get(userKey)!, role: role as "admin" | "agent" | "customer" })),
    );
    await db.insert(schema.auditEvents).values({ orgId: org!.id, actorId: null, action: "seed.created", meta: { note: "Seed data" } });
  }

  // 4. Knowledge base.
  await db.insert(schema.kbArticles).values(
    ARTICLES.map((a, i) => ({ orgId: orgIds.get(a.org)!, title: a.title, body: a.body, authorId: userIds.get("ava")!, createdAt: new Date(now - (30 - i) * DAY), updatedAt: new Date(now - (30 - i) * DAY) })),
  );

  // 5. Tickets, oldest first so numbers increase with time.
  const seq = new Map<string, number>();
  const toTriage: string[] = [];
  for (const t of [...TICKETS].sort((a, b) => b.daysAgo - a.daysAgo)) {
    const orgId = orgIds.get(t.org)!;
    const number = (seq.get(orgId) ?? 0) + 1;
    seq.set(orgId, number);
    const created = new Date(now - t.daysAgo * DAY);
    const lastAt = new Date(created.getTime() + (t.messages.length - 1) * 2 * 3600_000);
    const [ticket] = await db
      .insert(schema.tickets)
      .values({
        orgId,
        number,
        subject: t.subject,
        status: t.status,
        priority: t.manual?.priority ?? "medium",
        category: t.manual?.category ?? null,
        triageStatus: t.manual ? "manual" : withAi ? "pending" : "unavailable",
        requesterId: userIds.get(t.requester)!,
        assigneeId: t.assignee ? userIds.get(t.assignee)! : null,
        createdAt: created,
        updatedAt: lastAt,
        lastMessageAt: lastAt,
      })
      .returning();
    await db.insert(schema.ticketMessages).values(
      t.messages.map((m, i) => ({
        ticketId: ticket!.id,
        orgId,
        authorId: userIds.get(m.from)!,
        body: m.body,
        internal: m.internal ?? false,
        createdAt: new Date(created.getTime() + i * 2 * 3600_000),
      })),
    );
    if (!t.manual) toTriage.push(ticket!.id);
  }
  for (const [orgId, n] of seq) {
    await db.update(schema.organizations).set({ ticketSeq: n }).where(inArray(schema.organizations.id, [orgId]));
  }
  console.log(`Seeded ${USERS.length} users, ${ORGS.length} orgs, ${ARTICLES.length} KB articles, ${TICKETS.length} tickets in ${Date.now() - started}ms`);

  // 6. Optional: real AI triage + embeddings through the configured provider.
  if (withAi) {
    for (const orgId of orgIds.values()) console.log(`Embedded ${await embedPendingArticles(orgId)} KB articles`);
    for (const [i, id] of toTriage.entries()) {
      const t0 = Date.now();
      await runTriage(id);
      console.log(`Triaged ${i + 1}/${toTriage.length} in ${Date.now() - t0}ms`);
    }
  }
  console.log("Demo logins (password for all: see README):");
  for (const u of USERS.slice(0, 4)) console.log(`  ${u.email}`);
}

main()
  .then(() => dbHandle().close())
  .catch(async (err) => {
    console.error(err);
    await dbHandle().close();
    process.exit(1);
  });
