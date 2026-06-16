"use client";

import { useRef, useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { ImagePlus, Trash2, Loader2 } from "lucide-react";

/**
 * Gerencia a imagem de cada VARIACAO de um produto ja salvo. Liga
 * setVariationImage/removeVariationImage (que existiam no backend sem UI).
 *
 * Por que aqui e nao no editor de variacoes do form: o update do produto recria
 * as variacoes, entao gravar a imagem no form se perderia para variacoes com
 * estoque. Este painel atua direto sobre a variacao salva (por id), via upload
 * imediato — robusto e independente do submit.
 */
export function VariationImagesPanel({ productId }: { productId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data: variations, isLoading } = useQuery(
    trpc.stock.listVariations.queryOptions({ productId }),
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trpc.stock.listVariations.queryKey({ productId }) });

  const setImage = useMutation(
    trpc.stock.setVariationImage.mutationOptions({
      onSuccess: () => {
        toast.success("Imagem da variacao atualizada");
        invalidate();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const removeImage = useMutation(
    trpc.stock.removeVariationImage.mutationOptions({
      onSuccess: () => {
        toast.success("Imagem removida");
        invalidate();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  async function handleFile(variationId: string, file: File) {
    setUploadingId(variationId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("productId", productId);
      formData.append("variationId", variationId);
      const response = await fetch("/api/products/upload", { method: "POST", body: formData });
      // uploadVariationImage retorna { imageUrl, imageProvider, imageProviderPublicId }.
      const payload = (await response.json()) as {
        imageUrl?: string;
        imageProvider?: string | null;
        imageProviderPublicId?: string | null;
        error?: string;
      };
      if (!response.ok || !payload.imageUrl) {
        throw new Error(payload.error ?? "Erro ao enviar imagem.");
      }
      setImage.mutate({
        id: variationId,
        imageUrl: payload.imageUrl,
        imageProvider: (payload.imageProvider as "cloudinary" | "minio" | "external" | null) ?? null,
        imageProviderPublicId: payload.imageProviderPublicId ?? null,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao enviar imagem.");
    } finally {
      setUploadingId(null);
      const ref = fileRefs.current[variationId];
      if (ref) ref.value = "";
    }
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-4 text-center">Carregando variacoes...</p>;
  }
  if (!variations || variations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Este produto nao tem variacoes salvas. Adicione variacoes e salve para definir imagens por variacao.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {variations.map((v) => {
        const busy = uploadingId === v.id || (setImage.isPending && setImage.variables?.id === v.id);
        return (
          <div key={v.id} className="flex items-center gap-3 rounded-md border border-border p-3">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded bg-muted">
              {v.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.imageUrl} alt={v.label} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <ImagePlus className="h-5 w-5" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{v.label}</p>
              {v.sku && <p className="truncate text-xs text-muted-foreground">{v.sku}</p>}
            </div>
            <input
              ref={(el) => {
                fileRefs.current[v.id] = el;
              }}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(v.id, file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => fileRefs.current[v.id]?.click()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : v.imageUrl ? "Trocar" : "Enviar"}
            </Button>
            {v.imageUrl && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remover imagem de ${v.label}`}
                disabled={removeImage.isPending}
                onClick={() => removeImage.mutate({ id: v.id })}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
