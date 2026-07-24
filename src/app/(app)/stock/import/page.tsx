"use client";
import { formatCentsBRL as formatCurrency } from "@/lib/format";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/domain/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/domain/status-badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Upload, CheckCircle, AlertTriangle, Download, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { parseCsvContent, type ParsedLine } from "./csv-parser";

export default function StockImportPage() {
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [parsedLines, setParsedLines] = useState<ParsedLine[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [result, setResult] = useState<{
    productsCreated: number;
    stockEntries: number;
    categoriesCreated: number;
    errors: string[];
    success: boolean;
  } | null>(null);

  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // Erros/avisos da validacao SERVER-SIDE (previewCsvImport): pega regras que o
  // parse no navegador nao ve — SKU/barcode ja existentes no banco, etc.
  const [serverIssues, setServerIssues] = useState<{
    errors: Array<{ line: number; field?: string; message: string }>;
    warnings: Array<{ line: number; field?: string; message: string }>;
  } | null>(null);
  const [checkingServer, setCheckingServer] = useState(false);
  const importMutation = useMutation(
    trpc.stock.importCsv.mutationOptions({
      onSuccess: (data) => {
        setResult(data);
        setStep("done");
        if (data.success) {
          toast.success(
            `Importacao concluida! ${data.productsCreated} produtos criados, ${data.stockEntries} itens em estoque.`,
          );
        } else {
          toast.error(`Importacao com erros: ${data.errors.length} erro(s).`);
        }
      },
      onError: (err) => {
        toast.error(`Erro na importacao: ${err.message}`);
      },
    }),
  );

  const processFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const sep = file.name.endsWith(".csv") || file.name.endsWith(".txt") ? ";" : ",";
      const { lines, errors } = parseCsvContent(text, sep);
      setParsedLines(lines);
      setParseErrors(errors);
      setStep("preview");
    };
    reader.readAsText(file, "UTF-8");
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      if (!/\.(csv|txt|tsv)$/i.test(file.name)) {
        toast.error("Apenas arquivos .csv, .txt ou .tsv");
        return;
      }
      processFile(file);
    },
    [processFile],
  );

  const handleImport = useCallback(async () => {
    const validLines = parsedLines.filter((l) => !l._error);
    if (validLines.length === 0) {
      toast.error("Nenhuma linha valida para importar.");
      return;
    }
    const payloadLines = validLines.map(({ _lineNum, _error, ...rest }) => rest);

    // Validacao server-side antes de importar: confere regras que o navegador
    // nao ve (duplicidade no banco etc). Se houver erro, nao importa.
    setCheckingServer(true);
    try {
      const preview = await queryClient.fetchQuery(
        trpc.stock.previewCsvImport.queryOptions({ lines: payloadLines }),
      );
      setServerIssues({ errors: preview.errors, warnings: preview.warnings });
      if (!preview.canProceed) {
        toast.error(`Validacao do servidor encontrou ${preview.errors.length} erro(s). Corrija e tente novamente.`);
        return;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao validar no servidor.");
      return;
    } finally {
      setCheckingServer(false);
    }

    importMutation.mutate({ lines: payloadLines });
  }, [parsedLines, importMutation, queryClient, trpc]);


  return (
    <div>
      <PageHeader
        title="Importar Produtos (CSV)"
        subtitle="Upload de planilha para cadastro em lote"
      />

      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload do Arquivo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-border"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <Upload className={`h-12 w-12 mx-auto mb-4 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
              <p className="text-sm text-muted-foreground mb-4">
                {isDragging
                  ? "Solte o arquivo aqui"
                  : "Arraste um arquivo CSV/TXT/TSV ou clique para selecionar"}
              </p>
              <input
                type="file"
                accept=".csv,.txt,.tsv"
                onChange={handleFileChange}
                className="mx-auto"
              />
            </div>

            <div className="bg-muted p-4 rounded-lg">
              <h4 className="font-medium mb-2">Formato do arquivo</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>Separador: ponto-e-virgula (;)</li>
                <li>Colunas obrigatorias: <code>nome</code>, <code>preco_venda</code></li>
                <li>Colunas opcionais: categoria, marca, sku, codigo_barras, preco_custo, preco_promocional, estoque_minimo, quantidade, eh_aparelho, descricao</li>
                <li>Precos: formato BR (25,00) ou internacional (25.00)</li>
                <li>Linhas com # sao ignoradas</li>
              </ul>
            </div>

            <Button variant="outline" asChild>
              <a
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(
                  "\xEF\xBB\xBFnome;categoria;marca;sku;preco_custo;preco_venda;quantidade;estoque_minimo;eh_aparelho;descricao\nPelicula iPhone 15;Peliculas;Generica;PEL-IP15;5,00;25,00;50;10;nao;Pelicula de vidro\nCapinha iPhone 15;Capinhas;Generica;CAP-IP15;8,00;35,00;30;5;nao;Capinha silicone\n"
                )}`}
                download="modelo_importacao.csv"
              >
                <Download className="mr-2 h-4 w-4" />
                Baixar Modelo CSV
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "preview" && (
        <div className="space-y-4">
          {parseErrors.length > 0 && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span className="font-medium text-destructive">
                    {parseErrors.length} erro(s) no arquivo
                  </span>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {parseErrors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {serverIssues && serverIssues.errors.length > 0 && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span className="font-medium text-destructive">
                    Validacao do servidor: {serverIssues.errors.length} erro(s)
                  </span>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {serverIssues.errors.map((e, i) => (
                    <li key={i}>
                      Linha {e.line}{e.field ? ` (${e.field})` : ""}: {e.message}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {serverIssues && serverIssues.warnings.length > 0 && (
            <Card className="border-yellow-500/50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <span className="font-medium text-yellow-600">
                    {serverIssues.warnings.length} aviso(s)
                  </span>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {serverIssues.warnings.map((w, i) => (
                    <li key={i}>
                      Linha {w.line}{w.field ? ` (${w.field})` : ""}: {w.message}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">
                Preview ({parsedLines.length} produtos)
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("upload")}>
                  Voltar
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={importMutation.isPending || checkingServer || parsedLines.filter((l) => !l._error).length === 0}
                >
                  {importMutation.isPending || checkingServer ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="mr-2 h-4 w-4" />
                  )}
                  {checkingServer
                    ? "Validando..."
                    : `Importar ${parsedLines.filter((l) => !l._error).length} produtos`}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Linha</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Marca</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead className="text-right">Venda</TableHead>
                    <TableHead className="text-center">Qtd</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedLines.map((l) => (
                    <TableRow key={l._lineNum} className={l._error ? "bg-destructive/5" : ""}>
                      <TableCell>{l._lineNum}</TableCell>
                      <TableCell className="font-medium">{l.name}</TableCell>
                      <TableCell>{l.category || "-"}</TableCell>
                      <TableCell>{l.brand || "-"}</TableCell>
                      <TableCell className="text-muted-foreground">{l.sku || "-"}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {l.costPrice ? formatCurrency(l.costPrice) : "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(l.salePrice)}
                      </TableCell>
                      <TableCell className="text-center">{l.quantity ?? 0}</TableCell>
                      <TableCell>
                        {l._error ? (
                          <StatusBadge variant="destructive">{l._error}</StatusBadge>
                        ) : (
                          <StatusBadge variant="success">OK</StatusBadge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {step === "done" && result && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              {result.success ? (
                <CheckCircle className="h-6 w-6 text-emerald-500" />
              ) : (
                <AlertTriangle className="h-6 w-6 text-amber-500" />
              )}
              <h3 className="text-lg font-semibold">
                {result.success ? "Importacao concluida!" : "Importacao com erros"}
              </h3>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardContent className="text-center py-4">
                  <div className="text-2xl font-bold text-emerald-500">{result.productsCreated}</div>
                  <p className="text-sm text-muted-foreground">Produtos Criados</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="text-center py-4">
                  <div className="text-2xl font-bold text-blue-500">{result.stockEntries}</div>
                  <p className="text-sm text-muted-foreground">Itens em Estoque</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="text-center py-4">
                  <div className="text-2xl font-bold text-amber-500">{result.categoriesCreated}</div>
                  <p className="text-sm text-muted-foreground">Categorias Criadas</p>
                </CardContent>
              </Card>
            </div>

            {result.errors.length > 0 && (
              <div className="bg-destructive/5 p-4 rounded-lg">
                <h4 className="font-medium text-destructive mb-2">Erros:</h4>
                <ul className="text-sm space-y-1">
                  {result.errors.map((e, i) => (
                    <li key={i} className="text-muted-foreground">{e}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={() => { setStep("upload"); setResult(null); setParsedLines([]); }}>
                Nova Importacao
              </Button>
              <Button variant="outline" asChild>
                <Link href="/stock">Ver Produtos</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
