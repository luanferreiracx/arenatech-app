import { describe, it, expect } from "vitest";
import {
  imeiSchema,
  queryImeiSchema,
  listImeiQueriesSchema,
  deviceIdentifierSchema,
  isValidDeviceIdentifier,
  validateNfeSchema,
} from "@/lib/validators/imei";

describe("imeiSchema", () => {
  it("aceita IMEI valido (iPhone 15 Pro exemplo)", () => {
    // 353456789012345 -> Luhn check digit OK
    expect(imeiSchema.safeParse("490154203237518").success).toBe(true);
  });
  it("rejeita IMEI com menos de 15 digitos", () => {
    expect(imeiSchema.safeParse("12345678901234").success).toBe(false);
  });
  it("rejeita IMEI com mais de 15 digitos", () => {
    expect(imeiSchema.safeParse("1234567890123456").success).toBe(false);
  });
  it("rejeita IMEI com letras", () => {
    expect(imeiSchema.safeParse("49015420323751A").success).toBe(false);
  });
  it("rejeita IMEI com Luhn invalido", () => {
    expect(imeiSchema.safeParse("123456789012345").success).toBe(false);
  });
  it("aceita IMEI 356938035643809", () => {
    // Known valid IMEI (Apple)
    expect(imeiSchema.safeParse("356938035643809").success).toBe(true);
  });
});

describe("queryImeiSchema", () => {
  it("aceita consulta valida por IMEI", () => {
    expect(queryImeiSchema.safeParse({ identificador: "490154203237518" }).success).toBe(true);
  });
  it("aceita consulta valida por Serial Apple", () => {
    expect(queryImeiSchema.safeParse({ identificador: "C39XK0AAJCL7" }).success).toBe(true);
  });
  it("rejeita IMEI com Luhn invalido", () => {
    expect(queryImeiSchema.safeParse({ identificador: "123456789012345" }).success).toBe(false);
  });
});

describe("deviceIdentifierSchema / isValidDeviceIdentifier", () => {
  it("aceita IMEI valido (Luhn)", () => {
    expect(isValidDeviceIdentifier("490154203237518")).toBe(true);
    expect(deviceIdentifierSchema.safeParse("490154203237518").success).toBe(true);
  });
  it("aceita Serial Apple alfanumerico (8-17 chars)", () => {
    expect(isValidDeviceIdentifier("C39XK0AAJCL7")).toBe(true); // 12 chars
    expect(isValidDeviceIdentifier("DNPQ1234XY")).toBe(true); // 10 chars
  });
  it("normaliza para maiusculas", () => {
    const parsed = deviceIdentifierSchema.safeParse("c39xk0aajcl7");
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toBe("C39XK0AAJCL7");
  });
  it("rejeita 15 digitos com Luhn invalido (nao cai como serial)", () => {
    expect(isValidDeviceIdentifier("123456789012345")).toBe(false);
  });
  it("rejeita string curta demais (<8)", () => {
    expect(isValidDeviceIdentifier("ABC123")).toBe(false);
  });
  it("rejeita caracteres nao alfanumericos", () => {
    expect(isValidDeviceIdentifier("C39-XK0AAJ")).toBe(false);
  });
});

describe("validateNfeSchema", () => {
  it("aceita chave com 44 digitos", () => {
    expect(validateNfeSchema.safeParse({ chave: "1".repeat(44) }).success).toBe(true);
  });
  it("rejeita chave com menos de 44 digitos", () => {
    expect(validateNfeSchema.safeParse({ chave: "1".repeat(43) }).success).toBe(false);
  });
  it("rejeita chave com letras", () => {
    expect(validateNfeSchema.safeParse({ chave: "A".repeat(44) }).success).toBe(false);
  });
});

describe("listImeiQueriesSchema", () => {
  it("aceita filtros vazios", () => {
    expect(listImeiQueriesSchema.safeParse({}).success).toBe(true);
  });
  it("aceita busca com paginacao", () => {
    expect(listImeiQueriesSchema.safeParse({ search: "490154", page: 0, pageSize: 10 }).success).toBe(true);
  });
  it("rejeita pageSize acima de 100", () => {
    expect(listImeiQueriesSchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });
});
