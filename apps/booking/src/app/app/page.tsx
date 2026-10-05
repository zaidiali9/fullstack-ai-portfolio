import { redirect } from "next/navigation";
import { isTeam, requireCustomer } from "@/server/access";

/** Post-sign-in landing: team members go to the calendar, customers to their bookings. */
export default async function AppHome() {
  const user = await requireCustomer();
  redirect(isTeam(user) ? "/dashboard" : "/my");
}
