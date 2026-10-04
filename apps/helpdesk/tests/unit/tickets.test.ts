import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { createTicket, getTicketByNumber, listFilters, listTickets, replyToTicket, ticketCounts, updateTicket } from "@/server/tickets";
import { tenant } from "./factories";

describe("tickets service (PGlite integration)", () => {
  it("creates ticket + first message + audit + staff emails in one transaction", async () => {
    const t = await tenant();
    const { ticket, emailIds } = await createTicket(t.customer, { subject: "Charged twice", body: "Two charges on my card" });
    expect(ticket.number).toBe(1);
    expect(ticket.triageStatus).toBe("pending");
    const msgs = await db.select().from(schema.ticketMessages).where(eq(schema.ticketMessages.ticketId, ticket.id));
    expect(msgs).toHaveLength(1);
    const audit = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.targetId, ticket.id));
    expect(audit.map((a) => a.action)).toEqual(["ticket.created"]);
    expect(emailIds).toHaveLength(2); // admin + agent notified
  });

  it("numbers tickets per organization", async () => {
    const a = await tenant();
    const b = await tenant();
    const n1 = (await createTicket(a.customer, { subject: "First one", body: "hello there" })).ticket.number;
    const n2 = (await createTicket(a.customer, { subject: "Second one", body: "hello there" })).ticket.number;
    const m1 = (await createTicket(b.customer, { subject: "Other org", body: "hello there" })).ticket.number;
    expect([n1, n2, m1]).toEqual([1, 2, 1]);
  });

  it("customers only see their own tickets; agents see all", async () => {
    const t = await tenant();
    await createTicket(t.customer, { subject: "Mine", body: "customer ticket" });
    const { ticket: others } = await createTicket(t.other, { subject: "Not mine", body: "someone else" });
    const f = listFilters.parse({});
    expect((await listTickets(t.customer, f)).items.map((i) => i.subject)).toEqual(["Mine"]);
    expect((await listTickets(t.agent, f)).total).toBe(2);
    await expect(getTicketByNumber(t.customer, others.number)).rejects.toMatchObject({ status: 404 });
    await expect(replyToTicket(t.customer, others.number, { body: "hi", internal: false, aiAssisted: false })).rejects.toMatchObject({ status: 404 });
  });

  it("isolates tenants", async () => {
    const a = await tenant();
    const b = await tenant();
    const { ticket } = await createTicket(a.customer, { subject: "Tenant A only", body: "secret" });
    await expect(getTicketByNumber(b.agent, ticket.number)).rejects.toMatchObject({ status: 404 });
    expect((await listTickets(b.agent, listFilters.parse({}))).total).toBe(0);
  });

  it("hides internal notes from customers and blocks customers from writing them", async () => {
    const t = await tenant();
    const { ticket } = await createTicket(t.customer, { subject: "Need help", body: "please help me" });
    await replyToTicket(t.agent, ticket.number, { body: "Internal: check logs", internal: true, aiAssisted: false });
    expect((await getTicketByNumber(t.agent, ticket.number)).messages).toHaveLength(2);
    expect((await getTicketByNumber(t.customer, ticket.number)).messages).toHaveLength(1);
    await expect(replyToTicket(t.customer, ticket.number, { body: "x", internal: true, aiAssisted: false })).rejects.toMatchObject({ status: 403 });
  });

  it("moves status on replies and auto-assigns the replying agent", async () => {
    const t = await tenant();
    const { ticket } = await createTicket(t.customer, { subject: "Status flow", body: "status test" });
    const r1 = await replyToTicket(t.agent, ticket.number, { body: "On it", internal: false, aiAssisted: true });
    let fresh = (await getTicketByNumber(t.agent, ticket.number)).ticket;
    expect(fresh.status).toBe("pending");
    expect(fresh.assigneeId).toBe(t.agent.user.id);
    expect(r1.message.aiAssisted).toBe(true);
    expect(r1.emailIds).toHaveLength(1); // customer notified
    await replyToTicket(t.customer, ticket.number, { body: "Thanks", internal: false, aiAssisted: true });
    fresh = (await getTicketByNumber(t.agent, ticket.number)).ticket;
    expect(fresh.status).toBe("open");
    const last = (await getTicketByNumber(t.agent, ticket.number)).messages.at(-1)!;
    expect(last.aiAssisted).toBe(false); // customers can't flag AI assistance
  });

  it("updates properties, validates assignees and records manual triage", async () => {
    const t = await tenant();
    const { ticket } = await createTicket(t.customer, { subject: "Props", body: "props test" });
    await expect(updateTicket(t.agent, ticket.number, { assigneeId: t.customer.user.id })).rejects.toMatchObject({ status: 400 });
    await expect(updateTicket(t.customer, ticket.number, { status: "closed" })).rejects.toMatchObject({ status: 403 });
    const updated = await updateTicket(t.agent, ticket.number, { priority: "urgent", category: "billing", assigneeId: t.admin.user.id });
    expect(updated).toMatchObject({ priority: "urgent", category: "billing", assigneeId: t.admin.user.id, triageStatus: "manual" });
    const [audit] = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, "ticket.updated"));
    expect(audit!.meta).toMatchObject({ changes: { priority: { from: "medium", to: "urgent" } } });
  });

  it("filters, sorts urgent first and paginates", async () => {
    const t = await tenant();
    for (let i = 0; i < 7; i++) await createTicket(t.customer, { subject: `Ticket number ${i}`, body: "bulk ticket" });
    await updateTicket(t.agent, 3, { priority: "urgent" });
    await updateTicket(t.agent, 5, { status: "resolved" });
    const page1 = await listTickets(t.agent, listFilters.parse({ pageSize: "5" }));
    expect(page1.items[0]!.number).toBe(3);
    expect(page1.total).toBe(6); // resolved excluded from "active"
    expect(page1.totalPages).toBe(2);
    const page2 = await listTickets(t.agent, listFilters.parse({ pageSize: "5", page: "2" }));
    expect(page2.items).toHaveLength(1);
    expect((await listTickets(t.agent, listFilters.parse({ status: "resolved" }))).items.map((i) => i.number)).toEqual([5]);
    expect((await listTickets(t.agent, listFilters.parse({ q: "#4" }))).items.map((i) => i.number)).toEqual([4]);
    expect((await listTickets(t.agent, listFilters.parse({ priority: "urgent" }))).total).toBe(1);
    expect(await ticketCounts(t.agent)).toMatchObject({ open: 6, resolved: 1, unassigned: 6 });
  });

  it("rejects invalid filter values", () => {
    expect(listFilters.safeParse({ status: "deleted" }).success).toBe(false);
    expect(listFilters.safeParse({ pageSize: "1000" }).success).toBe(false);
  });
});
