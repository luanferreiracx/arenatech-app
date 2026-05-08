"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/domain/page-header";
import { StatusBadge } from "@/components/domain/status-badge";
import { EmptyState } from "@/components/domain/empty-state";
import { LoadingState } from "@/components/domain/loading-state";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { DataTable } from "@/components/domain/data-table";
import { DataTableToolbar } from "@/components/domain/data-table/data-table-toolbar";
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";
import { MoneyInput } from "@/components/inputs/money-input";
import { CpfInput } from "@/components/inputs/cpf-input";
import { CnpjInput } from "@/components/inputs/cnpj-input";
import { PhoneInput } from "@/components/inputs/phone-input";
import { CepInput } from "@/components/inputs/cep-input";
import { DatePicker } from "@/components/inputs/date-picker";
import { DateRangePicker } from "@/components/inputs/date-range-picker";
import { Package } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { DateRange } from "react-day-picker";

interface SectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

function Section({ title, description, children }: SectionProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <Separator />
      <div>{children}</div>
    </div>
  );
}

// Mock data for DataTable
interface MockRow {
  id: string;
  name: string;
  status: string;
  value: number;
}

const mockData: MockRow[] = [
  { id: "1", name: "João Silva", status: "active", value: 15000 },
  { id: "2", name: "Maria Santos", status: "pending", value: 8500 },
  { id: "3", name: "Carlos Oliveira", status: "inactive", value: 32000 },
  { id: "4", name: "Ana Costa", status: "active", value: 5000 },
  { id: "5", name: "Pedro Alves", status: "warning", value: 12000 },
];

const mockColumns: ColumnDef<MockRow>[] = [
  {
    accessorKey: "name",
    header: "Nome",
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const s = row.original.status;
      const map: Record<string, "success" | "warning" | "destructive" | "default"> = {
        active: "success",
        pending: "warning",
        inactive: "destructive",
        warning: "warning",
      };
      return (
        <StatusBadge variant={map[s] ?? "default"}>
          {s === "active" ? "Ativo" : s === "pending" ? "Pendente" : s === "inactive" ? "Inativo" : s}
        </StatusBadge>
      );
    },
  },
  {
    accessorKey: "value",
    header: "Valor",
    cell: ({ row }) =>
      (row.original.value / 100).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      }),
  },
];

export function ComponentsCatalog() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [moneyValue, setMoneyValue] = useState(0);
  const [cpfValue, setCpfValue] = useState("");
  const [cnpjValue, setCnpjValue] = useState("");
  const [phoneValue, setPhoneValue] = useState("");
  const [cepValue, setCepValue] = useState("");
  const [date, setDate] = useState<Date | undefined>();
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  return (
    <div className="space-y-12 max-w-4xl">
      <PageHeader
        title="Catálogo de Componentes"
        subtitle="Dev only — referência visual do design system Arena Tech"
      />

      {/* 1. Typography */}
      <Section title="1. Tipografia" description="Escalas de texto disponíveis">
        <div className="space-y-2">
          <p className="text-4xl font-bold">Heading 4xl — ARENA TECH</p>
          <p className="text-2xl font-semibold">Heading 2xl — Painel de Gestão</p>
          <p className="text-xl font-semibold">Heading xl — Ordens de Serviço</p>
          <p className="text-lg font-medium">Heading lg — Clientes e Produtos</p>
          <p className="text-base">Body — Texto padrão de conteúdo</p>
          <p className="text-sm text-muted-foreground">Small muted — Descrições secundárias</p>
          <p className="text-xs text-muted-foreground">XS — Labels, badges, metadados</p>
          <p className="font-mono text-sm">Mono — 00.000.000/0001-99</p>
        </div>
      </Section>

      {/* 2. Colors */}
      <Section title="2. Cores" description="Paleta Arena Tech">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Primary (dourado)", bg: "bg-primary", text: "text-primary-foreground" },
            { label: "Secondary (prata)", bg: "bg-secondary", text: "text-secondary-foreground" },
            { label: "Success", bg: "bg-success", text: "text-success-foreground" },
            { label: "Warning", bg: "bg-warning", text: "text-warning-foreground" },
            { label: "Destructive", bg: "bg-destructive", text: "text-destructive-foreground" },
            { label: "Muted", bg: "bg-muted", text: "text-muted-foreground" },
            { label: "Accent", bg: "bg-accent", text: "text-accent-foreground" },
            { label: "Card", bg: "bg-card border border-border", text: "text-card-foreground" },
          ].map((color) => (
            <div
              key={color.label}
              className={`${color.bg} ${color.text} rounded-lg p-3 text-xs font-medium`}
            >
              {color.label}
            </div>
          ))}
        </div>
      </Section>

      {/* 3. Buttons */}
      <Section title="3. Botões" description="Todas as variantes shadcn">
        <div className="flex flex-wrap gap-3">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
        </div>
      </Section>

      {/* 4. Inputs */}
      <Section title="4. Inputs" description="Inputs especializados do Arena Tech">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Valor (R$)</Label>
            <MoneyInput value={moneyValue} onChange={setMoneyValue} />
            <p className="text-xs text-muted-foreground">{moneyValue} centavos</p>
          </div>

          <div className="space-y-1.5">
            <Label>CPF</Label>
            <CpfInput value={cpfValue} onValueChange={setCpfValue} />
          </div>

          <div className="space-y-1.5">
            <Label>CNPJ</Label>
            <CnpjInput value={cnpjValue} onValueChange={setCnpjValue} />
          </div>

          <div className="space-y-1.5">
            <Label>Telefone</Label>
            <PhoneInput value={phoneValue} onValueChange={setPhoneValue} />
          </div>

          <div className="space-y-1.5">
            <Label>CEP</Label>
            <CepInput value={cepValue} onValueChange={setCepValue} />
          </div>

          <div className="space-y-1.5">
            <Label>Texto padrão</Label>
            <Input placeholder="Input padrão shadcn" />
          </div>

          <div className="space-y-1.5">
            <Label>Data</Label>
            <DatePicker value={date} onChange={setDate} />
          </div>

          <div className="space-y-1.5">
            <Label>Período</Label>
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>
        </div>
      </Section>

      {/* 5. Status Badges */}
      <Section title="5. Status Badges" description="Badges semânticos para estados">
        <div className="flex flex-wrap gap-2">
          <StatusBadge variant="default">Padrão</StatusBadge>
          <StatusBadge variant="success">Concluído</StatusBadge>
          <StatusBadge variant="warning">Pendente</StatusBadge>
          <StatusBadge variant="destructive">Cancelado</StatusBadge>
          <StatusBadge variant="info">Em Análise</StatusBadge>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge>Badge padrão</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </div>
      </Section>

      {/* 6. Cards */}
      <Section title="6. Cards" description="Cards com variações">
        <div className="grid md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Ordens Abertas</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-primary">42</p>
              <p className="text-xs text-muted-foreground mt-1">+5 hoje</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Faturamento</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">R$ 24.580</p>
              <p className="text-xs text-muted-foreground mt-1">Este mês</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Clientes Ativos</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">1.203</p>
              <p className="text-xs text-muted-foreground mt-1">Total cadastrado</p>
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* 7. DataTable */}
      <Section title="7. Tabela" description="DataTable com TanStack Table v8">
        <DataTable
          columns={mockColumns}
          data={mockData}
          toolbar={
            <DataTableToolbar
              searchPlaceholder="Buscar por nome..."
              actions={<Button size="sm">Novo</Button>}
            />
          }
          emptyMessage="Nenhum dado encontrado."
        />
      </Section>

      {/* 8. Toast */}
      <Section title="8. Toasts" description="Disparar notificações via sonner">
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => toast.success("Operação realizada com sucesso!")}
          >
            Toast Success
          </Button>
          <Button
            variant="outline"
            onClick={() => toast.error("Erro ao processar solicitação.")}
          >
            Toast Error
          </Button>
          <Button
            variant="outline"
            onClick={() => toast.warning("Atenção: verifique os dados.")}
          >
            Toast Warning
          </Button>
          <Button
            variant="outline"
            onClick={() => toast.info("Nova atualização disponível.")}
          >
            Toast Info
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              toast.promise(new Promise((res) => setTimeout(res, 2000)), {
                loading: "Salvando...",
                success: "Salvo com sucesso!",
                error: "Erro ao salvar.",
              })
            }
          >
            Toast Promise
          </Button>
        </div>
      </Section>

      {/* 9. Empty State */}
      <Section title="9. Empty State" description="Estado vazio padronizado">
        <Card>
          <EmptyState
            icon={Package}
            title="Nenhum produto encontrado"
            description="Não há produtos cadastrados ainda. Comece adicionando um novo produto ao estoque."
            action={<Button size="sm">Adicionar Produto</Button>}
          />
        </Card>
      </Section>

      {/* 10. Loading State */}
      <Section title="10. Loading State" description="Skeletons por variante">
        <div className="space-y-6">
          <div>
            <p className="text-sm font-medium mb-2">List</p>
            <LoadingState variant="list" rows={3} />
          </div>
          <div>
            <p className="text-sm font-medium mb-2">Table</p>
            <LoadingState variant="table" rows={3} />
          </div>
          <div>
            <p className="text-sm font-medium mb-2">Card</p>
            <LoadingState variant="card" rows={3} />
          </div>
        </div>
      </Section>

      {/* 11. Confirm Dialog */}
      <Section title="11. Confirm Dialog" description="Dialog de confirmação com foco no cancelar">
        <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
          Abrir Confirm Dialog
        </Button>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Excluir registro"
          description="Esta ação não pode ser desfeita. O registro será permanentemente removido do sistema."
          confirmLabel="Excluir"
          onConfirm={() =>
            new Promise((res) => {
              setTimeout(() => {
                toast.success("Registro excluído.");
                res(undefined);
                setConfirmOpen(false);
              }, 1500);
            })
          }
        />
      </Section>

      {/* 12. Form Section */}
      <Section title="12. Form Components" description="FormSection e FormActions">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            toast.success("Formulário enviado!");
          }}
        >
          <FormSection
            title="Dados do cliente"
            description="Informações básicas para cadastro"
          >
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input placeholder="Nome completo" />
              </div>
              <div className="space-y-1.5">
                <Label>CPF</Label>
                <Input placeholder="000.000.000-00" />
              </div>
            </div>
          </FormSection>

          <div className="mt-6">
            <FormActions submitLabel="Salvar Cliente" />
          </div>
        </form>
      </Section>

      {/* 13. Command Palette */}
      <Section title="13. Command Palette ⌘K" description="Pressione ⌘K ou Ctrl+K para abrir">
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">
              A command palette está disponível em todo o app. Use{" "}
              <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted text-xs font-mono">
                ⌘K
              </kbd>{" "}
              ou{" "}
              <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted text-xs font-mono">
                Ctrl+K
              </kbd>{" "}
              para abrí-la. Também está acessível pelo botão no header.
            </p>
          </CardContent>
        </Card>
      </Section>
    </div>
  );
}
