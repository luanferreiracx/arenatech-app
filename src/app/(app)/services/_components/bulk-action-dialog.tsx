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

interface BulkActionDialogProps {
  action: { action: BulkAction; serviceType: string } | null;
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
    trpc.catalog.deleteByType.mutationOptions({
      onSuccess: (data) => {
        toast.success(`${data.deleted} servico(s) excluidos!`);
        invalidate();
        handleClose();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const duplicateType = useMutation(
    trpc.catalog.duplicateType.mutationOptions({
      onSuccess: (data) => {
        toast.success(`${data.created} servico(s) duplicados!`);
        invalidate();
        handleClose();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const renameType = useMutation(
    trpc.catalog.renameType.mutationOptions({
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
          serviceType: action.serviceType,
          adjustmentCents: adjustValue,
        });
        break;
      case "adjust-down":
        if (adjustValue <= 0) {
          toast.error("Informe um valor positivo");
          return;
        }
        bulkAdjust.mutate({
          serviceType: action.serviceType,
          adjustmentCents: -adjustValue,
        });
        break;
      case "duplicate":
        if (!newName.trim()) {
          toast.error("Informe o nome do novo tipo");
          return;
        }
        duplicateType.mutate({
          sourceType: action.serviceType,
          newType: newName.trim(),
        });
        break;
      case "rename":
        if (!newName.trim()) {
          toast.error("Informe o novo nome");
          return;
        }
        renameType.mutate({
          oldName: action.serviceType,
          newName: newName.trim(),
        });
        break;
      case "delete-type":
        deleteByType.mutate({ serviceType: action.serviceType });
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
    "adjust-up": `Aumentar o valor de todos os servicos do tipo "${action.serviceType}".`,
    "adjust-down": `Diminuir o valor de todos os servicos do tipo "${action.serviceType}".`,
    duplicate: `Duplicar todos os servicos do tipo "${action.serviceType}" com um novo nome.`,
    rename: `Renomear o tipo "${action.serviceType}" para um novo nome.`,
    "delete-type": `Tem certeza que deseja excluir TODOS os servicos do tipo "${action.serviceType}"? Esta acao nao pode ser desfeita.`,
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
              <Label>Valor do ajuste</Label>
              <MoneyInput value={adjustValue} onChange={setAdjustValue} />
            </div>
          )}

          {(action.action === "duplicate" || action.action === "rename") && (
            <div className="space-y-2">
              <Label>
                {action.action === "duplicate" ? "Nome do novo tipo" : "Novo nome"}
              </Label>
              <Input
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
