import { describe, it, expect } from "vitest";

// -----------------------------------------------------------------------
// CPF masking (from components/forms/cpf-input.tsx)
// -----------------------------------------------------------------------
function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9)
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

// -----------------------------------------------------------------------
// CNPJ masking (from components/inputs/cnpj-input.tsx)
// -----------------------------------------------------------------------
function formatCnpj(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12)
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

// -----------------------------------------------------------------------
// Phone masking (from components/inputs/phone-input.tsx)
// -----------------------------------------------------------------------
function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

// -----------------------------------------------------------------------
// Money parsing (from components/inputs/money-input.tsx)
// -----------------------------------------------------------------------
function parseMoneyCentavos(input: string): number {
  const digits = input.replace(/\D/g, "");
  return digits === "" ? 0 : parseInt(digits, 10);
}

function formatMoney(centavos: number): string {
  const value = centavos / 100;
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe("CPF Input", () => {
  it("formats 11 digits correctly", () => {
    expect(formatCpf("12345678901")).toBe("123.456.789-01");
  });

  it("formats partial input", () => {
    expect(formatCpf("123")).toBe("123");
    expect(formatCpf("123456")).toBe("123.456");
    expect(formatCpf("123456789")).toBe("123.456.789");
  });

  it("strips non-digit characters", () => {
    expect(formatCpf("123.456.789-01")).toBe("123.456.789-01");
  });
});

describe("CNPJ Input", () => {
  it("formats 14 digits correctly", () => {
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("formats partial CNPJ", () => {
    expect(formatCnpj("11")).toBe("11");
    expect(formatCnpj("11222")).toBe("11.222");
    expect(formatCnpj("11222333")).toBe("11.222.333");
    expect(formatCnpj("112223330001")).toBe("11.222.333/0001");
  });
});

describe("Phone Input", () => {
  it("formats celular (11 digits) correctly", () => {
    expect(formatPhone("11999887766")).toBe("(11) 99988-7766");
  });

  it("formats fixo (10 digits)", () => {
    expect(formatPhone("1132334455")).toBe("(11) 3233-4455");
  });

  it("formats partial phone", () => {
    expect(formatPhone("11")).toBe("(11");
    expect(formatPhone("119998")).toBe("(11) 9998");
    expect(formatPhone("119998877")).toBe("(11) 9998-877");
  });
});

describe("Money Input", () => {
  it("parses cents correctly from digit string", () => {
    expect(parseMoneyCentavos("12345")).toBe(12345);
    expect(parseMoneyCentavos("")).toBe(0);
    expect(parseMoneyCentavos("100")).toBe(100);
  });

  it("formats display value from centavos", () => {
    // 12345 centavos = R$ 123,45
    expect(formatMoney(12345)).toMatch("123,45");
  });

  it("handles zero", () => {
    expect(formatMoney(0)).toMatch("0,00");
  });
});
