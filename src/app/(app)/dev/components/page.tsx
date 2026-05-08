import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { ComponentsCatalog } from "./components-catalog";

export default async function DevComponentsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  // Only available in non-production or for super admins
  if (
    process.env.NODE_ENV === "production" &&
    !session.user.isSuperAdmin
  ) {
    redirect("/");
  }

  return <ComponentsCatalog />;
}
