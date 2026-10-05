import "server-only";
import { notFound } from "next/navigation";
import { forbidden } from "@portfolio/kit";
import { getSession, requireUser, requireUserApi } from "./session";

export type Role = "admin" | "analyst";
export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export const asAppUser = (u: { id: string; name: string; email: string; role?: unknown }): AppUser => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role === "admin" ? "admin" : "analyst",
});

export async function currentUser(): Promise<AppUser | null> {
  const s = await getSession();
  return s ? asAppUser(s.user) : null;
}

/** Pages and server actions: redirect to sign-in when signed out. */
export async function requireAppUser(): Promise<AppUser> {
  return asAppUser(await requireUser());
}

/** Route handlers: 401 when signed out. */
export async function requireAppUserApi(): Promise<AppUser> {
  return asAppUser(await requireUserApi());
}

/** Admin pages: 404 for everyone else (no hint the page exists). */
export async function requireAdminPage(): Promise<AppUser> {
  const u = await requireAppUser();
  if (u.role !== "admin") notFound();
  return u;
}

export function assertAdmin(u: AppUser) {
  if (u.role !== "admin") throw forbidden();
}
