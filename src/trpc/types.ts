import { type inferRouterInputs, type inferRouterOutputs } from "@trpc/server";

import { type AppRouter } from "@/server/api/root";

/**
 * Tipos inferidos do AppRouter — a fonte de verdade dos contratos tRPC no client.
 *
 * Use no lugar de `as any` quando precisar nomear o tipo de uma resposta/insumo
 * de procedure (props de subcomponente, elemento de `.map`, etc.). Ex.:
 *
 *   type OrderList = RouterOutputs["serviceOrder"]["list"];
 *   type OrderRow = RouterOutputs["serviceOrder"]["list"]["orders"][number];
 *
 * Em muitos casos nem isso e necessario: `useQuery(trpc.x.queryOptions())` ja
 * infere `.data` como `Output | undefined` — basta nao apagar o tipo com `as any`.
 */
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
