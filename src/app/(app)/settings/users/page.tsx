"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/domain/page-header";
import { EmptyState } from "@/components/domain/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  operator: "Operador",
  technician: "Tecnico",
  cashier: "Caixa",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  operator: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  technician: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  cashier: "bg-green-500/10 text-green-500 border-green-500/20",
};

function formatCpf(cpf: string): string {
  if (cpf.length !== 11) return cpf;
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

export default function UsersPage() {
  const trpc = useTRPC();
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery(
    trpc.settings.listUsers.queryOptions({ search, pageSize: 50 }),
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Usuarios" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const users = data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios do tenant"
        subtitle="Consulta das contas vinculadas a esta loja"
      />

      <Card>
        <CardContent className="flex gap-3 p-4 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p>
            Cadastro, alteracao de acesso, remocao e reset de senha de usuarios
            sao feitos pelo Superadmin em Admin &gt; Tenants &gt; Detalhe do Tenant.
          </p>
        </CardContent>
      </Card>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou CPF..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="pl-9"
        />
      </div>

      {users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum usuario encontrado"
          description="Nenhuma conta esta vinculada a este tenant."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {users.length} usuario{users.length !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Tipo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.userId}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell className="font-mono text-sm">{formatCpf(user.cpf)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={ROLE_COLORS[user.role] ?? ""}>
                        {ROLE_LABELS[user.role] ?? user.role}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
