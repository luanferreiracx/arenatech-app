"use client";

import { useState, useMemo } from "react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Pencil,
  Trash2,
  Copy,
  Folder,
  Smartphone,
  Search,
  MoreHorizontal,
  Star,
  ImageOff,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { EmptyState } from "@/components/domain/empty-state";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

function fmt(v: unknown): string {
  return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

// ── Category Sidebar ──────────────────────────────────────────────────────────

function CategorySidebar({
  categories,
  selected,
  onSelect,
  onNew,
  onEdit,
  onDuplicate,
  onDelete,
  isLoading,
}: {
  categories: CatalogCategory[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onNew: () => void;
  onEdit: (cat: CatalogCategory) => void;
  onDuplicate: (id: string) => void;
  onDelete: (cat: CatalogCategory) => void;
  isLoading: boolean;
}) {
  const total = categories.reduce((s, c) => s + (c._count?.devices ?? 0), 0);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Categorias
        </span>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onNew} title="Nova categoria">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-1.5 px-1">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full rounded-md" />)}
        </div>
      ) : (
        <>
          {/* "Todos" item */}
          <button
            type="button"
            onClick={() => onSelect(null)}
            className={cn(
              "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
              selected === null
                ? "bg-primary/10 font-semibold text-primary"
                : "text-foreground hover:bg-muted",
            )}
          >
            <span className="flex items-center gap-2">
              <Folder className="h-3.5 w-3.5" />
              Todos
            </span>
            <Badge variant="secondary" className="font-mono text-[10px]">{total}</Badge>
          </button>

          {categories.map((cat) => (
            <div key={cat.id} className="group relative">
              <button
                type="button"
                onClick={() => onSelect(cat.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors pr-8",
                  selected === cat.id
                    ? "bg-primary/10 font-semibold text-primary"
                    : "text-foreground hover:bg-muted",
                )}
              >
                <span className="truncate">{cat.name}</span>
                {cat._count?.devices != null && (
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {cat._count.devices}
                  </Badge>
                )}
              </button>

              <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Acoes da categoria">
                      <MoreHorizontal className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => onEdit(cat)}>
                      <Pencil className="mr-2 h-3.5 w-3.5" /> Renomear
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDuplicate(cat.id)}>
                      <Copy className="mr-2 h-3.5 w-3.5" /> Duplicar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => onDelete(cat)}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── Device Row ────────────────────────────────────────────────────────────────

function DeviceRow({
  device,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleAvailable,
}: {
  device: CatalogDevice;
  onEdit: (d: CatalogDevice) => void;
  onDuplicate: (id: string) => void;
  onDelete: (d: CatalogDevice) => void;
  onToggleAvailable: (id: string, v: boolean) => void;
}) {
  const hasPromo = device.promotionalPrice != null && Number(device.promotionalPrice) > 0;
  const pixPrice = hasPromo ? device.promotionalPrice : device.price;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/30">
      {/* Thumbnail */}
      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-border bg-muted flex items-center justify-center">
        {device.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={device.imageUrl} alt={device.name} className="h-full w-full object-cover" />
        ) : (
          <ImageOff className="h-4 w-4 text-muted-foreground/40" />
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{device.name}</span>
          {device.featured && (
            <Badge variant="secondary" className="gap-1 text-[10px] px-1.5 py-0.5 text-amber-500 border-amber-500/30 bg-amber-500/10">
              <Star className="h-2.5 w-2.5" /> Destaque
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {device.condition && (
            <span className="text-xs text-muted-foreground">{device.condition}</span>
          )}
          <span className="flex items-center gap-1 text-xs">
            {hasPromo ? (
              <>
                <span className="text-muted-foreground line-through">{fmt(device.price)}</span>
                <span className="font-semibold text-primary">PIX {fmt(pixPrice)}</span>
              </>
            ) : (
              <span className="font-semibold font-mono">{fmt(device.price)}</span>
            )}
          </span>
        </div>
      </div>

      {/* Disponível toggle */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Switch
          checked={device.available}
          onCheckedChange={(v) => onToggleAvailable(device.id, v)}
          className="scale-90"
        />
        <span className={cn("text-xs hidden sm:inline", device.available ? "text-muted-foreground" : "text-muted-foreground/50")}>
          {device.available ? "Disponível" : "Oculto"}
        </span>
      </div>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Acoes do aparelho">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={() => onEdit(device)}>
            <Pencil className="mr-2 h-3.5 w-3.5" /> Editar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDuplicate(device.id)}>
            <Copy className="mr-2 h-3.5 w-3.5" /> Duplicar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => onDelete(device)}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function DeviceCatalogAdmin() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Data
  const categoriesQuery = useQuery(trpc.catalog.listCatalogCategories.queryOptions());
  const categories = (categoriesQuery.data ?? []) as CatalogCategory[];

  const devicesQuery = useQuery(
    trpc.catalog.listCatalogDevices.queryOptions({ categoryId: selectedCategoryId ?? undefined, pageSize: 200 } as never),
  );
  const devices = ((devicesQuery.data as { data?: CatalogDevice[] } | undefined)?.data ?? []) as CatalogDevice[];

  const filtered = useMemo(() => {
    if (!search.trim()) return devices;
    const q = search.toLowerCase();
    return devices.filter((d) => d.name.toLowerCase().includes(q) || d.condition?.toLowerCase().includes(q));
  }, [devices, search]);

  // Dialogs
  const [categoryDialog, setCategoryDialog] = useState<{ id?: string; name: string } | null>(null);
  const [deviceDialog, setDeviceDialog] = useState<Partial<CatalogDevice> | null>(null);
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<CatalogCategory | null>(null);
  const [confirmDeleteDevice, setConfirmDeleteDevice] = useState<CatalogDevice | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: trpc.catalog.listCatalogCategories.queryKey() });
    queryClient.invalidateQueries({ queryKey: trpc.catalog.listCatalogDevices.queryKey() });
  };

  // Mutations — categorias
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

  // Mutations — aparelhos
  const createDeviceMut = useMutation(trpc.catalog.createCatalogDevice.mutationOptions({
    onSuccess: () => { invalidate(); toast.success("Aparelho criado"); setDeviceDialog(null); },
    onError: (e) => toast.error(e.message),
  }));
  const updateDeviceMut = useMutation(trpc.catalog.updateCatalogDevice.mutationOptions({
    onSuccess: () => { invalidate(); toast.success("Aparelho atualizado"); setDeviceDialog(null); },
    onError: (e) => toast.error(e.message),
  }));
  const deleteDeviceMut = useMutation(trpc.catalog.deleteCatalogDevice.mutationOptions({
    onSuccess: () => { invalidate(); toast.success("Aparelho removido"); setConfirmDeleteDevice(null); },
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

  const handleToggleAvailable = (id: string, available: boolean) => {
    const device = devices.find((d) => d.id === id);
    if (!device) return;
    updateDeviceMut.mutate({
      id,
      name: device.name,
      categoryId: device.categoryId,
      condition: device.condition,
      description: device.description,
      price: device.price != null ? Number(device.price) : null,
      promotionalPrice: device.promotionalPrice != null ? Number(device.promotionalPrice) : null,
      imageUrl: device.imageUrl,
      available,
      featured: device.featured,
    } as never);
  };

  const activeCategoryName = categories.find((c) => c.id === selectedCategoryId)?.name;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
      {/* Sidebar */}
      <Card>
        <CardContent className="p-3">
          <CategorySidebar
            categories={categories}
            selected={selectedCategoryId}
            onSelect={setSelectedCategoryId}
            onNew={() => setCategoryDialog({ name: "" })}
            onEdit={(cat) => setCategoryDialog({ id: cat.id, name: cat.name })}
            onDuplicate={(id) => duplicateCategoryMut.mutate({ id })}
            onDelete={setConfirmDeleteCategory}
            isLoading={categoriesQuery.isLoading}
          />
        </CardContent>
      </Card>

      {/* Device list */}
      <div className="flex flex-col gap-3">
        {/* Toolbar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar aparelho..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {activeCategoryName && (
            <Badge variant="outline" className="gap-1 whitespace-nowrap">
              <Tag className="h-3 w-3" /> {activeCategoryName}
            </Badge>
          )}
          <Button
            onClick={() => setDeviceDialog({ categoryId: selectedCategoryId, name: "", available: true })}
          >
            <Plus className="mr-2 h-4 w-4" /> Novo aparelho
          </Button>
        </div>

        {/* List */}
        {devicesQuery.isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Smartphone}
            title={search ? "Nenhum aparelho encontrado" : "Nenhum aparelho nesta categoria"}
            description={search ? `Nada corresponde a "${search}"` : "Adicione o primeiro aparelho clicando em \"Novo aparelho\""}
          />
        ) : (
          <div className="space-y-1.5">
            {filtered.map((d) => (
              <DeviceRow
                key={d.id}
                device={d}
                onEdit={setDeviceDialog}
                onDuplicate={(id) => duplicateDeviceMut.mutate({ id })}
                onDelete={setConfirmDeleteDevice}
                onToggleAvailable={handleToggleAvailable}
              />
            ))}
            <p className="text-right text-xs text-muted-foreground pt-1">
              {filtered.length} {filtered.length === 1 ? "aparelho" : "aparelhos"}
              {search && ` de ${devices.length}`}
            </p>
          </div>
        )}
      </div>

      {/* ── Dialog: Categoria ── */}
      <Dialog open={!!categoryDialog} onOpenChange={(o) => !o && setCategoryDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{categoryDialog?.id ? "Renomear categoria" : "Nova categoria"}</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Nome</Label>
            <Input
              autoFocus
              value={categoryDialog?.name ?? ""}
              onChange={(e) => setCategoryDialog((d) => d ? { ...d, name: e.target.value } : d)}
              placeholder="Ex: iPhones"
              onKeyDown={(e) => e.key === "Enter" && handleSaveCategory()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialog(null)}>Cancelar</Button>
            <Button onClick={handleSaveCategory} disabled={createCategoryMut.isPending || updateCategoryMut.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Aparelho ── */}
      <Dialog open={!!deviceDialog} onOpenChange={(o) => !o && setDeviceDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{deviceDialog?.id ? "Editar aparelho" : "Novo aparelho"}</DialogTitle>
            <DialogDescription className="text-xs">
              O preço PIX é o valor que o bot exibe ao cliente. Deixe em branco se não houver desconto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
            <div>
              <Label>Nome do aparelho <span className="text-destructive">*</span></Label>
              <Input
                autoFocus
                value={deviceDialog?.name ?? ""}
                onChange={(e) => setDeviceDialog((d) => d ? { ...d, name: e.target.value } : d)}
                placeholder="Ex: iPhone 15 Pro 256GB"
              />
            </div>

            <div>
              <Label>Categoria</Label>
              <Select
                value={deviceDialog?.categoryId ?? "__none__"}
                onValueChange={(v) => setDeviceDialog((d) => d ? { ...d, categoryId: v === "__none__" ? null : v } : d)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="— sem categoria —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— sem categoria —</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Preço cartão (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={deviceDialog?.price != null ? String(deviceDialog.price) : ""}
                  onChange={(e) => setDeviceDialog((d) => d ? { ...d, price: e.target.value === "" ? null : Number(e.target.value) } : d)}
                  placeholder="0,00"
                  className="font-mono"
                />
              </div>
              <div>
                <Label>Preço PIX <span className="text-xs text-primary">(bot usa este)</span></Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={deviceDialog?.promotionalPrice != null ? String(deviceDialog.promotionalPrice) : ""}
                  onChange={(e) => setDeviceDialog((d) => d ? { ...d, promotionalPrice: e.target.value === "" ? null : Number(e.target.value) } : d)}
                  placeholder="opcional"
                  className="font-mono"
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
              <Textarea
                value={deviceDialog?.description ?? ""}
                onChange={(e) => setDeviceDialog((d) => d ? { ...d, description: e.target.value } : d)}
                placeholder="Detalhes que o bot pode usar ao responder"
                rows={3}
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

            <div className="flex gap-6 pt-1">
              <div className="flex items-center gap-2">
                <Switch
                  checked={deviceDialog?.available ?? true}
                  onCheckedChange={(v) => setDeviceDialog((d) => d ? { ...d, available: v } : d)}
                />
                <Label className="cursor-pointer">Disponível para venda</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={deviceDialog?.featured ?? false}
                  onCheckedChange={(v) => setDeviceDialog((d) => d ? { ...d, featured: v } : d)}
                />
                <Label className="cursor-pointer">Destaque</Label>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-row items-center">
            {deviceDialog?.id && (
              <Button
                variant="destructive"
                size="sm"
                className="mr-auto"
                onClick={() => {
                  if (deviceDialog.id && deviceDialog.name) {
                    setConfirmDeleteDevice({ id: deviceDialog.id, name: deviceDialog.name } as CatalogDevice);
                    setDeviceDialog(null);
                  }
                }}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Excluir
              </Button>
            )}
            <Button variant="outline" onClick={() => setDeviceDialog(null)}>Cancelar</Button>
            <Button onClick={handleSaveDevice} disabled={createDeviceMut.isPending || updateDeviceMut.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirms ── */}
      <ConfirmDialog
        open={confirmDeleteCategory !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteCategory(null); }}
        title={confirmDeleteCategory ? `Remover categoria "${confirmDeleteCategory.name}"?` : ""}
        description="Os aparelhos vinculados ficarão sem categoria."
        confirmLabel="Remover"
        variant="destructive"
        onConfirm={() => {
          if (confirmDeleteCategory) {
            deleteCategoryMut.mutate({ id: confirmDeleteCategory.id });
            setConfirmDeleteCategory(null);
          }
        }}
        isLoading={deleteCategoryMut.isPending}
      />

      <ConfirmDialog
        open={confirmDeleteDevice !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteDevice(null); }}
        title={confirmDeleteDevice ? `Remover "${confirmDeleteDevice.name}"?` : ""}
        description="O aparelho será removido do catálogo e o bot não poderá mais encontrá-lo."
        confirmLabel="Remover"
        variant="destructive"
        onConfirm={() => {
          if (confirmDeleteDevice) deleteDeviceMut.mutate({ id: confirmDeleteDevice.id });
        }}
        isLoading={deleteDeviceMut.isPending}
      />
    </div>
  );
}
