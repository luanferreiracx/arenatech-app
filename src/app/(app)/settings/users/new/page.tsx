import { redirect } from "next/navigation";

export default function NewUserPage() {
  redirect("/settings/users");
}
