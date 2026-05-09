import type { Metadata } from "next";

const APP_NAME = "Arena Tech";
const DEFAULT_DESCRIPTION = "Sistema de gestão Arena Tech";

/**
 * Helper to create consistent page metadata.
 *
 * @example
 * export const metadata = createMetadata("Clientes");
 * // → { title: "Clientes | Arena Tech", description: "Sistema de gestão Arena Tech" }
 */
export function createMetadata(title: string, description?: string): Metadata {
  return {
    title: `${title} | ${APP_NAME}`,
    description: description ?? DEFAULT_DESCRIPTION,
  };
}
