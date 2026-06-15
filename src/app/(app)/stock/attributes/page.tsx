"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, ChevronDown, ChevronRight, Trash2, Pencil } from "lucide-react";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";

export default function AttributesPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newAttrName, setNewAttrName] = useState("");
  const [newValueName, setNewValueName] = useState("");
  const [newValueAttrId, setNewValueAttrId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Dialog global controlado (1 por pagina, nao 1 por linha) para confirmar
  // exclusoes destrutivas de atributo/valor.
  const [deleteAttrTarget, setDeleteAttrTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteValueTarget, setDeleteValueTarget] = useState<{ id: string; label: string } | null>(null);

  const { data: attributes } = useQuery(
    trpc.stock.listAttributes.queryOptions({ active: undefined })
  );

  const createAttr = useMutation(
    trpc.stock.createAttribute.mutationOptions({
      onSuccess: () => {
        toast.success("Atributo criado");
        queryClient.invalidateQueries({ queryKey: [["stock", "listAttributes"]] });
        setNewAttrName("");
        setDialogOpen(false);
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const deleteAttr = useMutation(
    trpc.stock.deleteAttribute.mutationOptions({
      onSuccess: () => {
        toast.success("Atributo removido");
        queryClient.invalidateQueries({ queryKey: [["stock", "listAttributes"]] });
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const createValue = useMutation(
    trpc.stock.createAttributeValue.mutationOptions({
      onSuccess: () => {
        toast.success("Valor adicionado");
        queryClient.invalidateQueries({ queryKey: [["stock", "listAttributes"]] });
        setNewValueName("");
        setNewValueAttrId(null);
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const deleteValue = useMutation(
    trpc.stock.deleteAttributeValue.mutationOptions({
      onSuccess: () => {
        toast.success("Valor desativado");
        queryClient.invalidateQueries({ queryKey: [["stock", "listAttributes"]] });
      },
      onError: (e) => toast.error(e.message),
    })
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Atributos de Produto"
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Novo Atributo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo Atributo</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Input
                  placeholder="Nome do atributo (ex: Cor, Armazenamento)"
                  value={newAttrName}
                  onChange={(e) => setNewAttrName(e.target.value)}
                />
                <Button
                  onClick={() => createAttr.mutate({ name: newAttrName })}
                  disabled={!newAttrName.trim() || createAttr.isPending}
                  className="w-full"
                >
                  Criar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Valores</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-20">Acoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {attributes?.map((attr) => (
              <>
                <TableRow
                  key={attr.id}
                  className="cursor-pointer"
                  onClick={() => setExpandedId(expandedId === attr.id ? null : attr.id)}
                >
                  <TableCell>
                    {expandedId === attr.id ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{attr.name}</TableCell>
                  <TableCell className="text-muted-foreground">{attr.slug}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{attr.values.length} valores</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={attr.active ? "default" : "outline"}>
                      {attr.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Excluir atributo ${attr.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteAttrTarget({ id: attr.id, name: attr.name });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
                {expandedId === attr.id && (
                  <TableRow key={`${attr.id}-values`}>
                    <TableCell colSpan={6} className="bg-muted/50 p-4">
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium">Valores de &quot;{attr.name}&quot;</h4>
                        <div className="flex flex-wrap gap-2">
                          {attr.values.map((val) => (
                            <Badge
                              key={val.id}
                              variant="outline"
                              className="flex items-center gap-1"
                            >
                              {val.displayValue || val.value}
                              <button
                                aria-label={`Remover valor ${val.displayValue || val.value}`}
                                onClick={() =>
                                  setDeleteValueTarget({ id: val.id, label: val.displayValue || val.value })
                                }
                                className="ml-1 text-destructive hover:text-destructive/80"
                              >
                                ×
                              </button>
                            </Badge>
                          ))}
                        </div>
                        <div className="flex gap-2 max-w-xs">
                          <Input
                            placeholder="Novo valor..."
                            value={newValueAttrId === attr.id ? newValueName : ""}
                            onChange={(e) => {
                              setNewValueAttrId(attr.id);
                              setNewValueName(e.target.value);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && newValueName.trim()) {
                                createValue.mutate({
                                  attributeId: attr.id,
                                  value: newValueName.trim(),
                                });
                              }
                            }}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!newValueName.trim() || newValueAttrId !== attr.id}
                            onClick={() => {
                              if (newValueName.trim()) {
                                createValue.mutate({
                                  attributeId: attr.id,
                                  value: newValueName.trim(),
                                });
                              }
                            }}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
            {(!attributes || attributes.length === 0) && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nenhum atributo cadastrado. Crie atributos como &quot;Cor&quot; ou &quot;Armazenamento&quot;.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={!!deleteAttrTarget}
        onOpenChange={(o) => !o && setDeleteAttrTarget(null)}
        title="Excluir atributo"
        description={`Remover o atributo "${deleteAttrTarget?.name ?? ""}" e seus valores? Esta acao nao pode ser desfeita.`}
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={() => {
          if (deleteAttrTarget) deleteAttr.mutate({ id: deleteAttrTarget.id });
          setDeleteAttrTarget(null);
        }}
      />

      <ConfirmDialog
        open={!!deleteValueTarget}
        onOpenChange={(o) => !o && setDeleteValueTarget(null)}
        title="Remover valor"
        description={`Remover o valor "${deleteValueTarget?.label ?? ""}"?`}
        confirmLabel="Remover"
        variant="destructive"
        onConfirm={() => {
          if (deleteValueTarget) deleteValue.mutate({ id: deleteValueTarget.id });
          setDeleteValueTarget(null);
        }}
      />
    </div>
  );
}
