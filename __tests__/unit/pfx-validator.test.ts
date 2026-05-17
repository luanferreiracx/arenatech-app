import { describe, it, expect } from "vitest"
import { validatePfx } from "@/server/services/pfx-validator.service"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Test certificate generated with:
// openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=Test Cert Arena Tech"
// openssl pkcs12 -export -out test-cert.pfx -inkey key.pem -in cert.pem -password pass:test123
const TEST_PFX_PATH = join(__dirname, "../fixtures/test-cert.pfx")

describe("PFX Validator Service", () => {
  it("valid .pfx + correct password → valid=true with metadata", () => {
    const buffer = readFileSync(TEST_PFX_PATH)
    const result = validatePfx(buffer, "test123")
    expect(result.valid).toBe(true)
    expect(result.subject).toContain("Test Cert Arena Tech")
    expect(result.expiresAt).toBeInstanceOf(Date)
    expect(result.expiresAt!.getTime()).toBeGreaterThan(Date.now())
  })

  it("valid .pfx + wrong password → valid=false with descriptive error", () => {
    const buffer = readFileSync(TEST_PFX_PATH)
    const result = validatePfx(buffer, "wrongpassword")
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/[Ss]enha|[Pp]assword|MAC/)
  })

  it("non-pfx buffer → valid=false", () => {
    const buffer = Buffer.from("this is not a pfx file", "utf-8")
    const result = validatePfx(buffer, "test123")
    expect(result.valid).toBe(false)
    expect(result.error).toBeDefined()
  })

  it("empty buffer → valid=false", () => {
    const result = validatePfx(Buffer.alloc(0), "test123")
    expect(result.valid).toBe(false)
    expect(result.error).toContain("vazio")
  })

  it("returns issuer field", () => {
    const buffer = readFileSync(TEST_PFX_PATH)
    const result = validatePfx(buffer, "test123")
    expect(result.valid).toBe(true)
    expect(result.issuer).toBeDefined()
  })
})
