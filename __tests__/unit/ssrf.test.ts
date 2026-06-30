/**
 * Guarda anti-SSRF (src/lib/security/ssrf.ts). Cobre os ranges internos (v4/v6,
 * incl. metadata 169.254.169.254 e IPv4-mapeado), a checagem de formato HTTPS e a
 * guarda de DNS (rebinding) — o servidor faz POST em URLs de webhook fornecidas
 * pelo tenant, então bloquear destino interno é crítico.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const dnsLookup = vi.fn();
vi.mock("node:dns/promises", () => ({ lookup: (...a: unknown[]) => dnsLookup(...a) }));

import {
  isBlockedIp,
  isBlockedHostname,
  assertPublicHttpsUrl,
  assertUrlResolvesToPublicIp,
} from "@/lib/security/ssrf";

describe("isBlockedIp", () => {
  it("bloqueia ranges internos IPv4", () => {
    for (const ip of [
      "0.0.0.0",
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.0.1",
      "169.254.169.254", // metadata da cloud
      "100.64.0.1", // CGNAT
      "198.18.0.1", // benchmarking
      "224.0.0.1", // multicast
      "240.0.0.1", // reservado
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it("permite IPv4 público", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "192.169.0.1", "100.63.0.1"]) {
      expect(isBlockedIp(ip), ip).toBe(false);
    }
  });

  it("bloqueia ranges internos IPv6 (incl. IPv4-mapeado)", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it("permite IPv6 público", () => {
    expect(isBlockedIp("2606:4700:4700::1111")).toBe(false);
  });
});

describe("isBlockedHostname", () => {
  it("bloqueia hosts internos literais", () => {
    for (const h of ["localhost", "foo.localhost", "db.internal", "router.local", "127.0.0.1", "::1"]) {
      expect(isBlockedHostname(h), h).toBe(true);
    }
  });

  it("permite hosts públicos", () => {
    for (const h of ["example.com", "api.parceiro.com.br", "example.org"]) {
      expect(isBlockedHostname(h), h).toBe(false);
    }
  });
});

describe("assertPublicHttpsUrl", () => {
  it("rejeita não-HTTPS", () => {
    expect(() => assertPublicHttpsUrl("http://example.com")).toThrow(/HTTPS/);
  });

  it("rejeita URL malformada", () => {
    expect(() => assertPublicHttpsUrl("not a url")).toThrow(/inválida/);
  });

  it("rejeita credenciais embutidas", () => {
    expect(() => assertPublicHttpsUrl("https://user:pass@example.com")).toThrow(/credenciais/);
  });

  it("rejeita host interno", () => {
    expect(() => assertPublicHttpsUrl("https://localhost/hook")).toThrow(/interno|privado/);
    expect(() => assertPublicHttpsUrl("https://169.254.169.254/latest/meta-data")).toThrow();
  });

  it("rejeita IPv6 interno literal com colchetes", () => {
    expect(() => assertPublicHttpsUrl("https://[::1]/hook")).toThrow();
    expect(() => assertPublicHttpsUrl("https://[fd00::1]:8443/hook")).toThrow();
  });

  it("aceita HTTPS público e retorna a URL", () => {
    const url = assertPublicHttpsUrl("https://api.parceiro.com/webhook");
    expect(url.hostname).toBe("api.parceiro.com");
  });
});

describe("assertUrlResolvesToPublicIp", () => {
  beforeEach(() => dnsLookup.mockReset());

  it("bloqueia quando o DNS resolve para IP interno (rebinding)", async () => {
    dnsLookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
    await expect(assertUrlResolvesToPublicIp(new URL("https://evil.example.com"))).rejects.toThrow(/interno/);
  });

  it("bloqueia se QUALQUER endereço resolvido for interno", async () => {
    dnsLookup.mockResolvedValue([
      { address: "8.8.8.8", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    await expect(assertUrlResolvesToPublicIp(new URL("https://mixed.example.com"))).rejects.toThrow();
  });

  it("permite quando todos os endereços são públicos", async () => {
    dnsLookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    await expect(assertUrlResolvesToPublicIp(new URL("https://good.example.com"))).resolves.toBeUndefined();
  });

  it("não consulta DNS para IP literal público", async () => {
    await expect(assertUrlResolvesToPublicIp(new URL("https://8.8.8.8/hook"))).resolves.toBeUndefined();
    expect(dnsLookup).not.toHaveBeenCalled();
  });

  it("bloqueia IP literal interno sem DNS", async () => {
    await expect(assertUrlResolvesToPublicIp(new URL("https://127.0.0.1/hook"))).rejects.toThrow();
    expect(dnsLookup).not.toHaveBeenCalled();
  });

  it("bloqueia quando o host não resolve", async () => {
    dnsLookup.mockRejectedValueOnce(new Error("ENOTFOUND"));
    await expect(assertUrlResolvesToPublicIp(new URL("https://nope.example.com"))).rejects.toThrow(/resolver/);
  });
});
