import { describe, it, expect } from "vitest";
import {
  imeiSchema,
  queryImeiSchema,
  listImeiQueriesSchema,
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
  it("aceita consulta valida", () => {
    expect(queryImeiSchema.safeParse({ imei: "490154203237518" }).success).toBe(true);
  });
  it("rejeita IMEI com Luhn invalido", () => {
    expect(queryImeiSchema.safeParse({ imei: "123456789012345" }).success).toBe(false);
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
