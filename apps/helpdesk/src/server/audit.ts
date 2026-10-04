import "server-only";
import { schema } from "@/db";
import type { DB, Tx } from "@/db";

export interface AuditInput {
  orgId: string;
  actorId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  meta?: Record<string, unknown>;
}

/** Append-only audit trail. Call inside the same transaction as the change it describes. */
export async function audit(tx: DB | Tx, e: AuditInput) {
  await tx.insert(schema.auditEvents).values({
    orgId: e.orgId,
    actorId: e.actorId,
    action: e.action,
    targetType: e.targetType ?? null,
    targetId: e.targetId ?? null,
    meta: e.meta ?? null,
  });
}
