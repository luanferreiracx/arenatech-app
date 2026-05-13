"use client";

import { useState, useRef } from "react";
import { Calculator, Printer } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/inputs/money-input";
import { Card } from "@/components/ui/card";
import { toast } from "@/lib/toast";
import type { SimulationResult } from "@/lib/validators/simulator";

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function SimulatorForm() {
  const trpc = useTRPC();
  const [valorProduto, setValorProduto] = useState(0); // centavos
  const [valorEntrada, setValorEntrada] = useState(0); // centavos
  const [result, setResult] = useState<SimulationResult | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const simulateMutation = useMutation(
    trpc.simulator.simulate.mutationOptions({
      onSuccess: (data) => {
        setResult(data);
      },
      onError: (err) => {
        toast.error(err.message);
      },
    }),
  );

  const handleSimulate = () => {
    if (valorProduto <= 0) {
      toast.error("Informe o valor do produto");
      return;
    }
    simulateMutation.mutate({
      valorProduto: valorProduto / 100,
      valorEntrada: valorEntrada / 100,
    });
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
        h1 { color: #c9a55c; font-size: 18pt; margin-bottom: 5px; }
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

  return (
    <div className="space-y-6">
      {/* Input Form */}
      <Card className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <Label>Valor do Produto</Label>
            <MoneyInput
              value={valorProduto}
              onChange={setValorProduto}
              placeholder="R$ 0,00"
            />
          </div>
          <div>
            <Label>Valor da Entrada (opcional)</Label>
            <MoneyInput
              value={valorEntrada}
              onChange={setValorEntrada}
              placeholder="R$ 0,00"
            />
          </div>
          <Button
            onClick={handleSimulate}
            disabled={simulateMutation.isPending}
            className="h-10"
          >
            <Calculator className="mr-2 h-4 w-4" />
            {simulateMutation.isPending ? "Calculando..." : "Simular"}
          </Button>
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
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              Imprimir
            </Button>
          </div>

          <div ref={tableRef}>
            <table className="w-full border-collapse">
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
                {/* PIX / Dinheiro */}
                <tr className="border-b">
                  <td className="p-3 text-sm font-medium">PIX / Dinheiro</td>
                  <td className="p-3 text-sm text-center">0,00%</td>
                  <td className="p-3 text-sm text-right">{formatCurrency(result.valorFinanciar)}</td>
                  <td className="p-3 text-sm text-right font-medium">{formatCurrency(result.valorFinanciar)}</td>
                  <td className="p-3 text-sm text-right">{formatCurrency(0)}</td>
                </tr>
                {/* Debito */}
                <tr className="border-b">
                  <td className="p-3 text-sm font-medium">Debito</td>
                  <td className="p-3 text-sm text-center">{result.debito.taxa.toFixed(2)}%</td>
                  <td className="p-3 text-sm text-right">{formatCurrency(result.debito.total)}</td>
                  <td className="p-3 text-sm text-right font-medium">{formatCurrency(result.debito.total)}</td>
                  <td className="p-3 text-sm text-right">{formatCurrency(result.debito.total - result.valorFinanciar)}</td>
                </tr>
                {/* Credito a vista */}
                <tr className="border-b">
                  <td className="p-3 text-sm font-medium">Credito 1x</td>
                  <td className="p-3 text-sm text-center">{result.avista.taxa.toFixed(2)}%</td>
                  <td className="p-3 text-sm text-right">{formatCurrency(result.avista.total)}</td>
                  <td className="p-3 text-sm text-right font-medium">{formatCurrency(result.avista.total)}</td>
                  <td className="p-3 text-sm text-right">{formatCurrency(result.avista.total - result.valorFinanciar)}</td>
                </tr>
                {/* Parcelas */}
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
    </div>
  );
}
