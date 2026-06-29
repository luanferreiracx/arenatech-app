/**
 * Emissão / validação / revogação de API-keys de PARCEIRO (ADR 0057, Fase 1).
 *
 * Formato da key: `at_<prefix>_<secret>`
 *   - `prefix` (8 chars base62): público, indexado, localiza o registro O(1).
 *   - `secret` (32 bytes → base64url): aleatório CSPRNG, mostrado UMA vez.
 * Guardamos só o `keyHash` = bcrypt da key COMPLETA (`at_<prefix>_<secret>`) e o
 * `keyPrefix` em claro. Validação: parse do prefix → lookup → bcrypt-compare.
 */
import { randomBytes } from "node:crypto";
import { compareSync, hashSync } from "bcryptjs";
import { withAdmin, withTenant } from "@/server/db";
import { logger } from "@/lib/logger";
import { isValidScope, type PartnerScope } from "@/lib/partner-api/scopes";

const KEY_BCRYPT_COST = 12;
const PREFIX_LEN = 8;
const PREFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
/** Formato esperado: at_<8 alfanum>_<segredo base64url>. */
const KEY_RE = /^at_([A-Za-z0-9]{8})_([A-Za-z0-9_-]{20,})$/;

function randomFromAlphabet(len: number, alphabet: string): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

export interface IssuedApiKey {
  id: string;
  keyPrefix: string;
  /** Segredo COMPLETO — retornado SÓ na emissão, nunca persistido em claro. */
  plaintextKey: string;
}

/**
 * Emite uma API-key nova para um tenant. Retorna o segredo completo UMA vez.
 * Scopes inválidos são descartados.
 */
export async function issuePartnerApiKey(args: {
  tenantId: string;
  name: string;
  scopes: string[];
  createdById: string;
}): Promise<IssuedApiKey> {
  const prefix = randomFromAlphabet(PREFIX_LEN, PREFIX_ALPHABET);
  const secret = randomBytes(32).toString("base64url");
  const plaintextKey = `at_${prefix}_${secret}`;
  const keyHash = hashSync(plaintextKey, KEY_BCRYPT_COST);
  const scopes = args.scopes.filter(isValidScope);

  const row = await withTenant(args.tenantId, async (tx) =>
    tx.partnerApiKey.create({
      data: {
        tenantId: args.tenantId,
        name: args.name.trim(),
        keyPrefix: prefix,
        keyHash,
        scopes,
        createdById: args.createdById,
      },
      select: { id: true, keyPrefix: true },
    }),
  );
  logger.info("partner-api-key: emitida", {
    tenantId: args.tenantId,
    keyPrefix: prefix,
    scopes,
  });
  return { id: row.id, keyPrefix: row.keyPrefix, plaintextKey };
}

export interface ValidatedPartnerKey {
  tenantId: string;
  keyId: string;
  keyPrefix: string;
  scopes: PartnerScope[];
}

/**
 * Valida a key apresentada (header `Authorization: Bearer at_..._...`). Retorna o
 * tenant + escopos, ou null se inválida/revogada. Cross-tenant (withAdmin) porque
 * a key resolve o tenant — ela é a fonte de autoridade. Best-effort lastUsedAt.
 */
export async function validatePartnerApiKey(
  presentedKey: string,
): Promise<ValidatedPartnerKey | null> {
  const m = KEY_RE.exec(presentedKey.trim());
  if (!m) return null;
  const prefix = m[1]!;

  const row = await withAdmin(async (tx) =>
    tx.partnerApiKey.findUnique({
      where: { keyPrefix: prefix },
      select: { id: true, tenantId: true, keyHash: true, scopes: true, revokedAt: true },
    }),
  );
  if (!row || row.revokedAt) return null;
  // bcrypt.compareSync é constante-time o suficiente p/ o hash; o prefix só
  // localiza — o segredo verdadeiro é provado pelo hash da key completa.
  if (!compareSync(presentedKey.trim(), row.keyHash)) return null;

  // lastUsedAt best-effort (não bloqueia a request se falhar).
  void withAdmin(async (tx) =>
    tx.partnerApiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }),
  ).catch(() => {});

  return {
    tenantId: row.tenantId,
    keyId: row.id,
    keyPrefix: prefix,
    scopes: row.scopes.filter(isValidScope),
  };
}

/** Revoga (soft) uma key do tenant. Idempotente. */
export async function revokePartnerApiKey(args: {
  tenantId: string;
  keyId: string;
}): Promise<void> {
  await withTenant(args.tenantId, async (tx) =>
    tx.partnerApiKey.updateMany({
      where: { id: args.keyId, tenantId: args.tenantId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  );
  logger.info("partner-api-key: revogada", { tenantId: args.tenantId, keyId: args.keyId });
}

/** Lista as keys de um tenant (sem o segredo/hash) para o painel. */
export async function listPartnerApiKeys(tenantId: string) {
  return withTenant(tenantId, async (tx) =>
    tx.partnerApiKey.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  );
}
