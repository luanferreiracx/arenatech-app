"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/inputs/money-input";
import { toast } from "@/lib/toast";
import { Loader2 } from "lucide-react";

export type BulkAction = "adjust-up" | "adjust-down" | "duplicate" | "rename" | "delete-type";

/**
 * A acao em massa carrega o ID do tipo (nao o nome). Auditoria 2026-07-25, item
 * 17: enquanto era o nome, "Troca de Tela" e "troca de tela" eram alvos
 * diferentes e o reajuste pegava so metade dos servicos. O nome vem junto
 * apenas para o texto do dialogo.
 */
interface BulkActionDialogProps {
  action: { action: BulkAction; serviceTypeId: string; serviceTypeName: string } | null;
  onClose: () => void;
}

export function BulkActionDialog({ action, onClose }: BulkActionDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [adjustValue, setAdjustValue] = useState(0);
  const [newName, setNewName] = useState("");

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [["catalog"]] });

  const bulkAdjust = useMutation(
    trpc.catalog.bulkAdjustPrice.mutationOptions({
      onSuccess: (data) => {
        toast.success(`${data.updated} servico(s) atualizados!`);
        invalidate();
        handleClose();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const deleteByType = useMutation(
    trpc.catalog.deleteServiceType.mutationOptions({
      onSuccess: () => {
        toast.success("Tipo e servicos excluidos!");
        invalidate();
        handleClose();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const duplicateType = useMutation(
    trpc.catalog.duplicateServiceType.mutationOptions({
      onSuccess: (data) => {
        toast.success(`${data.copiedCount} servico(s) duplicados!`);
        invalidate();
        handleClose();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const renameType = useMutation(
    trpc.catalog.renameServiceType.mutationOptions({
      onSuccess: (data) => {
        toast.success(`${data.updated} servico(s) renomeados!`);
        invalidate();
        handleClose();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  function handleClose() {
    setAdjustValue(0);
    setNewName("");
    onClose();
  }

  function handleConfirm() {
    if (!action) return;

    switch (action.action) {
      case "adjust-up":
        if (adjustValue <= 0) {
          toast.error("Informe um valor positivo");
          return;
        }
        bulkAdjust.mutate({
          serviceTypeId: action.serviceTypeId,
          adjustmentCents: adjustValue,
        });
        break;
      case "adjust-down":
        if (adjustValue <= 0) {
          toast.error("Informe um valor positivo");
          return;
        }
        bulkAdjust.mutate({
          serviceTypeId: action.serviceTypeId,
          adjustmentCents: -adjustValue,
        });
        break;
      case "duplicate":
        if (!newName.trim()) {
          toast.error("Informe o nome do novo tipo");
          return;
        }
        duplicateType.mutate({
          sourceId: action.serviceTypeId,
          newName: newName.trim(),
        });
        break;
      case "rename":
        if (!newName.trim()) {
          toast.error("Informe o novo nome");
          return;
        }
        renameType.mutate({
          id: action.serviceTypeId,
          newName: newName.trim(),
        });
        break;
      case "delete-type":
        deleteByType.mutate({ id: action.serviceTypeId });
        break;
    }
  }

  const isPending =
    bulkAdjust.isPending ||
    deleteByType.isPending ||
    duplicateType.isPending ||
    renameType.isPending;

  if (!action) return null;

  const titles: Record<BulkAction, string> = {
    "adjust-up": "Aumentar Valores",
    "adjust-down": "Diminuir Valores",
    duplicate: "Duplicar Tipo",
    rename: "Renomear Tipo",
    "delete-type": "Excluir Tipo",
  };

  const descriptions: Record<BulkAction, string> = {
    "adjust-up": `Aumentar o valor de todos os servicos do tipo "${action.serviceTypeName}".`,
    "adjust-down": `Diminuir o valor de todos os servicos do tipo "${action.serviceTypeName}".`,
    duplicate: `Duplicar todos os servicos do tipo "${action.serviceTypeName}" com um novo nome.`,
    rename: `Renomear o tipo "${action.serviceTypeName}" para um novo nome.`,
    "delete-type": `Tem certeza que deseja excluir TODOS os servicos do tipo "${action.serviceTypeName}"? Esta acao nao pode ser desfeita.`,
  };

  return (
    <Dialog open onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titles[action.action]}</DialogTitle>
          <DialogDescription>{descriptions[action.action]}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {(action.action === "adjust-up" || action.action === "adjust-down") && (
            <div className="space-y-2">
              <Label htmlFor="valor-do-ajuste">Valor do ajuste</Label>
              <MoneyInput id="valor-do-ajuste" value={adjustValue} onChange={setAdjustValue} />
            </div>
          )}

          {(action.action === "duplicate" || action.action === "rename") && (
            <div className="space-y-2">
              <Label htmlFor="bulk-novo-nome">
                {action.action === "duplicate" ? "Nome do novo tipo" : "Novo nome"}
              </Label>
              <Input
                id="bulk-novo-nome"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Troca de Tela Premium"
                autoFocus
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            variant={action.action === "delete-type" ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {action.action === "delete-type" ? "Excluir Tudo" : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
