"use client";

import { useState, useRef } from "react";
import { Calculator, Printer, FileDown, Copy, Eraser, MessageCircle } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/inputs/money-input";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import type { SimulationResult } from "@/lib/validators/simulator";

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Monta a mensagem WhatsApp formatada (paridade Laravel gerarMensagemSimulacao). */
function buildWhatsAppMessage(r: SimulationResult): string {
  const fmt = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
  const lines: string[] = [];
  lines.push(
    `O parcelamento *em até ${r.maxParcelas}X no cartão de crédito* (depende do seu banco) ficaria da seguinte forma:`,
  );
  lines.push("");
  if (r.valorEntrada > 0) {
    lines.push(`*Entrada:* ${fmt(r.valorEntrada)}`);
    lines.push(`*Valor a financiar:* ${fmt(r.valorFinanciar)}`);
    lines.push("");
  } else {
    lines.push(`*À vista no PIX:* ${fmt(r.valorProduto)}`);
  }
  lines.push(`*Débito* - ${fmt(r.debito.total)}`);
  lines.push(`*Crédito à vista (1x)* - ${fmt(r.avista.total)}`);
  lines.push("");
  for (const p of r.parcelas) {
    lines.push(`${p.n}x - ${fmt(p.parcela)}`);
  }
  lines.push("");
  lines.push("*Simulação válida por 1 (um) dia!*");
  return lines.join("\n");
}

export function SimulatorForm() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [valorProduto, setValorProduto] = useState(0); // centavos
  const [valorEntrada, setValorEntrada] = useState(0); // centavos
  const [nomeCliente, setNomeCliente] = useState("");
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  // WhatsApp dialog
  const [showWaDialog, setShowWaDialog] = useState(false);
  const [waPhone, setWaPhone] = useState("");
  const [waName, setWaName] = useState("");

  const sendWaMutation = useMutation(
    trpc.simulator.sendWhatsApp.mutationOptions({
      onSuccess: () => {
        toast.success("Simulacao enviada via WhatsApp!");
        setShowWaDialog(false);
        setWaPhone("");
        setWaName("");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const handleSimulate = async () => {
    if (valorProduto <= 0) {
      toast.error("Informe o valor do produto");
      return;
    }
    if (valorEntrada >= valorProduto) {
      toast.error("A entrada nao pode ser maior ou igual ao valor do produto");
      return;
    }
    setIsCalculating(true);
    try {
      const data = await queryClient.fetchQuery(
        trpc.simulator.simulate.queryOptions({
          valorProduto: valorProduto / 100,
          valorEntrada: valorEntrada / 100,
        }),
      );
      setResult(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao calcular");
    } finally {
      setIsCalculating(false);
    }
  };

  const handleClear = () => {
    setValorProduto(0);
    setValorEntrada(0);
    setNomeCliente("");
    setResult(null);
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(buildWhatsAppMessage(result));
      toast.success("Simulacao copiada!");
    } catch {
      toast.error("Nao foi possivel copiar");
    }
  };

  const handleGeneratePdf = async () => {
    if (!result) return;
    try {
      const res = await fetch("/api/simulator/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nomeCliente || "Cliente",
          valorProduto: result.valorProduto,
          valorEntrada: result.valorEntrada,
          valorFinanciar: result.valorFinanciar,
          debito: result.debito,
          avista: result.avista,
          parcelas: result.parcelas,
        }),
      });
      const html = await res.text();
      const printWindow = window.open("", "_blank");
      if (!printWindow) return;
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.print();
    } catch {
      toast.error("Erro ao gerar PDF");
    }
  };

  const handlePrint = () => {
    if (!tableRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html><head><title>Simulacao de Parcelamento - Arena Tech</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
        h1 { color: #2ec4b6; font-size: 18pt; margin-bottom: 5px; }
        h2 { color: #666; font-size: 12pt; font-weight: normal; margin-bottom: 20px; }
        .info { margin-bottom: 15px; }
        .info span { font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { background: #f3f4f6; padding: 8px; text-align: left; border: 1px solid #ddd; font-size: 10pt; }
        td { padding: 8px; border: 1px solid #ddd; font-size: 10pt; }
        .footer { margin-top: 20px; font-size: 9pt; color: #999; text-align: center; }
        @media print { body { margin: 10mm; } }
      </style>
      </head><body>
      <h1>ARENA TECH</h1>
      <h2>Simulacao de Parcelamento</h2>
      <div class="info">
        <p>Valor do Produto: <span>${formatCurrency(result?.valorProduto ?? 0)}</span></p>
        ${result && result.valorEntrada > 0 ? `<p>Entrada: <span>${formatCurrency(result.valorEntrada)}</span></p><p>Valor a Financiar: <span>${formatCurrency(result.valorFinanciar)}</span></p>` : ""}
      </div>
      ${tableRef.current.innerHTML}
      <div class="footer">Simulacao valida por 1 (um) dia! — Arena Tech — ${new Date().toLocaleDateString("pt-BR")}</div>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handleSendWhatsApp = () => {
    if (!result) return;
    const cleaned = waPhone.replace(/\D/g, "");
    if (cleaned.length < 10) {
      toast.error("Informe um telefone valido com DDD");
      return;
    }
    sendWaMutation.mutate({
      phone: cleaned,
      customerName: waName.trim() || nomeCliente.trim() || undefined,
      valorProduto: result.valorProduto,
      valorEntrada: result.valorEntrada,
    });
  };

  return (
    <div className="space-y-6">
      {/* Input Form */}
      <Card className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <Label>Nome do Cliente (para PDF)</Label>
            <Input
              value={nomeCliente}
              onChange={(e) => setNomeCliente(e.target.value)}
              placeholder="Nome do cliente"
            />
          </div>
          <div>
            <Label>Valor do Produto</Label>
            <MoneyInput value={valorProduto} onChange={setValorProduto} placeholder="R$ 0,00" />
          </div>
          <div>
            <Label>Valor da Entrada (opcional)</Label>
            <MoneyInput value={valorEntrada} onChange={setValorEntrada} placeholder="R$ 0,00" />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSimulate} disabled={isCalculating} className="h-10 flex-1">
              <Calculator className="mr-2 h-4 w-4" />
              {isCalculating ? "Calculando..." : "Simular"}
            </Button>
            <Button variant="outline" onClick={handleClear} className="h-10" title="Limpar">
              <Eraser className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Result */}
      {result && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold">Resultado da Simulacao</h3>
              {result.valorEntrada > 0 && (
                <p className="text-sm text-muted-foreground">
                  Valor a financiar: {formatCurrency(result.valorFinanciar)}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCopy}>
                <Copy className="mr-2 h-4 w-4" />
                Copiar
              </Button>
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" />
                Imprimir
              </Button>
              <Button variant="outline" onClick={handleGeneratePdf}>
                <FileDown className="mr-2 h-4 w-4" />
                Gerar PDF
              </Button>
              <Button
                className="bg-[#25D366] text-white hover:bg-[#1ebe5b]"
                onClick={() => {
                  setWaName(nomeCliente);
                  setShowWaDialog(true);
                }}
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                Enviar WhatsApp
              </Button>
            </div>
          </div>

          <div ref={tableRef} className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 text-sm font-medium">Parcelas</th>
                  <th className="text-center p-3 text-sm font-medium">Taxa %</th>
                  <th className="text-right p-3 text-sm font-medium">Valor Parcela</th>
                  <th className="text-right p-3 text-sm font-medium">Total</th>
                  <th className="text-right p-3 text-sm font-medium">Taxa Cobrada</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="p-3 text-sm font-medium">PIX / Dinheiro</td>
                  <td className="p-3 text-sm text-center">0,00%</td>
                  <td className="p-3 text-sm text-right">{formatCurrency(result.valorFinanciar)}</td>
                  <td className="p-3 text-sm text-right font-medium">{formatCurrency(result.valorFinanciar)}</td>
                  <td className="p-3 text-sm text-right">{formatCurrency(0)}</td>
                </tr>
                <tr className="border-b">
                  <td className="p-3 text-sm font-medium">Debito</td>
                  <td className="p-3 text-sm text-center">{result.debito.taxa.toFixed(2)}%</td>
                  <td className="p-3 text-sm text-right">{formatCurrency(result.debito.total)}</td>
                  <td className="p-3 text-sm text-right font-medium">{formatCurrency(result.debito.total)}</td>
                  <td className="p-3 text-sm text-right">{formatCurrency(result.debito.total - result.valorFinanciar)}</td>
                </tr>
                <tr className="border-b">
                  <td className="p-3 text-sm font-medium">Credito 1x</td>
                  <td className="p-3 text-sm text-center">{result.avista.taxa.toFixed(2)}%</td>
                  <td className="p-3 text-sm text-right">{formatCurrency(result.avista.total)}</td>
                  <td className="p-3 text-sm text-right font-medium">{formatCurrency(result.avista.total)}</td>
                  <td className="p-3 text-sm text-right">{formatCurrency(result.avista.total - result.valorFinanciar)}</td>
                </tr>
                {result.parcelas.map((p) => (
                  <tr key={p.n} className="border-b">
                    <td className="p-3 text-sm font-medium">Credito {p.n}x</td>
                    <td className="p-3 text-sm text-center">{p.taxa.toFixed(2)}%</td>
                    <td className="p-3 text-sm text-right">{formatCurrency(p.parcela)}</td>
                    <td className="p-3 text-sm text-right font-medium">{formatCurrency(p.total)}</td>
                    <td className="p-3 text-sm text-right">{formatCurrency(p.total - result.valorFinanciar)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* WhatsApp Dialog */}
      <Dialog open={showWaDialog} onOpenChange={setShowWaDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar Simulacao via WhatsApp</DialogTitle>
            <DialogDescription>
              O PDF da simulacao sera enviado pelo numero da loja via WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Telefone do Cliente</Label>
              <Input
                value={waPhone}
                onChange={(e) => setWaPhone(e.target.value)}
                placeholder="(00) 00000-0000"
                autoFocus
              />
            </div>
            <div>
              <Label>Nome do Cliente (opcional)</Label>
              <Input
                value={waName}
                onChange={(e) => setWaName(e.target.value)}
                placeholder="Ex: Joao"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWaDialog(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-[#25D366] text-white hover:bg-[#1ebe5b]"
              onClick={handleSendWhatsApp}
              disabled={sendWaMutation.isPending}
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              {sendWaMutation.isPending ? "Enviando..." : "Enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
