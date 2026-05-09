import { PdvClient } from "./_components/pdv-client";
import { createMetadata } from "@/lib/metadata";

export const metadata = createMetadata("PDV");

export default function PdvPage() {
  return <PdvClient />;
}
