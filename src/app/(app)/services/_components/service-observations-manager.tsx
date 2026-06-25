"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Check, ChevronsUpDown, X } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { toast } from "@/lib/toast";

interface ServiceObservation {
  id: string;
  title: string;
  observation: string;
  active: boolean;
  serviceTypes: string[] | null;
  deviceModels: string[] | null;
}

/**
 * Multi-select compacto (Popover + Command) com chips das opcoes selecionadas.
 * Selecao vazia = "aplica-se a todos" (paridade com o filtro do orcamento).
 */
function ScopeMultiSelect({
  label,
  options,
  selected,
  onChange,
  emptyHint,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  emptyHint: string;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className="truncate">
              {selected.length ? `${selected.length} selecionado(s)` : emptyHint}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar..." />
            <CommandList>
              <CommandEmpty>Nenhuma opcao encontrada.</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => (
                  <CommandItem key={opt} value={opt} onSelect={() => toggle(opt)}>
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selected.includes(opt) ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {opt}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((s) => (
            <Badge key={s} variant="secondary" className="gap-1">
              {s}
              <button
                type="button"
                onClick={() => toggle(s)}
                aria-label={`Remover ${s}`}
                className="rounded-sm hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Gerenciador de observacoes concatenadas no orcamento de servico (Copiar /
 * WhatsApp). Cada observacao pode ter escopo por tipo de servico e/ou modelo de
 * aparelho — sem escopo, aplica-se a todos. Paridade Laravel ServicoController.
 */
export function ServiceObservationsManager() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceObservation | null>(null);
  const [title, setTitle] = useState("");
  const [observation, setObservation] = useState("");
  const [serviceTypes, setServiceTypes] = useState<string[]>([]);
  const [deviceModels, setDeviceModels] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);

  const listQuery = useQuery(trpc.catalog.listServiceObservations.queryOptions({}));
  const list = (listQuery.data ?? []) as ServiceObservation[];

  const { data: serviceTypeOptions } = useQuery(trpc.catalog.listServiceTypes.queryOptions());
  const { data: deviceModelOptions } = useQuery(trpc.catalog.listDeviceModels.queryOptions(undefined));

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.catalog.listServiceObservations.queryKey(),
    });

  const createMut = useMutation(
    trpc.catalog.createServiceObservation.mutationOptions({
      onSuccess: () => {
        toast.success("Observacao criada.");
        setDialogOpen(false);
        void invalidate();
      },
      onError: (e: { message: string }) => toast.error(e.message),
    }),
  );

  const updateMut = useMutation(
    trpc.catalog.updateServiceObservation.mutationOptions({
      onSuccess: () => {
        toast.success("Observacao atualizada.");
        setDialogOpen(false);
        void invalidate();
      },
      onError: (e: { message: string }) => toast.error(e.message),
    }),
  );

  const toggleMut = useMutation(
    trpc.catalog.toggleServiceObservation.mutationOptions({
      onSuccess: () => {
        void invalidate();
      },
      onError: (e: { message: string }) => toast.error(e.message),
    }),
  );

  const deleteMut = useMutation(
    trpc.catalog.deleteServiceObservation.mutationOptions({
      onSuccess: () => {
        toast.success("Observacao excluida.");
        void invalidate();
      },
      onError: (e: { message: string }) => toast.error(e.message),
    }),
  );

  function openCreate() {
    setEditing(null);
    setTitle("");
    setObservation("");
    setServiceTypes([]);
    setDeviceModels([]);
    setDialogOpen(true);
  }

  function openEdit(obs: ServiceObservation) {
    setEditing(obs);
    setTitle(obs.title);
    setObservation(obs.observation);
    setServiceTypes(obs.serviceTypes ?? []);
    setDeviceModels(obs.deviceModels ?? []);
    setDialogOpen(true);
  }

  function save() {
    if (!title.trim() || !observation.trim()) {
      toast.error("Preencha titulo e observacao.");
      return;
    }
    // Selecao vazia = sem escopo (null no banco) = aplica-se a todos.
    const payload = {
      title,
      observation,
      serviceTypes: serviceTypes.length ? serviceTypes : null,
      deviceModels: deviceModels.length ? deviceModels : null,
    };
    if (editing) {
      updateMut.mutate({ id: editing.id, ...payload });
    } else {
      createMut.mutate(payload);
    }
  }

  return (
    <div className="rounded-lg border border-border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Observacoes do Orcamento</h3>
          <p className="text-sm text-muted-foreground">
            Textos incluidos automaticamente nos orcamentos de servico (Copiar / WhatsApp).
          </p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Nova Observacao
        </Button>
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center border border-dashed rounded-md">
          Nenhuma observacao cadastrada.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-b border-border">
              <tr>
                <th className="py-2 pr-4">Titulo</th>
                <th className="py-2 pr-4">Texto</th>
                <th className="py-2 pr-4">Aplica-se a</th>
                <th className="py-2 pr-4 w-24 text-center">Ativa</th>
                <th className="py-2 pr-4 w-24 text-right">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {list.map((obs) => {
                const scope = [...(obs.serviceTypes ?? []), ...(obs.deviceModels ?? [])];
                return (
                  <tr key={obs.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 pr-4 font-medium">{obs.title}</td>
                    <td className="py-2 pr-4 text-muted-foreground max-w-md truncate">
                      {obs.observation}
                    </td>
                    <td className="py-2 pr-4">
                      {scope.length === 0 ? (
                        <span className="text-xs text-muted-foreground">Todos os servicos</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {scope.map((s) => (
                            <Badge key={s} variant="outline" className="text-xs font-normal">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-center">
                      <Switch
                        checked={obs.active}
                        onCheckedChange={() => toggleMut.mutate({ id: obs.id })}
                      />
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Editar observacao ${obs.title}`}
                        onClick={() => openEdit(obs)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        aria-label={`Excluir observacao ${obs.title}`}
                        onClick={() => setConfirmDelete({ id: obs.id, title: obs.title })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar observacao" : "Nova observacao"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Titulo *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Garantia de 90 dias"
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label>Texto da observacao *</Label>
              <Textarea
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
                placeholder="Texto que aparece no orcamento."
                rows={5}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ScopeMultiSelect
                label="Tipos de servico"
                options={serviceTypeOptions ?? []}
                selected={serviceTypes}
                onChange={setServiceTypes}
                emptyHint="Todos os tipos"
              />
              <ScopeMultiSelect
                label="Modelos de aparelho"
                options={deviceModelOptions ?? []}
                selected={deviceModels}
                onChange={setDeviceModels}
                emptyHint="Todos os modelos"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Deixe ambos em branco para a observacao se aplicar a todos os orcamentos.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={createMut.isPending || updateMut.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
        title={confirmDelete ? `Excluir observacao "${confirmDelete.title}"?` : ""}
        description="A observacao sera removida e nao podera ser usada em novas OS."
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={() => {
          if (confirmDelete) {
            deleteMut.mutate({ id: confirmDelete.id });
            setConfirmDelete(null);
          }
        }}
        isLoading={deleteMut.isPending}
      />
    </div>
  );
}
