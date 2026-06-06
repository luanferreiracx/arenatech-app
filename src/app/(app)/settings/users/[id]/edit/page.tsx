import { redirect } from "next/navigation";

export default function EditUserPage() {
  redirect("/settings/users");
}
