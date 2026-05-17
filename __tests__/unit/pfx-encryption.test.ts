import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { encryptPfx, decryptPfx } from "@/server/services/pfx-encryption.service"
import { randomBytes } from "node:crypto"

// Generate a valid 32-byte key for tests
const TEST_KEY = randomBytes(32).toString("base64")

describe("PFX Encryption Service (AES-256-GCM)", () => {
  beforeEach(() => {
    vi.stubEnv("PFX_ENCRYPTION_KEY", TEST_KEY)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("encrypt + decrypt roundtrip returns same buffer", () => {
    const original = Buffer.from("fake pfx content for testing", "utf-8")
    const { encrypted, iv, authTag } = encryptPfx(original)
    const decrypted = decryptPfx(encrypted, iv, authTag)
    expect(decrypted.equals(original)).toBe(true)
  })

  it("encrypt + decrypt roundtrip with binary data", () => {
    const original = randomBytes(1024) // simulate real .pfx binary
    const { encrypted, iv, authTag } = encryptPfx(original)
    const decrypted = decryptPfx(encrypted, iv, authTag)
    expect(decrypted.equals(original)).toBe(true)
  })

  it("decrypt with tampered authTag throws error", () => {
    const original = Buffer.from("test data", "utf-8")
    const { encrypted, iv } = encryptPfx(original)
    const tamperedAuthTag = randomBytes(16).toString("base64")
    expect(() => decryptPfx(encrypted, iv, tamperedAuthTag)).toThrow()
  })

  it("decrypt with wrong iv throws error", () => {
    const original = Buffer.from("test data", "utf-8")
    const { encrypted, authTag } = encryptPfx(original)
    const wrongIv = randomBytes(12).toString("base64")
    expect(() => decryptPfx(encrypted, wrongIv, authTag)).toThrow()
  })

  it("encrypt without PFX_ENCRYPTION_KEY throws descriptive error", () => {
    vi.stubEnv("PFX_ENCRYPTION_KEY", "")
    const data = Buffer.from("test", "utf-8")
    expect(() => encryptPfx(data)).toThrow(/PFX_ENCRYPTION_KEY/)
  })

  it("key with wrong size throws error", () => {
    vi.stubEnv("PFX_ENCRYPTION_KEY", Buffer.from("short").toString("base64"))
    const data = Buffer.from("test", "utf-8")
    expect(() => encryptPfx(data)).toThrow(/32 bytes/)
  })

  it("each encryption produces different iv (unique per call)", () => {
    const data = Buffer.from("same data", "utf-8")
    const result1 = encryptPfx(data)
    const result2 = encryptPfx(data)
    expect(result1.iv).not.toBe(result2.iv)
  })

  it("iv is base64 string of 12 bytes", () => {
    const data = Buffer.from("test", "utf-8")
    const { iv } = encryptPfx(data)
    const ivBuffer = Buffer.from(iv, "base64")
    expect(ivBuffer.length).toBe(12)
  })

  it("authTag is base64 string of 16 bytes", () => {
    const data = Buffer.from("test", "utf-8")
    const { authTag } = encryptPfx(data)
    const tagBuffer = Buffer.from(authTag, "base64")
    expect(tagBuffer.length).toBe(16)
  })
})
