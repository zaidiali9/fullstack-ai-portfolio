import "server-only";
import { notFound } from "next/navigation";
import { forbidden } from "@portfolio/kit";
import { getSession, requireUser, requireUserApi } from "./session";

export type Role = "owner" | "staff" | "customer";
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
  role: u.role === "owner" || u.role === "staff" ? u.role : "customer",
});

export const isTeam = (u: AppUser) => u.role === "owner" || u.role === "staff";

export async function currentUser(): Promise<AppUser | null> {
  const s = await getSession();
  return s ? asAppUser(s.user) : null;
}

export async function requireCustomer(): Promise<AppUser> {
  return asAppUser(await requireUser());
}

/** Dashboard pages: 404 for customers (no hint the page exists). */
export async function requireTeamPage(): Promise<AppUser> {
  const u = asAppUser(await requireUser());
  if (!isTeam(u)) notFound();
  return u;
}

export async function requireTeam(): Promise<AppUser> {
  const u = asAppUser(await requireUser());
  if (!isTeam(u)) throw forbidden();
  return u;
}

export async function requireTeamApi(): Promise<AppUser> {
  const u = asAppUser(await requireUserApi());
  if (!isTeam(u)) throw forbidden();
  return u;
}

export async function requireUserApiApp(): Promise<AppUser> {
  return asAppUser(await requireUserApi());
}
