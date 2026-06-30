import { describe, expect, it } from "vitest";
import { buildOpenApiSpec, PARTNER_API_VERSION } from "@/lib/partner-api/openapi-spec";
import { PARTNER_SCOPES } from "@/lib/partner-api/scopes";

/**
 * A spec é DERIVADA dos schemas Zod. Estes testes garantem que ela permanece um
 * OpenAPI coerente (paths, segurança, components) conforme a API evolui — se alguém
 * remover um endpoint ou um schema, o teste de comportamento acusa.
 */
describe("buildOpenApiSpec", () => {
  const spec = buildOpenApiSpec("https://example.test") as {
    openapi: string;
    info: { version: string };
    servers: Array<{ url: string }>;
    components: {
      securitySchemes: { bearerAuth: { type: string; scheme: string } };
      schemas: Record<string, { type?: string; oneOf?: unknown[]; properties?: Record<string, unknown> }>;
    };
    paths: Record<string, Record<string, { security: unknown; responses: Record<string, unknown> }>>;
  };

  it("declares OpenAPI 3.0 with the package version", () => {
    expect(spec.openapi).toBe("3.0.3");
    expect(spec.info.version).toBe(PARTNER_API_VERSION);
  });

  it("uses the given server url (for Try-it-out on the same origin)", () => {
    expect(spec.servers[0]?.url).toBe("https://example.test");
  });

  it("documents the five partner endpoints", () => {
    expect(Object.keys(spec.paths).sort()).toEqual([
      "/api/v1/partner/depix/balance",
      "/api/v1/partner/depix/deposits",
      "/api/v1/partner/depix/transactions",
      "/api/v1/partner/depix/transactions/{id}",
      "/api/v1/partner/depix/withdrawals",
    ]);
  });

  it("secures every operation with the bearer scheme", () => {
    expect(spec.components.securitySchemes.bearerAuth).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
    for (const methods of Object.values(spec.paths)) {
      for (const operation of Object.values(methods)) {
        expect(operation.security).toEqual([{ bearerAuth: [] }]);
      }
    }
  });

  it("includes common auth/rate-limit error responses on every operation", () => {
    for (const methods of Object.values(spec.paths)) {
      for (const operation of Object.values(methods)) {
        for (const code of ["401", "403", "429", "503"]) {
          expect(operation.responses).toHaveProperty(code);
        }
      }
    }
  });

  it("exposes reusable schemas with cross-references", () => {
    const { schemas } = spec.components;
    expect(schemas.PartnerTransaction).toBeDefined();
    expect(schemas.PartnerBalance).toBeDefined();
    // A lista referencia a transação por $ref (reuso, não cópia).
    expect(JSON.stringify(schemas.PartnerTransactionList)).toContain(
      "#/components/schemas/PartnerTransaction",
    );
  });

  it("renders the discriminated withdraw request as oneOf", () => {
    expect(spec.components.schemas.PartnerWithdrawRequest?.oneOf).toBeInstanceOf(Array);
  });

  it("references the real scope constants in the security description", () => {
    const description = JSON.stringify(spec.components.securitySchemes.bearerAuth);
    expect(description).toContain(PARTNER_SCOPES.DEPIX_READ);
    expect(description).toContain(PARTNER_SCOPES.DEPIX_WITHDRAW);
  });
});
