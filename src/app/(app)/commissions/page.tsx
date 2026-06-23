import { redirect } from "next/navigation";

// O sistema de comissoes agora e o de Prestadores (ADR 0056 — legado removido).
export default function CommissionsPage() {
  redirect("/commissions/providers");
}
