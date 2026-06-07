import { redirect } from "next/navigation";

export const metadata = {
  title: "DePix Wallet | Arena Tech",
};

export default function WithdrawDetailPage() {
  redirect("/depix-wallet");
}
