import { redirect } from "next/navigation";

export default async function WorkspaceIndex({ params }: PageProps<"/w/[ws]">) {
  const { ws } = await params;
  redirect(`/w/${ws}/chat`);
}
