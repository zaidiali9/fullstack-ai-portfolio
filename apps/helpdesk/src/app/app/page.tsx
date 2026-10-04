import { redirect } from "next/navigation";
import { listMyOrgs } from "@/server/orgs";
import { requireUser } from "@/server/session";

/** Post-login landing: go to the first organization, or onboarding if there is none. */
export default async function AppIndex() {
  const user = await requireUser();
  const orgs = await listMyOrgs(user.id);
  redirect(orgs[0] ? `/o/${orgs[0].slug}/tickets` : "/onboarding");
}
