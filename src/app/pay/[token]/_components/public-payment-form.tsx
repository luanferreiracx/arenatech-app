"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Copy, Check, Loader2, QrCode, ArrowDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { isValidTaxId } from "@/lib/utils/tax-id";
import { generatePublicPixAction, getPublicPixStatusAction } from "../actions";
import { StatusScreen } from "./pay-shell";

const MIN_CENTS = 1000;
const MAX_CENTS = 500000;

type Props = {
  token: string;
  merchantName: string;
  description: string;
  amountCents: number | null;
  amountOpen: boolean;
};

type Generated = {
  qrCode: string;
  qrCodeBase64: string;
  amountCents: number;
  expiresAt: string | null;
};

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Máscara progressiva de CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00). */
function maskTaxId(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

/** Máscara de valor a partir de dígitos -> "R$ 0,00". */
function maskAmount(value: string): string {
  const cents = Number(value.replace(/\D/g, "")) || 0;
  return formatBRL(cents);
}

export function PublicPaymentForm({
  token,
  merchantName,
  description,
  amountCents,
  amountOpen,
}: Props) {
  const [taxId, setTaxId] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [ownership, setOwnership] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [paid, setPaid] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const taxDigits = taxId.replace(/\D/g, "");
  const taxValid = isValidTaxId(taxDigits);
  const enteredCents = amountOpen ? Number(amountInput.replace(/\D/g, "")) || 0 : (amountCents ?? 0);
  const amountValid = enteredCents >= MIN_CENTS && enteredCents <= MAX_CENTS;
  const canGenerate = taxValid && ownership && amountValid && !isPending;

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const res = await generatePublicPixAction({
        token,
        taxId: taxDigits,
        amountCents: amountOpen ? enteredCents : null,
        ownershipConfirmed: ownership,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setGenerated({
        qrCode: res.qrCode,
        qrCodeBase64: res.qrCodeBase64,
        amountCents: res.amountCents,
        expiresAt: res.expiresAt,
      });
    });
  }

  if (paid) {
    return (
      <StatusScreen
        tone="success"
        title="Pagamento confirmado!"
        message={`Seu pagamento para ${merchantName} foi recebido. Você já pode fechar esta página.`}
      />
    );
  }

  if (generated) {
    return (
      <QrStage
        token={token}
        merchantName={merchantName}
        amountCents={generated.amountCents}
        qrCode={generated.qrCode}
        qrCodeBase64={generated.qrCodeBase64}
        expiresAt={generated.expiresAt}
        copied={copied}
        onCopy={() => {
          void navigator.clipboard.writeText(generated.qrCode);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        }}
        onPaid={() => setPaid(true)}
        onExpired={() => {
          setGenerated(null);
          setError("O QR Code expirou. Gere um novo para pagar.");
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <AmountHero
        amountCents={amountOpen ? enteredCents : (amountCents ?? 0)}
        description={description}
        merchantName={merchantName}
      />

      <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        {amountOpen && (
          <Field step={1} label="Valor a pagar">
            <input
              inputMode="numeric"
              value={amountInput ? maskAmount(amountInput) : ""}
              onChange={(e) => setAmountInput(e.target.value.replace(/\D/g, ""))}
              placeholder="R$ 0,00"
              className="w-full rounded-lg border border-white/10 bg-[#020617] px-3 py-2.5 text-base tabular-nums text-slate-50 outline-none placeholder:text-slate-600 focus:border-[#2ec4b6] focus:ring-2 focus:ring-[#2ec4b6]/30"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Entre {formatBRL(MIN_CENTS)} e {formatBRL(MAX_CENTS)}.
            </p>
          </Field>
        )}

        <Field step={amountOpen ? 2 : 1} label="Seu CPF ou CNPJ">
          <input
            inputMode="numeric"
            value={maskTaxId(taxId)}
            onChange={(e) => setTaxId(e.target.value)}
            placeholder="000.000.000-00"
            autoComplete="off"
            className="w-full rounded-lg border border-white/10 bg-[#020617] px-3 py-2.5 text-base tabular-nums text-slate-50 outline-none placeholder:text-slate-600 focus:border-[#2ec4b6] focus:ring-2 focus:ring-[#2ec4b6]/30"
            aria-invalid={taxDigits.length > 0 && !taxValid}
          />
          {taxDigits.length >= 11 && !taxValid && (
            <p className="mt-1.5 text-xs text-red-400">CPF/CNPJ inválido.</p>
          )}
        </Field>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-3.5">
          <Checkbox
            checked={ownership}
            onCheckedChange={(v) => setOwnership(v === true)}
            className="mt-0.5 border-amber-400/50 data-[state=checked]:border-[#2ec4b6] data-[state=checked]:bg-[#2ec4b6]"
            aria-label="Confirmo a titularidade da conta de pagamento"
          />
          <span className="text-xs leading-relaxed text-amber-100/90">
            Declaro que o <strong className="font-semibold">CPF/CNPJ informado é o titular</strong>{" "}
            da conta bancária de onde farei o PIX. Pagamentos de terceiros podem ser{" "}
            <strong className="font-semibold">recusados</strong> e o valor devolvido.
          </span>
        </label>

        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300" role="alert">
            {error}
          </p>
        )}

        <Button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="h-12 w-full bg-[#2ec4b6] text-base font-semibold text-[#020617] hover:bg-[#2ec4b6]/90"
        >
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Gerando…
            </>
          ) : (
            <>
              <QrCode className="size-4" /> Gerar QR Code
            </>
          )}
        </Button>
        <p className="text-center text-[0.7rem] text-slate-500">
          Ao pagar, você adquire tokens DePix que são entregues a {merchantName}.
        </p>
      </div>
    </div>
  );
}

/** Herói: o valor com a conversão R$ → DePix tornada explícita e bonita. */
function AmountHero({
  amountCents,
  description,
  merchantName,
}: {
  amountCents: number;
  description: string;
  merchantName: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent p-6 text-center">
      <p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-slate-400">
        {description || "Pagamento DePix"}
      </p>
      <p className="mt-3 text-[2.75rem] font-semibold leading-none tabular-nums text-slate-50">
        {amountCents > 0 ? formatBRL(amountCents) : "—"}
      </p>
      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
        <span className="rounded-full bg-white/5 px-2 py-0.5">Você paga em PIX</span>
        <ArrowDown className="size-3.5 text-[#5eead4]" />
        <span className="rounded-full bg-[#2ec4b6]/15 px-2 py-0.5 font-medium text-[#5eead4]">
          {merchantName} recebe em DePix
        </span>
      </div>
    </div>
  );
}

function Field({ step, label, children }: { step: number; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="grid size-5 place-content-center rounded-full bg-[#2ec4b6]/15 text-[0.65rem] font-semibold text-[#5eead4]">
          {step}
        </span>
        <span className="text-xs font-medium text-slate-300">{label}</span>
      </div>
      {children}
    </div>
  );
}

/** Etapa do QR: exibe o código, copia-e-cola e faz polling do status. */
function QrStage({
  token,
  merchantName,
  amountCents,
  qrCode,
  qrCodeBase64,
  expiresAt,
  copied,
  onCopy,
  onPaid,
  onExpired,
}: {
  token: string;
  merchantName: string;
  amountCents: number;
  qrCode: string;
  qrCodeBase64: string;
  expiresAt: string | null;
  copied: boolean;
  onCopy: () => void;
  onPaid: () => void;
  onExpired: () => void;
}) {
  const onPaidRef = useRef(onPaid);
  const onExpiredRef = useRef(onExpired);
  useEffect(() => {
    onPaidRef.current = onPaid;
    onExpiredRef.current = onExpired;
  });

  const deadline = useMemo(
    () => (expiresAt ? new Date(expiresAt).getTime() : null),
    [expiresAt],
  );
  const [remaining, setRemaining] = useState<number | null>(null);

  // Polling do status (a cada 3s).
  useEffect(() => {
    let active = true;
    const tick = async () => {
      const status = await getPublicPixStatusAction(token);
      if (!active) return;
      if (status === "paid") onPaidRef.current();
      else if (status === "expired" || status === "failed") onExpiredRef.current();
    };
    const id = window.setInterval(() => void tick(), 3000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [token]);

  // Contagem regressiva da validade (deadline absoluto -> segundos restantes).
  useEffect(() => {
    if (deadline == null) return;
    const update = () => setRemaining(Math.max(0, Math.floor((deadline - Date.now()) / 1000)));
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [deadline]);

  const mins = remaining != null ? Math.floor(remaining / 60) : null;
  const secs = remaining != null ? remaining % 60 : null;

  const qrSrc = useMemo(() => {
    if (!qrCodeBase64) return null;
    return qrCodeBase64.startsWith("data:") ? qrCodeBase64 : `data:image/png;base64,${qrCodeBase64}`;
  }, [qrCodeBase64]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
        <p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-slate-400">
          Pague {formatBRL(amountCents)} para {merchantName}
        </p>

        <div className="mx-auto mt-4 w-fit rounded-2xl bg-white p-3">
          {qrSrc ? (
            <Image src={qrSrc} alt="QR Code PIX" width={220} height={220} className="size-[220px]" unoptimized />
          ) : (
            <div className="grid size-[220px] place-content-center text-slate-400">
              <QrCode className="size-12" />
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-[#5eead4]">
          <Loader2 className="size-3.5 animate-spin" />
          Aguardando pagamento…
        </div>
        {mins != null && secs != null && (
          <p className="mt-1 text-[0.7rem] text-slate-500">
            Expira em {mins}:{String(secs).padStart(2, "0")}
          </p>
        )}
      </div>

      <button
        onClick={onCopy}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition-colors hover:border-[#2ec4b6]/40"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[0.7rem] font-medium uppercase tracking-wide text-slate-400">
            PIX copia e cola
          </span>
          <span className="mt-0.5 block truncate font-mono text-xs text-slate-300">{qrCode}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-[#5eead4]">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copiado" : "Copiar"}
        </span>
      </button>

      <p className="text-center text-[0.7rem] leading-relaxed text-slate-500">
        Abra o app do seu banco, escolha pagar com PIX e escaneie o QR ou cole o código.
        O pagamento deve sair de uma conta do CPF/CNPJ informado.
      </p>
    </div>
  );
}
