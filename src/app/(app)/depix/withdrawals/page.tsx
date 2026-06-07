import { redirect } from "next/navigation";

export const metadata = {
  title: "DePix Wallet | Arena Tech",
};

export default function DepixWithdrawalsPage() {
  redirect("/depix-wallet");
}
