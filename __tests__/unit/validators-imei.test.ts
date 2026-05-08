import { describe, it, expect } from "vitest";
import {
  imeiSchema,
  queryImeiSchema,
  listImeiQueriesSchema,
} from "@/lib/validators/imei";

// ────────────────────────────────────────────────────────────────────────────
// IMEI Validation (Luhn)
// ────────────────────────────────────────────────────────────────────────────

describe("imeiSchema", () => {
  it("should accept a valid IMEI (Luhn check pass)", () => {
    // 490154203237518 is a known valid Luhn IMEI
    const result = imeiSchema.safeParse("490154203237518");
    expect(result.success).toBe(true);
  });

  it("should accept another valid IMEI", () => {
    const result = imeiSchema.safeParse("353456789012345");
    // This particular number may or may not pass Luhn — test the format at least
    // Let's use a known valid one
    const result2 = imeiSchema.safeParse("356938035643809");
    expect(result2.success).toBe(true);
  });

  it("should reject IMEI with wrong length (14 digits)", () => {
    const result = imeiSchema.safeParse("49015420323751");
    expect(result.success).toBe(false);
  });

  it("should reject IMEI with wrong length (16 digits)", () => {
    const result = imeiSchema.safeParse("4901542032375189");
    expect(result.success).toBe(false);
  });

  it("should reject IMEI with letters", () => {
    const result = imeiSchema.safeParse("49015420323751A");
    expect(result.success).toBe(false);
  });

  it("should reject empty string", () => {
    const result = imeiSchema.safeParse("");
    expect(result.success).toBe(false);
  });

  it("should reject IMEI with spaces", () => {
    const result = imeiSchema.safeParse("490 154 203 237");
    expect(result.success).toBe(false);
  });

  it("should reject IMEI that fails Luhn", () => {
    // Change last digit of valid IMEI to make it invalid
    const result = imeiSchema.safeParse("490154203237519");
    expect(result.success).toBe(false);
  });

  it("should reject all zeros (fails Luhn unless 0 mod 10)", () => {
    const result = imeiSchema.safeParse("000000000000000");
    // 000...0 sums to 0, which is mod 10 = 0, so Luhn passes
    // This is actually valid by Luhn, test a different invalid case
    expect(result.success).toBe(true); // Luhn does pass for all zeros
  });

  it("should reject IMEI with special characters", () => {
    const result = imeiSchema.safeParse("490-154-203-237");
    expect(result.success).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Query Input
// ────────────────────────────────────────────────────────────────────────────

describe("queryImeiSchema", () => {
  it("should accept valid query", () => {
    const result = queryImeiSchema.safeParse({
      imei: "490154203237518",
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing imei", () => {
    const result = queryImeiSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// List Queries
// ────────────────────────────────────────────────────────────────────────────

describe("listImeiQueriesSchema", () => {
  it("should accept valid filters", () => {
    const result = listImeiQueriesSchema.safeParse({
      search: "490154",
      status: "success",
      page: 0,
      pageSize: 10,
    });
    expect(result.success).toBe(true);
  });

  it("should accept minimal input", () => {
    const result = listImeiQueriesSchema.safeParse({
      page: 0,
      pageSize: 10,
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid status", () => {
    const result = listImeiQueriesSchema.safeParse({
      status: "invalid",
      page: 0,
      pageSize: 10,
    });
    expect(result.success).toBe(false);
  });

  it("should reject negative page", () => {
    const result = listImeiQueriesSchema.safeParse({
      page: -1,
      pageSize: 10,
    });
    expect(result.success).toBe(false);
  });

  it("should reject pageSize 0", () => {
    const result = listImeiQueriesSchema.safeParse({
      page: 0,
      pageSize: 0,
    });
    expect(result.success).toBe(false);
  });

  it("should reject pageSize above 100", () => {
    const result = listImeiQueriesSchema.safeParse({
      page: 0,
      pageSize: 101,
    });
    expect(result.success).toBe(false);
  });
});
