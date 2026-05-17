import forge from "node-forge"

export interface PfxValidationResult {
  valid: boolean
  error?: string
  expiresAt?: Date
  subject?: string
  issuer?: string
}

/**
 * Validate a .pfx (PKCS#12) buffer with password.
 * Extracts certificate metadata if valid.
 * Password is used only for validation — NEVER stored.
 */
export function validatePfx(buffer: Buffer, password: string): PfxValidationResult {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: "Arquivo de certificado vazio" }
  }

  try {
    const asn1 = forge.asn1.fromDer(buffer.toString("binary"))
    const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password)

    // Extract certificate bags
    const certBagOid = forge.pki.oids.certBag as string
    const certBags = p12.getBags({ bagType: certBagOid })
    const certs = certBags[certBagOid]

    if (!certs || certs.length === 0) {
      return { valid: false, error: "Nenhum certificado encontrado no arquivo .pfx" }
    }

    const cert = certs[0]!.cert
    if (!cert) {
      return { valid: false, error: "Certificado não pôde ser extraído" }
    }

    const subject = cert.subject.getField("CN")?.value as string | undefined
    const issuer = cert.issuer.getField("CN")?.value as string | undefined
    const expiresAt = cert.validity.notAfter

    return {
      valid: true,
      expiresAt,
      subject: subject ?? "Desconhecido",
      issuer: issuer ?? "Desconhecido",
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido"

    if (message.includes("Invalid password") || message.includes("PKCS#12 MAC")) {
      return { valid: false, error: "Senha do certificado incorreta" }
    }

    return { valid: false, error: `Certificado inválido: ${message}` }
  }
}
