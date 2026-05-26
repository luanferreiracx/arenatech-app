"use client";

import { useRef, useState } from "react";
import { Upload, Loader2, Trash2 } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { toast } from "@/lib/toast";

interface LogoUploadProps {
  currentUrl: string | null;
  onChange?: (newUrl: string | null) => void;
}

const ACCEPTED = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Upload de logo do tenant com drag-drop, preview e botao remover.
 * Persiste via `settings.uploadLogo` (MinIO + atualiza tenant_settings.logoUrl).
 */
export function LogoUpload({ currentUrl, onChange }: LogoUploadProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const uploadMutation = useMutation(
    trpc.settings.uploadLogo.mutationOptions({
      onSuccess: (res) => {
        toast.success("Logo atualizada");
        queryClient.invalidateQueries({ queryKey: trpc.settings.getGeneral.queryKey() });
        onChange?.(res.logoUrl);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const deleteMutation = useMutation(
    trpc.settings.deleteLogo.mutationOptions({
      onSuccess: () => {
        toast.success("Logo removida");
        queryClient.invalidateQueries({ queryKey: trpc.settings.getGeneral.queryKey() });
        onChange?.(null);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const handleFile = async (file: File) => {
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Formato nao suportado. Use PNG, JPG, WebP ou SVG.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Logo excede 2MB. Reduza o arquivo antes de enviar.");
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    uploadMutation.mutate({ dataUrl });
  };

  const onSelectClick = () => fileRef.current?.click();
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const isLoading = uploadMutation.isPending || deleteMutation.isPending;

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={onSelectClick}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/60"
        } ${isLoading ? "opacity-50 pointer-events-none" : ""}`}
      >
        {currentUrl ? (
          <div className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentUrl}
              alt="Logo da loja"
              style={{ maxHeight: 96, maxWidth: 240 }}
              className="object-contain"
            />
            <p className="text-xs text-muted-foreground">
              Clique ou arraste para substituir
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            {isLoading ? (
              <Loader2 className="h-10 w-10 text-muted-foreground animate-spin" />
            ) : (
              <Upload
                className={`h-10 w-10 ${isDragging ? "text-primary" : "text-muted-foreground"}`}
              />
            )}
            <p className="text-sm font-medium">
              {isDragging ? "Solte o arquivo aqui" : "Clique ou arraste a logo"}
            </p>
            <p className="text-xs text-muted-foreground">
              PNG, JPG, WebP ou SVG (max 2MB). Recomendado 400x200px com fundo transparente.
            </p>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED.join(",")}
          onChange={onFileChange}
          className="hidden"
        />
      </div>

      {currentUrl && (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSelectClick}
            disabled={isLoading}
          >
            <Upload className="mr-2 h-3 w-3" />
            Substituir
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-destructive border-destructive/30"
            onClick={() => setConfirmRemove(true)}
            disabled={isLoading}
          >
            <Trash2 className="mr-2 h-3 w-3" />
            Remover
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remover a logo da loja?"
        description="O logotipo sera removido dos documentos gerados (recibos, termos, etc.)."
        confirmLabel="Remover"
        variant="destructive"
        onConfirm={() => {
          deleteMutation.mutate();
          setConfirmRemove(false);
        }}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
