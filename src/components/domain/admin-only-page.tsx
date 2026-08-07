"use client";

import { ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/domain/page-header";

/**
 * Tela para rota que o backend recusa a não-admin.
 *
 * Sem isto, o operador chegava numa página com cabeçalho, seletor de ano e um
 * botão "Exportar CSV" — e **nenhum dado**, sem explicação. O resolver negava
 * corretamente e a UI ficava muda: o pior dos dois mundos, porque o operador
 * conclui que a tela está quebrada. Auditoria 2026-08-06, M9-1.
 */
export function AdminOnlyPage({
  title,
  description,
}: {
  title: string;
  /** O que esta tela mostraria, para o operador saber o que está pedindo ao admin. */
  description: string;
}) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} />
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <ShieldAlert className="h-10 w-10 text-muted-foreground" aria-hidden />
          <p className="text-base font-medium">Disponível apenas para administradores</p>
          <p className="max-w-md text-sm text-muted-foreground break-words">{description}</p>
        </CardContent>
      </Card>
    </div>
  );
}
