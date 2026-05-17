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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

export default function FinancialCategoriesPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"RECEITA" | "DESPESA">("RECEITA");

  const { data: categories } = useQuery(
    trpc.financial.listCategories.queryOptions({
      type: typeFilter === "ALL" ? undefined : typeFilter as "RECEITA" | "DESPESA",
    })
  );

  const createMut = useMutation(
    trpc.financial.createCategory.mutationOptions({
      onSuccess: () => {
        toast.success("Categoria criada");
        queryClient.invalidateQueries({ queryKey: [["financial", "listCategories"]] });
        setDialogOpen(false);
        setNewName("");
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const toggleMut = useMutation(
    trpc.financial.toggleCategory.mutationOptions({
      onSuccess: () => {
        toast.success("Status atualizado");
        queryClient.invalidateQueries({ queryKey: [["financial", "listCategories"]] });
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const deleteMut = useMutation(
    trpc.financial.deleteCategory.mutationOptions({
      onSuccess: () => {
        toast.success("Categoria excluída");
        queryClient.invalidateQueries({ queryKey: [["financial", "listCategories"]] });
      },
      onError: (e) => toast.error(e.message),
    })
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categorias Financeiras"
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-2 h-4 w-4" />Nova Categoria</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova Categoria Customizada</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <Input
                  placeholder="Nome da categoria"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <Select value={newType} onValueChange={(v) => setNewType(v as "RECEITA" | "DESPESA")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RECEITA">Receita</SelectItem>
                    <SelectItem value="DESPESA">Despesa</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Código: {newName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "..."}
                </p>
                <Button
                  className="w-full"
                  onClick={() => createMut.mutate({ name: newName, type: newType })}
                  disabled={!newName.trim() || createMut.isPending}
                >
                  Criar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="flex gap-2">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os tipos</SelectItem>
            <SelectItem value="RECEITA">Receita</SelectItem>
            <SelectItem value="DESPESA">Despesa</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead className="w-16">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories?.map((cat) => (
              <TableRow key={cat.id}>
                <TableCell className="font-medium">{cat.name}</TableCell>
                <TableCell>
                  <Badge variant={cat.type === "RECEITA" ? "default" : "secondary"}>
                    {cat.type === "RECEITA" ? "Receita" : "Despesa"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={cat.kind === "FIXED" ? "outline" : "secondary"}>
                    {cat.kind === "FIXED" ? "Sistema" : "Custom"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">{cat.code}</TableCell>
                <TableCell>
                  <Switch
                    checked={cat.active}
                    onCheckedChange={(checked) => toggleMut.mutate({ id: cat.id, active: checked })}
                  />
                </TableCell>
                <TableCell>
                  {cat.kind === "CUSTOM" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMut.mutate({ id: cat.id })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {(!categories || categories.length === 0) && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nenhuma categoria encontrada.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
