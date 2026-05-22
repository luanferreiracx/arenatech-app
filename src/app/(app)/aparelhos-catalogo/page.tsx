import { PageHeader } from "@/components/domain/page-header";
import { DeviceCatalogAdmin } from "./_components/device-catalog-admin";

export const metadata = {
  title: "Catálogo de Aparelhos | Arena Tech",
};

/**
 * Admin do catalogo publico de aparelhos (paridade Laravel
 * AparelhosCatalogoController). Owner gerencia categorias + aparelhos +
 * precos referencia. O catalogo eh exposto publicamente para clientes
 * pesquisarem o que a loja tem disponivel.
 */
export default function AparelhosCatalogoPage() {
  return (
    <div>
      <PageHeader
        title="Catálogo de Aparelhos"
        subtitle="Cadastro de modelos disponíveis no catálogo público da loja"
      />
      <DeviceCatalogAdmin />
    </div>
  );
}
