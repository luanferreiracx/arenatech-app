"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/domain/empty-state";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, CreditCard, Loader2, Pencil } from "lucide-react";

interface BrandDraft {
  id: string | null;
  name: string;
}

const EMPTY_DRAFT: BrandDraft = { id: null, name: "" };

export function CardBrandsTab() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<BrandDraft | null>(null);

  const { data: brands, isLoading } = useQuery(trpc.receiving.brands.list.queryOptions());

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [["receiving", "brands"]] });

  const createMutation = useMutation(
    trpc.receiving.brands.create.mutationOptions({
      onSuccess: () => {
        toast.success("Bandeira criada!");
        invalidate();
        setDraft(null);
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const updateMutation = useMutation(
    trpc.receiving.brands.update.mutationOptions({
      onSuccess: () => {
        toast.success("Bandeira atualizada!");
        invalidate();
        setDraft(null);
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const toggleMutation = useMutation(
    trpc.receiving.brands.toggle.mutationOptions({
      onSuccess: invalidate,
      onError: (e) => toast.error(e.message),
    }),
  );

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSave = () => {
    if (!draft || draft.name.trim().length === 0) return;
    if (draft.id) {
      updateMutation.mutate({ id: draft.id, name: draft.name.trim() });
    } else {
      createMutation.mutate({ name: draft.name.trim() });
    }
  };

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setDraft({ ...EMPTY_DRAFT })}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Bandeira
        </Button>
      </div>

      {!brands || brands.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Nenhuma bandeira"
          description="Cadastre as bandeiras aceitas (Visa, Mastercard, Elo…)."
          action={
            <Button onClick={() => setDraft({ ...EMPTY_DRAFT })}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {brands.map((brand) => (
            <Card key={brand.id} className={brand.active ? "" : "opacity-60"}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">{brand.name}</CardTitle>
                  <Switch
                    checked={brand.active}
                    onCheckedChange={(active) => toggleMutation.mutate({ id: brand.id, active })}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDraft({ id: brand.id, name: brand.name })}
                >
                  <Pencil className="w-3.5 h-3.5 mr-1" />
                  Renomear
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Renomear bandeira" : "Nova bandeira"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Nome</label>
            <Input
              autoFocus
              value={draft?.name ?? ""}
              placeholder="Ex: Visa, Mastercard, Elo"
              onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !draft?.name.trim()}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
