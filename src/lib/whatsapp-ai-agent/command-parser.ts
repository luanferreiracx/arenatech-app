export type WhatsappAiCommand =
  | { type: "none"; text: string }
  | { type: "status"; scope?: string }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "reset" }
  | { type: "config" }
  | { type: "model"; model: string | null }
  | { type: "run"; task: string }
  | { type: "cancel" }
  | { type: "logs" };

export function parseWhatsappAiCommand(text: string): WhatsappAiCommand {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return { type: "none", text: trimmed };

  const [rawCommand = "", ...rest] = trimmed.slice(1).split(/\s+/);
  const command = rawCommand.toLowerCase();
  const arg = rest.join(" ").trim();

  switch (command) {
    case "status":
      return { type: "status", ...(arg ? { scope: arg } : {}) };
    case "pause":
      return { type: "pause" };
    case "resume":
      return { type: "resume" };
    case "reset":
      return { type: "reset" };
    case "config":
      return { type: "config" };
    case "model":
      return { type: "model", model: arg || null };
    case "run":
      return { type: "run", task: arg };
    case "cancel":
      return { type: "cancel" };
    case "logs":
      return { type: "logs" };
    default:
      return { type: "none", text: trimmed };
  }
}
