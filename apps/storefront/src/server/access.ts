import "server-only";
import { notFound } from "next/navigation";
import { forbidden } from "@portfolio/kit";
import { getSession, requireUser, requireUserApi } from "./session";

export type StoreUser = { id: string; name: string; email: string; role: "admin" | "customer" };

const asStoreUser = (u: { id: string; name: string; email: string; role?: unknown }): StoreUser => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role === "admin" ? "admin" : "customer",
});

export async function currentUser(): Promise<StoreUser | null> {
  const s = await getSession();
  return s ? asStoreUser(s.user) : null;
}

/** Pages: redirect to sign-in when signed out; admin pages 404 for non-admins (no hint they exist). */
export async function requireCustomer() {
  return asStoreUser(await requireUser());
}
export async function requireAdminPage() {
  const u = asStoreUser(await requireUser());
  if (u.role !== "admin") notFound();
  return u;
}
/** Server actions / route handlers. */
export async function requireAdmin() {
  const u = asStoreUser(await requireUser());
  if (u.role !== "admin") throw forbidden();
  return u;
}
export async function requireAdminApi() {
  const u = asStoreUser(await requireUserApi());
  if (u.role !== "admin") throw forbidden();
  return u;
}
