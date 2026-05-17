import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12 // recommended for GCM
const AUTH_TAG_LENGTH = 16

/**
 * Get the AES-256 encryption key from env.
 * Key must be exactly 32 bytes (base64-encoded in env).
 */
function getEncryptionKey(): Buffer {
  const keyB64 = process.env.PFX_ENCRYPTION_KEY
  if (!keyB64) {
    throw new Error("PFX_ENCRYPTION_KEY não está configurado. Gere com: openssl rand -base64 32")
  }
  const key = Buffer.from(keyB64, "base64")
  if (key.length !== 32) {
    throw new Error(`PFX_ENCRYPTION_KEY deve ter 32 bytes (encontrado ${key.length}). Gere com: openssl rand -base64 32`)
  }
  return key
}

export interface EncryptedPfx {
  encrypted: Buffer
  iv: string // Base64
  authTag: string // Base64
}

/**
 * Encrypt a .pfx buffer using AES-256-GCM.
 */
export function encryptPfx(plaintext: Buffer): EncryptedPfx {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)

  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()

  return {
    encrypted,
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  }
}

/**
 * Decrypt a .pfx buffer encrypted with AES-256-GCM.
 */
export function decryptPfx(encrypted: Buffer, ivB64: string, authTagB64: string): Buffer {
  const key = getEncryptionKey()
  const iv = Buffer.from(ivB64, "base64")
  const authTag = Buffer.from(authTagB64, "base64")

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)

  return Buffer.concat([decipher.update(encrypted), decipher.final()])
}
