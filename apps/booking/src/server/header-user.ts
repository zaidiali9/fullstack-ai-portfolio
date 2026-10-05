import "server-only";
import type { HeaderUser } from "@/components/site/header";
import { currentUser } from "./access";
import { listNotifications } from "./bookings";

export async function headerUser(): Promise<HeaderUser | null> {
  const u = await currentUser();
  if (!u) return null;
  const { unread } = await listNotifications(u, 1);
  return { name: u.name, role: u.role, unread };
}
