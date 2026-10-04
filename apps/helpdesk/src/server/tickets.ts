import "server-only";
import { and, asc, count, desc, eq, getTableColumns, ilike, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { HttpError, notFound as notFoundError, paginate, type Page } from "@portfolio/kit";
import { db, schema } from "@/db";
import type { Ticket } from "@db/schema";
import { env } from "@/lib/env";
import { audit } from "./audit";
import type { OrgContext } from "./authz";
import { queueEmails } from "./email";
import { can } from "./permissions";

/* ---------------------------------------------------------------- validation */

export const ticketStatusValues = schema.ticketStatus.enumValues;
export const ticketPriorityValues = schema.ticketPriority.enumValues;
export const ticketCategoryValues = schema.ticketCategory.enumValues;

export const createTicketInput = z.object({
  subject: z.string().trim().min(5, "Please add a short subject (5+ characters)").max(160),
  body: z.string().trim().min(10, "Please describe the issue (10+ characters)").max(10_000),
});

export const replyInput = z.object({
  body: z.string().trim().min(1, "Reply can't be empty").max(10_000),
  internal: z.coerce.boolean().default(false),
  aiAssisted: z.coerce.boolean().default(false),
});

export const updateTicketInput = z
  .object({
    status: z.enum(ticketStatusValues).optional(),
    priority: z.enum(ticketPriorityValues).optional(),
    category: z.enum(ticketCategoryValues).optional(),
    assigneeId: z.string().min(1).nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to update");

export const listFilters = z.object({
  status: z.enum([...ticketStatusValues, "active", "all"]).default("active"),
  priority: z.enum(ticketPriorityValues).optional(),
  category: z.enum(ticketCategoryValues).optional(),
  assignee: z.union([z.literal("me"), z.literal("unassigned"), z.string().min(1)]).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});
export type ListFilters = z.infer<typeof listFilters>;

/* ---------------------------------------------------------------- queries */

const requester = alias(schema.user, "requester");
const assignee = alias(schema.user, "assignee");

export interface TicketListItem {
  id: string;
  number: number;
  subject: string;
  status: Ticket["status"];
  priority: Ticket["priority"];
  category: Ticket["category"];
  sentiment: Ticket["sentiment"];
  triageStatus: Ticket["triageStatus"];
  aiSummary: string | null;
  lastMessageAt: Date;
  createdAt: Date;
  requesterName: string;
  assigneeName: string | null;
}

/** Customers only ever see their own tickets; agents/admins see the whole org. */
function visibility(ctx: OrgContext): SQL | undefined {
  return can(ctx.role, "ticket:read:all") ? undefined : eq(schema.tickets.requesterId, ctx.user.id);
}

export async function listTickets(ctx: OrgContext, f: ListFilters): Promise<Page<TicketListItem>> {
  const t = schema.tickets;
  const where = and(
    eq(t.orgId, ctx.org.id),
    visibility(ctx),
    f.status === "active" ? inArray(t.status, ["open", "pending"]) : f.status === "all" ? undefined : eq(t.status, f.status),
    f.priority ? eq(t.priority, f.priority) : undefined,
    f.category ? eq(t.category, f.category) : undefined,
    f.assignee === "me" ? eq(t.assigneeId, ctx.user.id) : f.assignee === "unassigned" ? isNull(t.assigneeId) : f.assignee ? eq(t.assigneeId, f.assignee) : undefined,
    f.q ? (/^#?\d+$/.test(f.q) ? eq(t.number, Number(f.q.replace("#", ""))) : ilike(t.subject, `%${f.q}%`)) : undefined,
  );
  // Urgent first, then most recent activity. One joined query + one count query (no N+1).
  const priorityRank = sql`case ${t.priority} when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end`;
  const [items, [total]] = await Promise.all([
    db
      .select({
        id: t.id,
        number: t.number,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        category: t.category,
        sentiment: t.sentiment,
        triageStatus: t.triageStatus,
        aiSummary: t.aiSummary,
        lastMessageAt: t.lastMessageAt,
        createdAt: t.createdAt,
        requesterName: requester.name,
        assigneeName: assignee.name,
      })
      .from(t)
      .innerJoin(requester, eq(t.requesterId, requester.id))
      .leftJoin(assignee, eq(t.assigneeId, assignee.id))
      .where(where)
      .orderBy(asc(priorityRank), desc(t.lastMessageAt))
      .limit(f.pageSize)
      .offset((f.page - 1) * f.pageSize),
    db.select({ n: count() }).from(t).where(where),
  ]);
  return paginate(items, total?.n ?? 0, f.page, f.pageSize);
}

export async function ticketCounts(ctx: OrgContext) {
  const rows = await db
    .select({ status: schema.tickets.status, n: count() })
    .from(schema.tickets)
    .where(and(eq(schema.tickets.orgId, ctx.org.id), visibility(ctx)))
    .groupBy(schema.tickets.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<Ticket["status"], number>>;
  const [unassigned] = can(ctx.role, "ticket:read:all")
    ? await db
        .select({ n: count() })
        .from(schema.tickets)
        .where(and(eq(schema.tickets.orgId, ctx.org.id), isNull(schema.tickets.assigneeId), inArray(schema.tickets.status, ["open", "pending"])))
    : [{ n: 0 }];
  return { open: by.open ?? 0, pending: by.pending ?? 0, resolved: by.resolved ?? 0, closed: by.closed ?? 0, unassigned: unassigned?.n ?? 0 };
}

export async function getTicketByNumber(ctx: OrgContext, number: number) {
  const t = schema.tickets;
  const [row] = await db
    .select({ ticket: getTableColumns(t), requesterName: requester.name, requesterEmail: requester.email, assigneeName: assignee.name })
    .from(t)
    .innerJoin(requester, eq(t.requesterId, requester.id))
    .leftJoin(assignee, eq(t.assigneeId, assignee.id))
    .where(and(eq(t.orgId, ctx.org.id), eq(t.number, number), visibility(ctx)))
    .limit(1);
  if (!row) throw notFoundError("Ticket");
  const showInternal = can(ctx.role, "ticket:note");
  const messages = await db
    .select({
      id: schema.ticketMessages.id,
      body: schema.ticketMessages.body,
      internal: schema.ticketMessages.internal,
      aiAssisted: schema.ticketMessages.aiAssisted,
      createdAt: schema.ticketMessages.createdAt,
      authorId: schema.ticketMessages.authorId,
      authorName: schema.user.name,
    })
    .from(schema.ticketMessages)
    .innerJoin(schema.user, eq(schema.ticketMessages.authorId, schema.user.id))
    .where(and(eq(schema.ticketMessages.ticketId, row.ticket.id), showInternal ? undefined : eq(schema.ticketMessages.internal, false)))
    .orderBy(asc(schema.ticketMessages.createdAt));
  return { ...row, messages: messages.map((m) => ({ ...m, fromCustomer: m.authorId === row.ticket.requesterId })) };
}

export async function listAssignableMembers(orgId: string) {
  return db
    .select({ id: schema.user.id, name: schema.user.name, role: schema.memberships.role })
    .from(schema.memberships)
    .innerJoin(schema.user, eq(schema.memberships.userId, schema.user.id))
    .where(and(eq(schema.memberships.orgId, orgId), ne(schema.memberships.role, "customer")))
    .orderBy(asc(schema.user.name));
}

/* ---------------------------------------------------------------- mutations */

const ticketUrl = (orgSlug: string, n: number) => `${env().APP_URL}/o/${orgSlug}/tickets/${n}`;

async function staffEmails(orgId: string) {
  return db
    .select({ email: schema.user.email })
    .from(schema.memberships)
    .innerJoin(schema.user, eq(schema.memberships.userId, schema.user.id))
    .where(and(eq(schema.memberships.orgId, orgId), or(eq(schema.memberships.role, "admin"), eq(schema.memberships.role, "agent"))));
}

/** Create ticket + first message + audit + notifications in one transaction. */
export async function createTicket(ctx: OrgContext, input: z.infer<typeof createTicketInput>) {
  const staff = await staffEmails(ctx.org.id);
  return db.transaction(async (tx) => {
    const [seq] = await tx
      .update(schema.organizations)
      .set({ ticketSeq: sql`${schema.organizations.ticketSeq} + 1` })
      .where(eq(schema.organizations.id, ctx.org.id))
      .returning({ n: schema.organizations.ticketSeq });
    const [ticket] = await tx
      .insert(schema.tickets)
      .values({ orgId: ctx.org.id, number: seq!.n, subject: input.subject, requesterId: ctx.user.id })
      .returning();
    await tx.insert(schema.ticketMessages).values({ ticketId: ticket!.id, orgId: ctx.org.id, authorId: ctx.user.id, body: input.body });
    await audit(tx, { orgId: ctx.org.id, actorId: ctx.user.id, action: "ticket.created", targetType: "ticket", targetId: ticket!.id, meta: { number: ticket!.number } });
    const emailIds = await queueEmails(
      tx,
      ctx.org.id,
      staff
        .filter((s) => s.email !== ctx.user.email)
        .map((s) => ({
          to: s.email,
          subject: `[${ctx.org.name}] New ticket #${ticket!.number}: ${input.subject}`,
          text: `${ctx.user.name} opened a new ticket.\n\n${input.body.slice(0, 1000)}\n\nView: ${ticketUrl(ctx.org.slug, ticket!.number)}`,
        })),
    );
    return { ticket: ticket!, emailIds };
  });
}

export async function replyToTicket(ctx: OrgContext, number: number, input: z.infer<typeof replyInput>) {
  if (input.internal && !can(ctx.role, "ticket:note")) throw new HttpError(403, "forbidden", "Only agents can add internal notes.");
  const { ticket, requesterEmail } = await getTicketByNumber(ctx, number); // enforces visibility
  const isStaff = can(ctx.role, "ticket:update");
  const assigneeEmail = ticket.assigneeId
    ? (await db.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.id, ticket.assigneeId)).limit(1))[0]?.email
    : undefined;
  return db.transaction(async (tx) => {
    const [msg] = await tx
      .insert(schema.ticketMessages)
      .values({ ticketId: ticket.id, orgId: ctx.org.id, authorId: ctx.user.id, body: input.body, internal: input.internal, aiAssisted: input.aiAssisted && isStaff })
      .returning();
    // Agent public reply -> waiting on customer (pending). Customer reply -> back to open.
    const nextStatus = input.internal ? ticket.status : isStaff ? "pending" : "open";
    await tx
      .update(schema.tickets)
      .set({ lastMessageAt: new Date(), status: nextStatus, ...(isStaff && !ticket.assigneeId && !input.internal ? { assigneeId: ctx.user.id } : {}) })
      .where(eq(schema.tickets.id, ticket.id));
    await audit(tx, {
      orgId: ctx.org.id,
      actorId: ctx.user.id,
      action: input.internal ? "ticket.note_added" : "ticket.replied",
      targetType: "ticket",
      targetId: ticket.id,
      meta: { number, aiAssisted: msg!.aiAssisted },
    });
    let emails: { to: string; subject: string; text: string }[] = [];
    if (!input.internal && isStaff) {
      emails = [{ to: requesterEmail, subject: `Re: [#${number}] ${ticket.subject}`, text: `${input.body}\n\n— ${ctx.user.name}, ${ctx.org.name}\nView the conversation: ${ticketUrl(ctx.org.slug, number)}` }];
    } else if (!isStaff) {
      const to = assigneeEmail ? [{ email: assigneeEmail }] : await staffEmails(ctx.org.id);
      emails = to.map((s) => ({ to: s.email, subject: `Customer replied on #${number}: ${ticket.subject}`, text: `${ctx.user.name} wrote:\n\n${input.body.slice(0, 1000)}\n\nView: ${ticketUrl(ctx.org.slug, number)}` }));
    }
    const emailIds = await queueEmails(tx, ctx.org.id, emails);
    return { message: msg!, emailIds };
  });
}

export async function updateTicket(ctx: OrgContext, number: number, patch: z.infer<typeof updateTicketInput>) {
  if (!can(ctx.role, "ticket:update")) throw new HttpError(403, "forbidden", "Only agents can update tickets.");
  const { ticket } = await getTicketByNumber(ctx, number);
  if (patch.assigneeId) {
    const members = await listAssignableMembers(ctx.org.id);
    if (!members.some((m) => m.id === patch.assigneeId)) throw new HttpError(400, "invalid_assignee", "Tickets can only be assigned to agents or admins of this organization.");
  }
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of ["status", "priority", "category", "assigneeId"] as const) {
    if (patch[key] !== undefined && patch[key] !== ticket[key]) changes[key] = { from: ticket[key], to: patch[key] };
  }
  if (Object.keys(changes).length === 0) return ticket;
  const manualTriage = changes.priority || changes.category;
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(schema.tickets)
      .set({ ...patch, ...(manualTriage ? { triageStatus: "manual" as const } : {}) })
      .where(eq(schema.tickets.id, ticket.id))
      .returning();
    await audit(tx, { orgId: ctx.org.id, actorId: ctx.user.id, action: "ticket.updated", targetType: "ticket", targetId: ticket.id, meta: { number, changes } });
    return updated!;
  });
}
