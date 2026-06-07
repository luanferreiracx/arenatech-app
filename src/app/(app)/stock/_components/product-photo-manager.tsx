"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { ImageIcon, Loader2, Star, Trash2, Upload } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { toast } from "@/lib/toast";

const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PHOTOS = 3;

type ImageProvider = "cloudinary" | "minio" | "external";
type ImageMetadataValue = string | number | boolean | null;
type ImageMetadata = Record<string, ImageMetadataValue>;

type UploadResponse = {
  id: string;
  url: string;
  thumbUrl?: string | null;
  mediumUrl?: string | null;
  provider?: ImageProvider | null;
  providerPublicId?: string | null;
  metadata?: ImageMetadata | null;
  error?: string;
};

type ProductPhotoManagerProps = {
  productId: string;
};

export function ProductPhotoManager({ productId }: ProductPhotoManagerProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string } | null>(null);

  const { data: photos = [], isLoading } = useQuery(
    trpc.stock.listPhotos.queryOptions({ productId }),
  );

  const invalidatePhotos = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.stock.listPhotos.queryKey({ productId }) }),
      queryClient.invalidateQueries({ queryKey: trpc.stock.getById.queryKey({ id: productId }) }),
      queryClient.invalidateQueries({ queryKey: [["stock"]] }),
    ]);
  };

  const createPhotoMutation = useMutation(
    trpc.stock.createPhoto.mutationOptions({
      onSuccess: async () => {
        toast.success("Foto adicionada");
        await invalidatePhotos();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const deletePhotoMutation = useMutation(
    trpc.stock.deletePhoto.mutationOptions({
      onSuccess: async () => {
        toast.success("Foto removida");
        setDeleteTarget(null);
        await invalidatePhotos();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const setPrimaryMutation = useMutation(
    trpc.stock.setPrimaryPhoto.mutationOptions({
      onSuccess: async () => {
        toast.success("Foto principal atualizada");
        await invalidatePhotos();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const isBusy = uploading || createPhotoMutation.isPending || deletePhotoMutation.isPending || setPrimaryMutation.isPending;
  const canUpload = photos.length < MAX_PHOTOS;

  async function handleFile(file: File) {
    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      toast.error("Formato nao suportado. Use JPG, PNG ou WebP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Imagem excede 10MB. Reduza o arquivo antes de enviar.");
      return;
    }
    if (!canUpload) {
      toast.error("Maximo de 3 fotos por produto.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("productId", productId);

      const response = await fetch("/api/products/upload", {
        method: "POST",
        body: formData,
      });
      const payload = parseUploadResponse(await response.json());

      if (!response.ok) {
        throw new Error(payload.error ?? "Erro ao enviar imagem.");
      }

      createPhotoMutation.mutate({
        productId,
        url: payload.url,
        thumbUrl: payload.thumbUrl ?? null,
        mediumUrl: payload.mediumUrl ?? null,
        provider: payload.provider ?? null,
        providerPublicId: payload.providerPublicId ?? null,
        metadata: payload.metadata ?? null,
        isPrimary: photos.length === 0,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao enviar imagem.";
      toast.error(message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const onSelectClick = () => {
    if (canUpload && !isBusy) fileRef.current?.click();
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void handleFile(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {isLoading ? (
          <div className="flex aspect-square items-center justify-center rounded-lg border bg-muted">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          photos.map((photo) => (
            <div key={photo.id} className="group relative overflow-hidden rounded-lg border bg-muted">
              <div className="aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.mediumUrl ?? photo.thumbUrl ?? photo.url}
                  alt="Foto do produto"
                  className="h-full w-full object-cover"
                />
              </div>
              {photo.isPrimary && (
                <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">
                  Principal
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex gap-1 bg-background/90 p-2 opacity-0 transition-opacity group-hover:opacity-100">
                {!photo.isPrimary && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 flex-1"
                    disabled={isBusy}
                    onClick={() => setPrimaryMutation.mutate({ productId, photoId: photo.id })}
                  >
                    <Star className="mr-1 h-3 w-3" />
                    Principal
                  </Button>
                )}
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-8"
                  disabled={isBusy}
                  onClick={() => setDeleteTarget(photo)}
                  aria-label="Remover foto"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))
        )}

        {canUpload && (
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={onSelectClick}
            className={`flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
              isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/60"
            } ${isBusy ? "pointer-events-none opacity-50" : ""}`}
          >
            {isBusy ? (
              <Loader2 className="mb-2 h-8 w-8 animate-spin text-muted-foreground" />
            ) : (
              <Upload className={`mb-2 h-8 w-8 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
            )}
            <p className="text-sm font-medium">
              {isDragging ? "Solte a foto aqui" : "Adicionar foto"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">JPG, PNG ou WebP ate 10MB</p>
          </div>
        )}
      </div>

      {!canUpload && (
        <p className="text-xs text-muted-foreground">Limite de 3 fotos atingido.</p>
      )}

      {photos.length === 0 && !isLoading && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          <ImageIcon className="h-4 w-4" />
          Nenhuma foto cadastrada para este produto.
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_MIME_TYPES.join(",")}
        onChange={onFileChange}
        className="hidden"
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Remover foto do produto?"
        description="A foto sera removida do produto e apagada do storage quando possivel."
        confirmLabel="Remover"
        variant="destructive"
        isLoading={deletePhotoMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) {
            deletePhotoMutation.mutate({ id: deleteTarget.id, productId });
          }
        }}
      />
    </div>
  );
}

function parseUploadResponse(value: unknown): UploadResponse {
  if (!isRecord(value)) {
    return { id: "", url: "", error: "Resposta invalida do upload." };
  }

  const id = typeof value.id === "string" ? value.id : "";
  const url = typeof value.url === "string" ? value.url : "";
  const error = typeof value.error === "string" ? value.error : undefined;

  return {
    id,
    url,
    thumbUrl: typeof value.thumbUrl === "string" ? value.thumbUrl : null,
    mediumUrl: typeof value.mediumUrl === "string" ? value.mediumUrl : null,
    provider: isImageProvider(value.provider) ? value.provider : null,
    providerPublicId: typeof value.providerPublicId === "string" ? value.providerPublicId : null,
    metadata: isImageMetadata(value.metadata) ? value.metadata : null,
    error,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isImageProvider(value: unknown): value is ImageProvider {
  return value === "cloudinary" || value === "minio" || value === "external";
}

function isImageMetadata(value: unknown): value is ImageMetadata {
  if (!isRecord(value)) return false;
  return Object.values(value).every(
    (entry) =>
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean" ||
      entry === null,
  );
}
