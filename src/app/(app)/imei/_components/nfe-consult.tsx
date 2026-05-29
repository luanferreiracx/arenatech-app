"use client";

import { useState } from "react";
import { Search, FileText, Download, CheckCircle } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/lib/toast";

function base64ToBlob(base64: string, type = "application/pdf"): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

export function NfeConsult() {
  const trpc = useTRPC();
  const [chave, setChave] = useState("");
  const [resultFile, setResultFile] = useState<{ pdfBase64: string; fileName: string } | null>(null);

  const validateMutation = useMutation(trpc.imei.validateNfe.mutationOptions());

  const handleValidate = () => {
    const cleaned = chave.replace(/\D/g, "");
    if (cleaned.length !== 44) {
      toast.error("Chave de acesso deve ter 44 digitos");
      return;
    }
    setResultFile(null);
    validateMutation.mutate(
      { chave: cleaned },
      {
        onSuccess: (data) => {
          if (data.success && data.pdfBase64) {
            setResultFile({ pdfBase64: data.pdfBase64, fileName: data.fileName ?? `nfe-${cleaned}.pdf` });
            toast.success("NF-e encontrada! DANFE pronto para download.");
          } else {
            toast.error(data.error ?? data.message ?? "Nao foi possivel obter a NF-e");
          }
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handleOpen = () => {
    if (!resultFile) return;
    const blob = base64ToBlob(resultFile.pdfBase64);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const handleDownload = () => {
    if (!resultFile) return;
    const blob = base64ToBlob(resultFile.pdfBase64);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = resultFile.fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Input
              value={chave}
              onChange={(e) => setChave(e.target.value.replace(/\D/g, "").slice(0, 44))}
              placeholder="Chave de acesso (44 digitos)"
              className="flex-1 text-base font-mono"
              onKeyDown={(e) => e.key === "Enter" && handleValidate()}
            />
            <Button onClick={handleValidate} disabled={validateMutation.isPending}>
              <Search className="mr-2 h-4 w-4" />
              {validateMutation.isPending ? "Consultando..." : "Consultar"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {chave.replace(/\D/g, "").length}/44 digitos. A consulta busca a nota na SEFAZ e retorna o DANFE em PDF.
          </p>
        </CardContent>
      </Card>

      {resultFile && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              DANFE disponivel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              {resultFile.fileName}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleOpen}>
                <FileText className="mr-2 h-4 w-4" /> Visualizar
              </Button>
              <Button onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" /> Baixar PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
