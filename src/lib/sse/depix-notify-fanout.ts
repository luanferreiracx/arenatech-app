import { Client } from "pg";
import { logger } from "@/lib/logger";

/**
 * Fanout compartilhado de NOTIFY 'depix_paid'.
 *
 * Antes (gap Sg20): cada rota SSE abria sua propria conexao Postgres
 * dedicada via `new Client()` para fazer LISTEN. Com N clientes
 * conectados (e.g. caixa do PDV aberto + venda avulsa), o pool atingia
 * o limite do Postgres rapidamente (max_connections default = 100).
 *
 * Agora: UMA conexao dedicada por processo Node faz LISTEN, e
 * distribui notifications a todos os subscribers in-memory. SSE
 * routes apenas chamam `subscribeDepixPaid(callback)` e cancelam
 * via a funcao de unsubscribe retornada.
 *
 * Robustez:
 * - Reconnect automatico em caso de erro/disconnect.
 * - Lazy-init: so abre conexao quando ha o primeiro subscriber.
 * - Sem cleanup automatico ao zerar subscribers (mantem conexao
 *   aberta para o proximo subscriber — eh comum). Hot-reload em dev
 *   abre uma nova; em prod, o processo dura.
 *
 * Limitacao conhecida: em deploys multi-process (Next standalone com
 * cluster mode), cada worker abre a sua propria conexao — mas isso
 * eh M conexoes (workers), nao N conexoes (clientes), entao a
 * reducao ainda eh enorme.
 */

export interface DepixPaidPayload {
  kind: string;
  id: string;
  transactionId?: string;
}

type Subscriber = (payload: DepixPaidPayload, raw: string) => void;

const subscribers = new Set<Subscriber>();
let client: Client | null = null;
let connecting: Promise<void> | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;

async function ensureConnection(): Promise<void> {
  if (client) return;
  if (connecting) return connecting;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_URL ausente — fanout DePix nao pode conectar");
  }

  connecting = (async () => {
    const c = new Client({ connectionString: dbUrl });
    c.on("notification", (msg) => {
      if (!msg.payload) return;
      let parsed: DepixPaidPayload | null = null;
      try {
        parsed = JSON.parse(msg.payload) as DepixPaidPayload;
      } catch (err) {
        logger.warn("Fanout depix_paid: payload invalido", { err: String(err) });
        return;
      }
      // Cliente snapshot para nao quebrar iteracao se um subscriber se
      // remover durante a notificacao (efeito colateral comum em SSE).
      const snapshot = Array.from(subscribers);
      for (const sub of snapshot) {
        try {
          sub(parsed, msg.payload);
        } catch (err) {
          logger.warn("Fanout depix_paid: subscriber callback throw", { err: String(err) });
        }
      }
    });

    c.on("error", (err) => {
      logger.warn("Fanout depix_paid pg client error", { err: String(err) });
      void reconnect();
    });

    c.on("end", () => {
      logger.warn("Fanout depix_paid pg connection ended");
      void reconnect();
    });

    await c.connect();
    await c.query("LISTEN depix_paid");
    client = c;
    logger.info("Fanout depix_paid LISTEN aberto");
  })();

  try {
    await connecting;
  } finally {
    connecting = null;
  }
}

async function reconnect(): Promise<void> {
  if (reconnectTimer) return;
  // Marca client como nulo para evitar reuso da conexao morta.
  const dead = client;
  client = null;
  if (dead) {
    try {
      await dead.end();
    } catch {
      // ignora — ja morta
    }
  }
  if (subscribers.size === 0) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void (async () => {
      try {
        await ensureConnection();
      } catch (err) {
        logger.warn("Fanout depix_paid: reconnect falhou", { err: String(err) });
        // Tenta de novo em 5s.
        void reconnect();
      }
    })();
  }, 1000);
}

/**
 * Registra um callback que recebera todas as notifications 'depix_paid'.
 * O callback deve filtrar pelo `kind`/`id` que lhe interessa.
 *
 * Retorna funcao para desregistrar. Sempre chame essa funcao no
 * cleanup do SSE (req.signal.abort) para evitar vazamento de memoria.
 */
export function subscribeDepixPaid(callback: Subscriber): () => void {
  subscribers.add(callback);
  // Lazy-init.
  void ensureConnection().catch((err) => {
    logger.error("Fanout depix_paid: falha ao conectar", { err: String(err) });
    subscribers.delete(callback);
  });
  return () => {
    subscribers.delete(callback);
  };
}
