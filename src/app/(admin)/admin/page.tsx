import { auth } from "@/server/auth";
import { redirect } from "next/navigation";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.isSuperAdmin) redirect("/");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Admin Central</h1>
      <p className="text-muted-foreground">Painel administrativo.</p>
    </div>
  );
}
