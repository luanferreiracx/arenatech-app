/**
 * Registry das tools do Talison — fonte única do que o agente pode fazer.
 * Adicionar capacidade = adicionar uma TalisonTool aqui.
 */

import type { LlmToolDefinition } from "@/lib/talison/types";
import { toToolDefinition, type TalisonTool } from "@/lib/talison/tools/contract";
import { consultarStatusOs, verificarGarantia } from "@/lib/talison/tools/service-order";
import { estimarOrcamento, listarServicos } from "@/lib/talison/tools/catalog";
import { buscarCliente } from "@/lib/talison/tools/customer";
import { consultarAvaliacao } from "@/lib/talison/tools/valuation";
import { buscarAparelho, buscarAcessorio } from "@/lib/talison/tools/stock";
import { qualificarLead, transferirParaHumano } from "@/lib/talison/tools/handoff";

export const TALISON_TOOLS: readonly TalisonTool[] = [
  consultarStatusOs,
  verificarGarantia,
  estimarOrcamento,
  listarServicos,
  buscarCliente,
  consultarAvaliacao,
  buscarAparelho,
  buscarAcessorio,
  qualificarLead,
  transferirParaHumano,
];

const TOOLS_BY_NAME = new Map(TALISON_TOOLS.map((tool) => [tool.name, tool]));

export function getTool(name: string): TalisonTool | undefined {
  return TOOLS_BY_NAME.get(name);
}

/** Definições no formato que o modelo recebe (derivadas dos schemas Zod). */
export function getToolDefinitions(): LlmToolDefinition[] {
  return TALISON_TOOLS.map(toToolDefinition);
}
