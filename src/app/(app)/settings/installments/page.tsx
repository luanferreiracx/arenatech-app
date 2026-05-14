import { redirect } from "next/navigation";

export const metadata = {
  title: "Taxas de Parcelamento | Arena Tech",
};

/**
 * Installment rules are managed inside Settings > Payment Methods.
 * This page redirects there to avoid a dead-end stub.
 */
export default function InstallmentsPage() {
  redirect("/settings/payment-methods");
}
