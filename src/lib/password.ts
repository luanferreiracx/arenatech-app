import { hashSync } from "bcryptjs";

const BCRYPT_COST = 12;

export function hashPassword(password: string): string {
  return hashSync(password, BCRYPT_COST);
}
