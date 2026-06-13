import { redirect } from "next/navigation";

// "Equipe" foi unificada com a gestão de usuários do tenant em /settings/users.
// Mantém links/bookmarks antigos funcionando.
export default function TeamPage() {
  redirect("/settings/users");
}
