import { redirect } from "next/navigation";

export const metadata = {
  title: "Novo Saque DePix | Arena Tech",
};

export default function NewWithdrawPage() {
  redirect("/depix-wallet/withdraw");
}
