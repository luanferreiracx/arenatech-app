"use client";

import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { EmptyState } from "@/components/domain/empty-state";
import { StatusBadge } from "@/components/domain/status-badge";
import { format } from "date-fns";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  operator: "Operador",
  manager: "Gerente",
  OWNER: "Proprietario",
  MANAGER: "Gerente",
  OPERATOR: "Operador",
  TECHNICIAN: "Tecnico",
  CASHIER: "Caixa",
};

const ROLE_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
  admin: "warning",
  OWNER: "warning",
  MANAGER: "info",
  operator: "default",
  OPERATOR: "default",
  TECHNICIAN: "success",
  CASHIER: "info",
};

export default function TeamPage() {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(trpc.settings.listTeam.queryOptions());

  return (
    <div>
      <PageHeader
        title="Equipe"
        subtitle="Consulta das contas de acesso. Cadastro e permissoes sao administrados pelo Superadmin."
      />

      {isLoading && <LoadingState />}

      {!isLoading && data && (
        <Card>
          <CardContent className="p-0">
            {data.length === 0 ? (
              <EmptyState title="Nenhum membro" description="Adicione membros a equipe." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium text-muted-foreground">Nome</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">CPF</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Acesso</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Perfil</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Desde</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((member) => (
                      <tr key={member.userId} className="border-b hover:bg-muted/30">
                        <td className="p-3">
                          <strong>{member.name}</strong>
                          {member.email && (
                            <div className="text-xs text-muted-foreground">{member.email}</div>
                          )}
                        </td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">
                          {member.cpf}
                        </td>
                        <td className="p-3">
                          <StatusBadge
                            variant={ROLE_VARIANTS[member.accessRole] ?? "default"}
                          >{ROLE_LABELS[member.accessRole] ?? member.accessRole}</StatusBadge>
                        </td>
                        <td className="p-3">
                          {member.tenantRole ? (
                            <StatusBadge
                              variant={ROLE_VARIANTS[member.tenantRole] ?? "default"}
                            >{ROLE_LABELS[member.tenantRole] ?? member.tenantRole}</StatusBadge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {format(new Date(member.createdAt), "dd/MM/yyyy")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
