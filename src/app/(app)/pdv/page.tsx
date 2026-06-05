import { Suspense } from "react";
import { PdvScreen } from "./_components/pdv-screen";

export const metadata = {
  title: "PDV | Arena Tech",
};

export default function PdvPage() {
  return (
    <Suspense fallback={null}>
      <PdvScreen />
    </Suspense>
  );
}
