"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Pencil,
  Trash2,
  Copy,
  Folder,
  Smartphone,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";

function formatCurrency(v: unknown): string {
  return Number(v ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

type CatalogCategory = {
  id: string;
  name: string;
  slug: string;
  order: number;
  _count?: { devices: number };
};

type CatalogDevice = {
  id: string;
  categoryId: string | null;
  name: string;
  condition: string | null;
  description: string | null;
  price: number | string | null;
  promotionalPrice: number | string | null;
  imageUrl: string | null;
  available: boolean;
  featured: boolean;
  order: number;
};

export function DeviceCatalogAdmin() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Categorias
  const categoriesQuery = useQuery(trpc.catalog.listCatalogCategories.queryOptions());
  const categories = (categoriesQuery.data ?? []) as CatalogCategory[];

  // Aparelhos da categoria selecionada (ou todos se nao houver selecao)
  const devicesQuery = useQuery(
    trpc.catalog.listCatalogDevices.queryOptions({
      categoryId: selectedCategoryId ?? undefined,
      pageSize: 100,
    } as never),
  );
  const devicesData = devicesQuery.data as { data?: CatalogDevice[] } | undefined;
  const devices = devicesData?.data ?? [];

  // Dialogs
  const [categoryDialog, setCategoryDialog] = useState<{ id?: string; name: string } | null>(null);
  const [deviceDialog, setDeviceDialog] = useState<Partial<CatalogDevice> | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: trpc.catalog.listCatalogCategories.queryKey() });
    queryClient.invalidateQueries({ queryKey: trpc.catalog.listCatalogDevices.queryKey() });
  };

  // Categoria mutations
  const createCategoryMut = useMutation(trpc.catalog.createCatalogCategory.mutationOptions({
    onSuccess: () => { invalidate(); toast.success("Categoria criada"); setCategoryDialog(null); },
    onError: (e) => toast.error(e.message),
  }));
  const updateCategoryMut = useMutation(trpc.catalog.updateCatalogCategory.mutationOptions({
    onSuccess: () => { invalidate(); toast.success("Categoria atualizada"); setCategoryDialog(null); },
    onError: (e) => toast.error(e.message),
  }));
  const deleteCategoryMut = useMutation(trpc.catalog.deleteCatalogCategory.mutationOptions({
    onSuccess: () => { invalidate(); toast.success("Categoria removida"); },
    onError: (e) => toast.error(e.message),
  }));
  const duplicateCategoryMut = useMutation(trpc.catalog.duplicateCatalogCategory.mutationOptions({
    onSuccess: () => { invalidate(); toast.success("Categoria duplicada"); },
    onError: (e) => toast.error(e.message),
  }));

  // Device mutations
  const createDeviceMut = useMutation(trpc.catalog.createCatalogDevice.mutationOptions({
    onSuccess: () => { invalidate(); toast.success("Aparelho criado"); setDeviceDialog(null); },
    onError: (e) => toast.error(e.message),
  }));
  const updateDeviceMut = useMutation(trpc.catalog.updateCatalogDevice.mutationOptions({
    onSuccess: () => { invalidate(); toast.success("Aparelho atualizado"); setDeviceDialog(null); },
    onError: (e) => toast.error(e.message),
  }));
  const deleteDeviceMut = useMutation(trpc.catalog.deleteCatalogDevice.mutationOptions({
    onSuccess: () => { invalidate(); toast.success("Aparelho removido"); },
    onError: (e) => toast.error(e.message),
  }));
  const duplicateDeviceMut = useMutation(trpc.catalog.duplicateCatalogDevice.mutationOptions({
    onSuccess: () => { invalidate(); toast.success("Aparelho duplicado"); },
    onError: (e) => toast.error(e.message),
  }));

  const handleSaveCategory = () => {
    if (!categoryDialog?.name || categoryDialog.name.length < 2) {
      toast.error("Informe um nome com pelo menos 2 caracteres");
      return;
    }
    if (categoryDialog.id) {
      updateCategoryMut.mutate({ id: categoryDialog.id, name: categoryDialog.name });
    } else {
      createCategoryMut.mutate({ name: categoryDialog.name });
    }
  };

  const handleSaveDevice = () => {
    if (!deviceDialog?.name || deviceDialog.name.length < 2) {
      toast.error("Informe um nome com pelo menos 2 caracteres");
      return;
    }
    const payload = {
      categoryId: deviceDialog.categoryId ?? selectedCategoryId ?? null,
      name: deviceDialog.name,
      condition: deviceDialog.condition ?? null,
      description: deviceDialog.description ?? null,
      price: deviceDialog.price != null ? Number(deviceDialog.price) : null,
      promotionalPrice: deviceDialog.promotionalPrice != null ? Number(deviceDialog.promotionalPrice) : null,
      imageUrl: deviceDialog.imageUrl ?? null,
      available: deviceDialog.available ?? true,
      featured: deviceDialog.featured ?? false,
    };
    if (deviceDialog.id) {
      updateDeviceMut.mutate({ id: deviceDialog.id, ...payload } as never);
    } else {
      createDeviceMut.mutate(payload as never);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
      {/* Coluna categorias */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm flex items-center gap-1">
              <Folder className="h-4 w-4" /> Categorias
            </h2>
            <Button size="sm" variant="outline" onClick={() => setCategoryDialog({ name: "" })}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {categoriesQuery.isLoading && (
            <div className="text-sm text-muted-foreground text-center py-4">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Carregando...
            </div>
          )}

          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setSelectedCategoryId(null)}
              className={`w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors ${
                selectedCategoryId === null ? "bg-primary/10 font-medium" : "hover:bg-muted"
              }`}
            >
              Todas
            </button>
            {categories.map((cat) => (
              <div
                key={cat.id}
                className={`group flex items-center gap-1 rounded-md ${
                  selectedCategoryId === cat.id ? "bg-primary/10" : "hover:bg-muted"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className="flex-1 text-left px-2 py-1.5 text-sm"
                >
                  {cat.name}
                  {cat._count?.devices != null && (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      ({cat._count.devices})
                    </span>
                  )}
                </button>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex">
                  <button
                    type="button"
                    onClick={() => setCategoryDialog({ id: cat.id, name: cat.name })}
                    className="p-1 hover:text-primary"
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => duplicateCategoryMut.mutate({ id: cat.id })}
                    className="p-1 hover:text-primary"
                    title="Duplicar"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Remover categoria "${cat.name}"?`)) {
                        deleteCategoryMut.mutate({ id: cat.id });
                      }
                    }}
                    className="p-1 hover:text-destructive"
                    title="Excluir"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Coluna aparelhos */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm flex items-center gap-1">
              <Smartphone className="h-4 w-4" /> Aparelhos
              {selectedCategoryId && (
                <span className="ml-2 text-xs text-muted-foreground">
                  ({categories.find((c) => c.id === selectedCategoryId)?.name})
                </span>
              )}
            </h2>
            <Button
              size="sm"
              onClick={() => setDeviceDialog({
                categoryId: selectedCategoryId,
                name: "",
                available: true,
              })}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Novo aparelho
            </Button>
          </div>

          {devicesQuery.isLoading && (
            <div className="text-sm text-muted-foreground text-center py-8">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Carregando...
            </div>
          )}

          {!devicesQuery.isLoading && devices.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-8">
              Nenhum aparelho nesta categoria.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {devices.map((d) => (
              <Card key={d.id} className="overflow-hidden">
                <CardContent className="p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-sm flex-1">{d.name}</div>
                    <div className="flex gap-0.5">
                      <button
                        type="button"
                        onClick={() => setDeviceDialog(d)}
                        className="p-1 hover:text-primary"
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => duplicateDeviceMut.mutate({ id: d.id })}
                        className="p-1 hover:text-primary"
                        title="Duplicar"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Remover ${d.name}?`)) deleteDeviceMut.mutate({ id: d.id });
                        }}
                        className="p-1 hover:text-destructive"
                        title="Excluir"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {d.condition && (
                    <div className="text-xs text-muted-foreground">{d.condition}</div>
                  )}
                  <div className="text-sm">
                    {d.promotionalPrice != null && Number(d.promotionalPrice) > 0 ? (
                      <>
                        <span className="text-muted-foreground line-through mr-2">
                          {formatCurrency(d.price)}
                        </span>
                        <span className="text-green-600 font-semibold">
                          {formatCurrency(d.promotionalPrice)}
                        </span>
                      </>
                    ) : (
                      <span className="font-semibold">{formatCurrency(d.price)}</span>
                    )}
                  </div>
                  <div className="flex gap-2 text-xs">
                    {!d.available && <span className="px-1.5 py-0.5 bg-muted rounded">Indisponível</span>}
                    {d.featured && <span className="px-1.5 py-0.5 bg-primary/10 text-primary rounded">Destaque</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dialog Categoria */}
      <Dialog open={!!categoryDialog} onOpenChange={(o) => !o && setCategoryDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {categoryDialog?.id ? "Editar Categoria" : "Nova Categoria"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input
                autoFocus
                value={categoryDialog?.name ?? ""}
                onChange={(e) => setCategoryDialog((d) => d ? { ...d, name: e.target.value } : d)}
                placeholder="Ex: iPhones"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialog(null)}>Cancelar</Button>
            <Button onClick={handleSaveCategory} disabled={createCategoryMut.isPending || updateCategoryMut.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Aparelho */}
      <Dialog open={!!deviceDialog} onOpenChange={(o) => !o && setDeviceDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {deviceDialog?.id ? "Editar Aparelho" : "Novo Aparelho"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
            <div>
              <Label>Nome do aparelho *</Label>
              <Input
                autoFocus
                value={deviceDialog?.name ?? ""}
                onChange={(e) => setDeviceDialog((d) => d ? { ...d, name: e.target.value } : d)}
                placeholder="Ex: iPhone 15 Pro 256GB"
              />
            </div>

            <div>
              <Label>Categoria</Label>
              <select
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                value={deviceDialog?.categoryId ?? ""}
                onChange={(e) => setDeviceDialog((d) => d ? { ...d, categoryId: e.target.value || null } : d)}
              >
                <option value="">— sem categoria —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Preço (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={deviceDialog?.price != null ? String(deviceDialog.price) : ""}
                  onChange={(e) => setDeviceDialog((d) => d ? { ...d, price: e.target.value === "" ? null : Number(e.target.value) } : d)}
                />
              </div>
              <div>
                <Label>Preço promocional (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={deviceDialog?.promotionalPrice != null ? String(deviceDialog.promotionalPrice) : ""}
                  onChange={(e) => setDeviceDialog((d) => d ? { ...d, promotionalPrice: e.target.value === "" ? null : Number(e.target.value) } : d)}
                />
              </div>
            </div>

            <div>
              <Label>Condição</Label>
              <Input
                value={deviceDialog?.condition ?? ""}
                onChange={(e) => setDeviceDialog((d) => d ? { ...d, condition: e.target.value } : d)}
                placeholder="Novo, Seminovo, Usado..."
              />
            </div>

            <div>
              <Label>Descrição</Label>
              <Input
                value={deviceDialog?.description ?? ""}
                onChange={(e) => setDeviceDialog((d) => d ? { ...d, description: e.target.value } : d)}
                placeholder="Detalhes opcionais"
              />
            </div>

            <div>
              <Label>URL da imagem</Label>
              <Input
                value={deviceDialog?.imageUrl ?? ""}
                onChange={(e) => setDeviceDialog((d) => d ? { ...d, imageUrl: e.target.value } : d)}
                placeholder="https://..."
              />
            </div>

            <div className="flex gap-6 pt-2">
              <div className="flex items-center gap-2">
                <Switch
                  checked={deviceDialog?.available ?? true}
                  onCheckedChange={(v) => setDeviceDialog((d) => d ? { ...d, available: v } : d)}
                />
                <Label>Disponível</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={deviceDialog?.featured ?? false}
                  onCheckedChange={(v) => setDeviceDialog((d) => d ? { ...d, featured: v } : d)}
                />
                <Label>Destaque</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeviceDialog(null)}>Cancelar</Button>
            <Button onClick={handleSaveDevice} disabled={createDeviceMut.isPending || updateDeviceMut.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
