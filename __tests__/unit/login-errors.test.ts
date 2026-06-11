import { describe, it, expect } from "vitest";
import { AuthError } from "@auth/core/errors";
import { RateLimitedError, RATE_LIMITED_CODE } from "@/lib/auth/login-errors";
import {
  TwoFactorRequiredError,
  TwoFactorInvalidError,
  TWO_FACTOR_REQUIRED_CODE,
  TWO_FACTOR_INVALID_CODE,
} from "@/lib/auth/two-factor-errors";

/**
 * O loginAction distingue esses erros pelo `code`. Para isso funcionar, eles
 * precisam: (1) ser instanceof AuthError (o @auth/core só re-lança AuthError ao
 * chamador em raw mode); (2) expor o `code` esperado. Se algum desses contratos
 * quebrar, o login volta a crashar no error boundary.
 */
describe("login error contract", () => {
  it("RateLimitedError é AuthError, carrega code e retryMinutes", () => {
    const err = new RateLimitedError(7);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.code).toBe(RATE_LIMITED_CODE);
    expect(err.retryMinutes).toBe(7);
  });

  it("TwoFactorRequiredError é AuthError com o code certo", () => {
    const err = new TwoFactorRequiredError();
    expect(err).toBeInstanceOf(AuthError);
    expect(err.code).toBe(TWO_FACTOR_REQUIRED_CODE);
  });

  it("TwoFactorInvalidError é AuthError com o code certo", () => {
    const err = new TwoFactorInvalidError();
    expect(err).toBeInstanceOf(AuthError);
    expect(err.code).toBe(TWO_FACTOR_INVALID_CODE);
  });

  it("os codes são distintos entre si", () => {
    const codes = [RATE_LIMITED_CODE, TWO_FACTOR_REQUIRED_CODE, TWO_FACTOR_INVALID_CODE];
    expect(new Set(codes).size).toBe(codes.length);
  });
});
