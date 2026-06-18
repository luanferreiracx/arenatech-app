import { isTenantAdmin, type RoleSession } from "@/lib/auth/roles";

/**
 * Mapa de capacidades por papel no modelo binário `admin | operator` (ADR 0053).
 *
 * Contexto: o colapso de 4→2 papéis (#89/#90) jogou TODO o poder do antigo
 * "gerente" para `admin`, deixando o operador preso no nível "vendedor
 * read-only". Para a loja funcionar, o operador (funcionário comum) precisa do
 * back-office do dia a dia. Este arquivo é a fonte única do que cada papel pode,
 * usado tanto no servidor quanto na UI (`use-capabilities`).
 *
 * - Capacidades de OPERADOR: qualquer membro do tenant pode (a procedure já roda
 *   sob `tenantProcedure`, que garante o vínculo). Listadas para a UI saber o
 *   que exibir e para haver um lugar único que descreve a autonomia do operador.
 * - Capacidades de ADMIN: exigem `isTenantAdmin` — curadoria de catálogo, perda
 *   de patrimônio e ações destrutivas/sensíveis.
 */
export type Capability =
  // Operador (funcionário comum) — dia a dia
  | "moveStock" // entrada, saída, ajuste de inventário
  | "manageSuppliers" // cadastrar/editar fornecedor
  | "registerPurchase" // registrar compra de aparelho
  | "importCatalogCsv" // importar produtos via CSV
  // Admin (dono) — curadoria, perda, destrutivo
  | "manageCatalog" // criar/editar/excluir produto, categoria, atributo, variação, foto
  | "disposeStock" // baixa/descarte/bloqueio (perda de patrimônio, irreversível)
  | "deleteSupplier"
  | "cancelPurchase"
  | "changePurchaseDate";

const OPERATOR_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  "moveStock",
  "manageSuppliers",
  "registerPurchase",
  "importCatalogCsv",
]);

/** O usuário pode executar `capability` no tenant indicado? */
export function can(
  session: RoleSession,
  tenantId: string,
  capability: Capability,
): boolean {
  if (OPERATOR_CAPABILITIES.has(capability)) return true;
  return isTenantAdmin(session, tenantId);
}
