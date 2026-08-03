/**
 * Verificação periódica das credenciais do WhatsApp Cloud (uma por tenant).
 *
 * Por que precisa ser periódica: credencial de terceiro APODRECE sozinha. O
 * token da Meta expira (24h no temporário, 60 dias no de usuário — só o de
 * system user é permanente), pode ser revogado no Business Manager por outra
 * pessoa, e o número pode perder a verificação. Nada disso gera evento nosso.
 * Sem checar, o primeiro sinal é o bot parar de responder ao cliente da loja —
 * e quem descobre é o cliente, não a loja.
 *
 * Desenho em duas etapas, como o dunning: checar (rede) e depois gravar/avisar.
 * A chamada à Meta NUNCA acontece dentro de transação — I/O de rede segurando
 * conexão de banco transforma lentidão do provedor em rollback.
 *
 * Nunca lança por causa de UM tenant: o cron varre todos, e a credencial
 * quebrada de um não pode impedir a checagem dos outros.
 */
import type { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/services/email-service";
import { escapeHtml } from "@/lib/utils/html";
import { checkCloudCredentials } from "@/lib/services/whatsapp-credential-check";
import { readCloudCredential } from "@/lib/services/whatsapp-tenant-config";
import {
  shouldNotifyBrokenCredential,
  shouldNotifyRecovery,
} from "@/lib/services/whatsapp-health-policy";

const HEALTH_EMAIL_FROM = "Arena Tech <contato@pdvdepix.app>";

export type HealthCheckSummary = {
  checked: number;
  ok: number;
  broken: number;
  recovered: number;
  notified: number;
  skipped: number;
};

/** Integração a verificar, já com o que a decisão precisa. */
type Candidate = {
  integrationId: string;
  tenantId: string;
  tenantName: string;
  config: Prisma.JsonValue;
  previousReason: string | null;
  previousHealthOk: boolean | null;
  notifiedAt: Date | null;
};

/**
 * Integrações WhatsApp Cloud HABILITADAS. Desabilitada não se verifica: o
 * tenant desligou de propósito, e avisá-lo de uma credencial que ele não usa
 * seria ruído.
 */
export async function listCloudIntegrations(
  tx: Prisma.TransactionClient,
): Promise<Candidate[]> {
  const rows = await tx.tenantIntegration.findMany({
    where: { provider: "WHATSAPP_CLOUD", enabled: true },
    select: {
      id: true,
      tenantId: true,
      config: true,
      healthReason: true,
      healthOk: true,
      healthNotifiedAt: true,
    },
  });
  if (rows.length === 0) return [];

  const tenants = await tx.tenant.findMany({
    where: { id: { in: rows.map((r) => r.tenantId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(tenants.map((t) => [t.id, t.name]));

  return rows.map((r) => ({
    integrationId: r.id,
    tenantId: r.tenantId,
    tenantName: nameById.get(r.tenantId) ?? "sua loja",
    config: r.config,
    previousReason: r.healthReason,
    previousHealthOk: r.healthOk,
    notifiedAt: r.healthNotifiedAt,
  }));
}

function brokenEmailHtml(tenantName: string, message: string, appUrl: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.6;color:#111">
<h2 style="margin:0 0 12px">O WhatsApp de ${escapeHtml(tenantName)} parou de funcionar</h2>
<p>${escapeHtml(message)}</p>
<p>Enquanto isso, as mensagens automáticas não são entregues aos seus clientes.</p>
<p><a href="${appUrl}/settings/whatsapp" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:6px">Corrigir agora</a></p>
<p style="margin-top:24px;font-size:12px;color:#666">Arena Tech</p>
</body></html>`;
}

/**
 * Verifica todas as integrações e grava o resultado, avisando quem precisa
 * saber. Recebe `tx` só para LER e GRAVAR — a chamada à Meta acontece fora.
 */
export async function runCloudHealthCheck(deps: {
  candidates: Candidate[];
  now: Date;
  appUrl: string;
  /** Grava o resultado da verificação de UMA integração. */
  persist: (
    integrationId: string,
    data: {
      healthCheckedAt: Date;
      healthOk: boolean;
      healthReason: string | null;
      healthNotifiedAt?: Date | null;
    },
  ) => Promise<void>;
  /** E-mails dos admins de um tenant. */
  recipients: (tenantId: string) => Promise<string[]>;
}): Promise<HealthCheckSummary> {
  const summary: HealthCheckSummary = {
    checked: 0,
    ok: 0,
    broken: 0,
    recovered: 0,
    notified: 0,
    skipped: 0,
  };

  for (const candidate of deps.candidates) {
    const credential = readCloudCredential(candidate.config);
    if (!credential) {
      // Config sem o formato esperado: não há o que verificar. Não é falha da
      // credencial — é ausência dela.
      summary.skipped++;
      logger.warn("WhatsApp health: integração sem credencial legível", {
        tenantId: candidate.tenantId,
      });
      continue;
    }

    summary.checked++;
    const result = await checkCloudCredentials({
      token: credential.token,
      phoneNumberId: credential.phoneNumberId,
    });

    if (result.ok) {
      const recovery = shouldNotifyRecovery({
        // Só avisa recuperação para quem soube da quebra.
        previouslyNotified: candidate.previousHealthOk === false && !!candidate.notifiedAt,
      });
      summary.ok++;
      if (recovery.notify) summary.recovered++;

      await deps.persist(candidate.integrationId, {
        healthCheckedAt: deps.now,
        healthOk: true,
        healthReason: null,
        // Limpa o carimbo: se quebrar de novo, o próximo aviso sai na hora.
        healthNotifiedAt: null,
      });

      if (recovery.notify) {
        for (const to of await deps.recipients(candidate.tenantId)) {
          const sent = await sendEmail({
            to,
            subject: "Seu WhatsApp voltou a funcionar",
            html: `<p>A conexão do WhatsApp de <strong>${escapeHtml(candidate.tenantName)}</strong> foi restabelecida. As mensagens automáticas voltaram a ser entregues.</p>`,
            from: HEALTH_EMAIL_FROM,
          });
          if (!sent.success) {
            logger.error("WhatsApp health: aviso de recuperação não saiu", {
              tenantId: candidate.tenantId,
              error: sent.error,
            });
          }
        }
      }
      continue;
    }

    // Falhou. A rede fora NÃO conta como credencial quebrada — culpar a
    // credencial de um problema nosso faria o lojista trocar um token correto.
    if (result.reason === "network_error") {
      summary.skipped++;
      logger.warn("WhatsApp health: não alcançou a Meta — sem veredito", {
        tenantId: candidate.tenantId,
      });
      continue;
    }

    summary.broken++;
    const decision = shouldNotifyBrokenCredential({
      now: deps.now,
      reason: result.reason,
      previousReason: candidate.previousReason,
      notifiedAt: candidate.notifiedAt,
    });

    await deps.persist(candidate.integrationId, {
      healthCheckedAt: deps.now,
      healthOk: false,
      healthReason: result.reason,
      ...(decision.notify ? { healthNotifiedAt: deps.now } : {}),
    });

    logger.warn("WhatsApp health: credencial quebrada", {
      tenantId: candidate.tenantId,
      reason: result.reason,
      notify: decision.notify,
      rationale: decision.rationale,
    });

    if (!decision.notify) continue;

    let anySent = false;
    for (const to of await deps.recipients(candidate.tenantId)) {
      const sent = await sendEmail({
        to,
        subject: `Ação necessária: o WhatsApp de ${candidate.tenantName} parou`,
        html: brokenEmailHtml(candidate.tenantName, result.message, deps.appUrl),
        from: HEALTH_EMAIL_FROM,
      });
      if (sent.success) anySent = true;
      else
        logger.error("WhatsApp health: aviso não saiu", {
          tenantId: candidate.tenantId,
          error: sent.error,
        });
    }
    if (anySent) summary.notified++;
  }

  return summary;
}
