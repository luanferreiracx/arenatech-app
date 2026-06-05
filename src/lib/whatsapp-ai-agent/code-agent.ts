import { withAdmin } from "@/server/db";
import { sendTextMessage } from "@/lib/services/whatsapp-service";
import type { WhatsappAiInboundMessage } from "@/lib/whatsapp-ai-agent/evolution-payload";

const DEFAULT_WORKDIR = "/home/deployer/arenatech-app";
const DEFAULT_MODEL = "claude-opus-4-8";

export type CodeAgentDispatchResult = {
  status: "queued";
  executionId: string;
  providerMessageId?: string;
};

function buildOperationalPrompt(task: string): string {
  return `Você está no servidor da Arena Tech, no projeto /home/deployer/arenatech-app.
Leia e siga rigorosamente o CLAUDE.md.
A solicitação veio do dono via WhatsApp, pelo canal Claude Code.
Você pode operar este repositório como Claude Code: ler arquivos, editar, criar branch, rodar testes, abrir PR, acompanhar CI e mergear quando verde.
Siga o fluxo branch → PR → CI → merge → deploy automático.
Não faça push direto na main.
Não exponha secrets.
Não use sudo, não apague dados e não altere .env.production sem confirmação explícita.
Se precisar de subagentes/multitarefas e o ambiente permitir, use-os para acelerar análise/implementação.
Ao final, responda curto para WhatsApp com o que fez, status, PR/CI/deploy e pendências.

Tarefa:
${task}`;
}

export async function dispatchClaudeCodeExecution(params: {
  tenantId: string;
  conversationId: string;
  phone: string;
  instanceName: string;
  message: WhatsappAiInboundMessage;
  task: string;
}): Promise<CodeAgentDispatchResult> {
  const workdir = process.env.WHATSAPP_AI_WORKDIR?.trim() || DEFAULT_WORKDIR;
  const model = process.env.WHATSAPP_AI_CODE_MODEL?.trim() || process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  const prompt = buildOperationalPrompt(params.task);

  const execution = await withAdmin(async (tx) => tx.whatsappAiExecution.create({
    data: {
      tenantId: params.tenantId,
      conversationId: params.conversationId,
      status: "queued",
      prompt,
      workdir,
      model,
    },
    select: { id: true },
  }));

  await withAdmin(async (tx) => tx.whatsappAiMessage.create({
    data: {
      tenantId: params.tenantId,
      conversationId: params.conversationId,
      role: "assistant",
      content: `Recebi. Vou executar no Claude Code e te aviso aqui.\nExecução: ${execution.id}`,
      metadata: { agentKind: "claude_code", command: "run", executionId: execution.id },
    },
  }));

  const sendResult = await sendTextMessage(
    params.phone,
    `Recebi. Vou executar no Claude Code e te aviso aqui.\nExecução: ${execution.id}`,
    { instanceName: params.instanceName },
  );

  return { status: "queued", executionId: execution.id, providerMessageId: sendResult.messageId };
}
