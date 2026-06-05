#!/usr/bin/env tsx

/**
 * Worker host-side do agente Claude Code via WhatsApp.
 *
 * Roda fora do container do app, no servidor, com acesso ao checkout completo em
 * /home/deployer/arenatech-app e ao binário ~/.local/bin/claude.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { withAdmin } from "../src/server/db";
import { sendTextMessage } from "../src/lib/services/whatsapp-service";

const execFileAsync = promisify(execFile);
const DEFAULT_CLAUDE_BIN = "/home/deployer/.local/bin/claude";
const DEFAULT_TIMEOUT_MS = 900_000;
const DEFAULT_MAX_OUTPUT_CHARS = 3500;

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 80)}\n\n… saída truncada (${text.length} caracteres).`;
}

async function runExecution(executionId: string): Promise<void> {
  const started = await withAdmin(async (tx) => {
    const execution = await tx.whatsappAiExecution.findUnique({
      where: { id: executionId },
      include: { conversation: true },
    });
    if (!execution || execution.status !== "queued") return null;

    await tx.whatsappAiExecution.update({
      where: { id: execution.id },
      data: { status: "running", startedAt: new Date() },
    });
    return execution;
  });

  if (!started) return;

  const claudeBin = process.env.WHATSAPP_AI_CLAUDE_BIN?.trim() || DEFAULT_CLAUDE_BIN;
  const timeout = Number(process.env.WHATSAPP_AI_EXECUTION_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const maxOutput = Number(process.env.WHATSAPP_AI_EXECUTION_MAX_OUTPUT_CHARS ?? DEFAULT_MAX_OUTPUT_CHARS);

  try {
    const { stdout, stderr } = await execFileAsync(
      claudeBin,
      ["--print", started.prompt],
      {
        cwd: started.workdir,
        timeout,
        env: {
          ...process.env,
          ANTHROPIC_MODEL: started.model ?? process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8",
          CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
        },
      },
    );

    const output = truncate((stdout || stderr || "Execução concluída sem saída.").trim(), maxOutput);

    await withAdmin(async (tx) => {
      await tx.whatsappAiExecution.update({
        where: { id: started.id },
        data: {
          status: "completed",
          resultSummary: output,
          finishedAt: new Date(),
        },
      });
      await tx.whatsappAiMessage.create({
        data: {
          tenantId: started.tenantId,
          conversationId: started.conversationId,
          role: "assistant",
          content: output,
          metadata: { agentKind: "claude_code", executionId: started.id, status: "completed" },
        },
      });
    });

    await sendTextMessage(started.conversation.phone, output, { instanceName: started.conversation.instanceName });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const output = truncate(`Falha na execução Claude Code: ${message}`, maxOutput);

    await withAdmin(async (tx) => {
      await tx.whatsappAiExecution.update({
        where: { id: started.id },
        data: {
          status: message.toLowerCase().includes("timeout") ? "timed_out" : "failed",
          errorMessage: message,
          finishedAt: new Date(),
        },
      });
      await tx.whatsappAiMessage.create({
        data: {
          tenantId: started.tenantId,
          conversationId: started.conversationId,
          role: "assistant",
          content: output,
          metadata: { agentKind: "claude_code", executionId: started.id, status: "failed" },
        },
      });
    });

    await sendTextMessage(started.conversation.phone, output, { instanceName: started.conversation.instanceName });
  }
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  const intervalMs = Number(process.env.WHATSAPP_AI_WORKER_INTERVAL_MS ?? 5000);

  do {
    const queued = await withAdmin(async (tx) => tx.whatsappAiExecution.findMany({
      where: { status: "queued" },
      orderBy: { createdAt: "asc" },
      take: 1,
      select: { id: true },
    }));

    for (const execution of queued) {
      await runExecution(execution.id);
    }

    if (once) break;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  } while (true);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
