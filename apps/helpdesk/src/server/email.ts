import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db, schema, type DB, type Tx } from "@/db";
import { env } from "@/lib/env";

export interface EmailInput {
  to: string;
  subject: string;
  text: string;
}

/**
 * Email-style notifications go through an outbox table inside the caller's transaction.
 * Without SMTP_URL they stay "logged" (visible in Settings → Emails). With SMTP_URL (e.g. Mailpit
 * at smtp://localhost:1025) `deliverPending` sends them after the transaction commits.
 */
export async function queueEmails(tx: DB | Tx, orgId: string | null, emails: EmailInput[]): Promise<string[]> {
  if (emails.length === 0) return [];
  const rows = await tx
    .insert(schema.emailOutbox)
    .values(emails.map((e) => ({ orgId, to: e.to, subject: e.subject.slice(0, 200), text: e.text.slice(0, 10_000), status: "logged" as const })))
    .returning({ id: schema.emailOutbox.id });
  return rows.map((r) => r.id);
}

export async function deliverPending(ids: string[]) {
  const smtp = env().SMTP_URL;
  if (!smtp || ids.length === 0) return;
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport(smtp);
  const rows = await db.select().from(schema.emailOutbox).where(inArray(schema.emailOutbox.id, ids));
  for (const row of rows) {
    try {
      await transport.sendMail({ from: env().EMAIL_FROM, to: row.to, subject: row.subject, text: row.text });
      await db.update(schema.emailOutbox).set({ status: "sent" }).where(eq(schema.emailOutbox.id, row.id));
    } catch (err) {
      await db.update(schema.emailOutbox).set({ status: "failed", error: String(err).slice(0, 500) }).where(eq(schema.emailOutbox.id, row.id));
    }
  }
}
