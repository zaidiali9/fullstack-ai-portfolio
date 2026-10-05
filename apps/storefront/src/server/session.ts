import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { unauthorized } from "@portfolio/kit";
import { auth } from "@/lib/auth";

/** Current session (deduplicated per request). */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

/** For pages and server actions: redirect to sign-in when signed out. */
export async function requireUser() {
  const s = await getSession();
  if (!s) redirect("/sign-in");
  return s.user;
}

/** For route handlers: throw 401 when signed out. */
export async function requireUserApi() {
  const s = await getSession();
  if (!s) throw unauthorized();
  return s.user;
}
