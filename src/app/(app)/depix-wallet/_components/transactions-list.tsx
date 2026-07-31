"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QueryErrorState } from "@/components/domain/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { TransactionRow } from "./transaction-row";

const PAGE_SIZE = 25;

/** Rótulos dos filtros que a procedure já aceitava e a tela nunca ofereceu. */
const TIPOS = [
  { value: "ALL", label: "Depósitos e saques" },
  { value: "DEPOSIT", label: "Só depósitos" },
  { value: "WITHDRAW", label: "Só saques" },
] as const;

const STATUS = [
  { value: "ALL", label: "Qualquer situação" },
  { value: "COMPLETED", label: "Concluída" },
  { value: "PENDING", label: "Pendente" },
  { value: "PROCESSING", label: "Processando" },
  { value: "FAILED", label: "Falhou" },
  { value: "CANCELLED", label: "Cancelada" },
  { value: "EXPIRED", label: "Expirada" },
] as const;

type Tipo = (typeof TIPOS)[number]["value"];
type Status = (typeof STATUS)[number]["value"];

export function TransactionsList() {
  const trpc = useTRPC();
  const [page, setPage] = useState(0);
  const [kind, setKind] = useState<Tipo>("ALL");
  const [status, setStatus] = useState<Status>("ALL");

  const query = useQuery(
    trpc.depixTransaction.list.queryOptions({ page, pageSize: PAGE_SIZE, kind, status }),
  );

  /** Trocar filtro volta para a primeira página — senão fica-se num vazio. */
  const trocarTipo = (v: Tipo) => {
    setKind(v);
    setPage(0);
  };
  const trocarStatus = (v: Status) => {
    setStatus(v);
    setPage(0);
  };

  const total = query.data?.total ?? 0;
  const pageCount = query.data?.pageCount ?? 0;
  const transacoes = query.data?.data ?? [];
  const primeiroDaPagina = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const ultimoDaPagina = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-end gap-3 border-b border-border p-4 sm:p-5">
        <div className="space-y-1.5">
          <Label htmlFor="tx-kind" className="text-xs">
            Tipo
          </Label>
          <Select value={kind} onValueChange={(v) => trocarTipo(v as Tipo)}>
            <SelectTrigger id="tx-kind" className="w-52 max-w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tx-status" className="text-xs">
            Situação
          </Label>
          <Select value={status} onValueChange={(v) => trocarStatus(v as Status)}>
            <SelectTrigger id="tx-status" className="w-52 max-w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!query.isLoading && !query.isError && (
          <p className="ml-auto text-xs text-muted-foreground tabular-nums">
            {total === 0
              ? "Nenhuma transação"
              : `${primeiroDaPagina}–${ultimoDaPagina} de ${total}`}
          </p>
        )}
      </div>

      {query.isError ? (
        <div className="p-6">
          <QueryErrorState error={query.error} />
        </div>
      ) : query.isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : transacoes.length === 0 ? (
        <div className="p-8 text-center">
          <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <p className="mb-1 text-sm font-medium">
            {kind === "ALL" && status === "ALL"
              ? "Nada por aqui ainda"
              : "Nenhuma transação com esses filtros"}
          </p>
          <p className="mb-4 text-xs text-muted-foreground">
            {kind === "ALL" && status === "ALL"
              ? "Faça seu primeiro depósito pra ver as transações aparecerem."
              : "Ajuste o tipo ou a situação para ver outras transações."}
          </p>
          {kind === "ALL" && status === "ALL" && (
            <Button asChild size="sm">
              <Link href="/depix-wallet/receive">Receber DePix</Link>
            </Button>
          )}
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {transacoes.map((t) => (
              <TransactionRow key={t.id} tx={t} />
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
            <p className="text-xs text-muted-foreground tabular-nums">
              Página {page + 1} de {Math.max(pageCount, 1)}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || query.isFetching}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page + 1 >= pageCount || query.isFetching}
              >
                Próxima
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
