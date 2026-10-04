import { redirect } from "next/navigation";
import { requireUser } from "@/server/session";
import { listMyWorkspaces } from "@/server/workspaces";

/** Post-login landing: first workspace, or onboarding when there is none. */
export default async function AppIndex() {
  const user = await requireUser();
  const list = await listMyWorkspaces(user.id);
  redirect(list[0] ? `/w/${list[0].slug}/chat` : "/onboarding");
}
