import { randomUUID } from "node:crypto";
import { db, schema } from "@/db";
import type { WorkspaceRole } from "@db/schema";
import type { WsContext } from "@/server/authz";
import { newWidgetKey } from "@/server/workspaces";

export async function makeUser(name = "Test User") {
  const id = randomUUID();
  const [u] = await db.insert(schema.user).values({ id, name, email: `${id.slice(0, 8)}@test.demo`, emailVerified: true }).returning();
  return u!;
}

export async function makeWorkspace(overrides: Partial<typeof schema.workspaces.$inferInsert> = {}) {
  const [ws] = await db
    .insert(schema.workspaces)
    .values({ name: "WS", slug: `ws-${randomUUID().slice(0, 8)}`, widgetKey: newWidgetKey(), ...overrides })
    .returning();
  return ws!;
}

export async function ctxFor(ws: typeof schema.workspaces.$inferSelect, role: WorkspaceRole): Promise<WsContext> {
  const user = await makeUser(`${role} user`);
  await db.insert(schema.workspaceMembers).values({ workspaceId: ws.id, userId: user.id, role });
  return { user, ws, role };
}

export async function team(overrides: Partial<typeof schema.workspaces.$inferInsert> = {}) {
  const ws = await makeWorkspace(overrides);
  return { ws, owner: await ctxFor(ws, "owner"), editor: await ctxFor(ws, "editor"), viewer: await ctxFor(ws, "viewer") };
}

/** A File-like upload for services that accept browser File objects. */
export const file = (name: string, content: string | Buffer, type = "text/plain") => new File([new Uint8Array(typeof content === "string" ? Buffer.from(content) : content)], name, { type });
