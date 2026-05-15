"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";
import type { CreateProviderInput } from "@/lib/validators/provider-commission";

export function NewProviderForm() {
  const trpc = useTRPC();
  const router = useRouter();

  const [userId, setUserId] = useState("");
  const [profile, setProfile] = useState<"SELLER" | "TECHNICIAN">("SELLER");
  const [bondType, setBondType] = useState<"MEI" | "CLT">("MEI");
  const [cpf, setCpf] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [cnpjMei, setCnpjMei] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [cnaePrincipal, setCnaePrincipal] = useState("");

  const usersQuery = useQuery(
    trpc.providerCommission.listAvailableUsers.queryOptions(),
  );

  const createMutation = useMutation(
    trpc.providerCommission.createProvider.mutationOptions(),
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!userId) {
      toast.error("Selecione um usuario");
      return;
    }

    const input: CreateProviderInput = {
      userId,
      profile,
      bondType,
      cpf: cpf || null,
      whatsapp: whatsapp || null,
      cnpjMei: bondType === "MEI" ? (cnpjMei || null) : null,
      razaoSocial: bondType === "MEI" ? (razaoSocial || null) : null,
      cnaePrincipal: bondType === "MEI" ? (cnaePrincipal || null) : null,
    };

    createMutation.mutate(input, {
      onSuccess: (data) => {
        toast.success("Prestador cadastrado. Preencha as aliquotas do contrato.");
        router.push(`/commissions/providers/${data.id}`);
      },
      onError: (err) => toast.error(err.message),
    });
  };

  if (usersQuery.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  const availableUsers = usersQuery.data ?? [];

  return (
    <form onSubmit={handleSubmit}>
      <Card className="p-6 max-w-2xl">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Usuario do sistema</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} ({u.cpf})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-1">
              So aparecem usuarios que ainda nao sao prestadores.
            </p>
          </div>

          <div>
            <Label className="text-xs">Perfil</Label>
            <Select value={profile} onValueChange={(v) => setProfile(v as "SELLER" | "TECHNICIAN")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SELLER">Vendedor</SelectItem>
                <SelectItem value="TECHNICIAN">Tecnico</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Tipo de vinculo</Label>
            <Select value={bondType} onValueChange={(v) => setBondType(v as "MEI" | "CLT")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MEI">MEI (CNPJ) — prestador autonomo</SelectItem>
                <SelectItem value="CLT">CLT (CPF) — funcionario</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">CPF</Label>
            <Input
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              placeholder="000.000.000-00"
            />
          </div>

          {bondType === "MEI" && (
            <>
              <div>
                <Label className="text-xs">CNPJ MEI</Label>
                <Input
                  value={cnpjMei}
                  onChange={(e) => setCnpjMei(e.target.value)}
                  placeholder="00.000.000/0001-00"
                />
              </div>

              <div>
                <Label className="text-xs">CNAE principal</Label>
                <Input
                  value={cnaePrincipal}
                  onChange={(e) => setCnaePrincipal(e.target.value)}
                />
              </div>

              <div className="col-span-2">
                <Label className="text-xs">Razao social</Label>
                <Input
                  value={razaoSocial}
                  onChange={(e) => setRazaoSocial(e.target.value)}
                />
              </div>
            </>
          )}

          <div>
            <Label className="text-xs">WhatsApp</Label>
            <Input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="(00) 00000-0000"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Cadastrando..." : "Cadastrar prestador"}
          </Button>
        </div>
      </Card>
    </form>
  );
}
