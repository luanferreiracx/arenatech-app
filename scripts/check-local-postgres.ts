import net from "node:net";

const HOST = "127.0.0.1";
const PORT = 5432;
const TIMEOUT_MS = 2_000;

function checkPostgres() {
  return new Promise<void>((resolve, reject) => {
    const socket = net.connect(PORT, HOST);
    const done = (error?: Error) => {
      socket.removeAllListeners();
      socket.destroy();
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };

    socket.setTimeout(TIMEOUT_MS);
    socket.once("connect", () => done());
    socket.once("timeout", () => done(new Error("timeout")));
    socket.once("error", (error) => done(error));
  });
}

checkPostgres().catch((error: NodeJS.ErrnoException) => {
  const reason = error.code ?? error.message;
  console.error(
    [
      `Postgres local indisponivel em ${HOST}:${PORT} (${reason}).`,
      "Suba a infra local antes das integracoes RLS/auth:",
      "  docker compose up -d postgres",
      "Depois rode novamente:",
      "  pnpm test:integration",
    ].join("\n"),
  );
  process.exit(1);
});
