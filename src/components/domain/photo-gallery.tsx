"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { ImageIcon, Loader2, Star, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { toast } from "@/lib/toast";

const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

export type GalleryImageProvider = "cloudinary" | "minio" | "external";
type ImageMetadataValue = string | number | boolean | null;
export type GalleryImageMetadata = Record<string, ImageMetadataValue>;

export type GalleryUploadResponse = {
  id: string;
  url: string;
  thumbUrl?: string | null;
  mediumUrl?: string | null;
  provider?: GalleryImageProvider | null;
  providerPublicId?: string | null;
  metadata?: GalleryImageMetadata | null;
  error?: string;
};

export type GalleryPhoto = {
  id: string;
  url: string;
  thumbUrl?: string | null;
  mediumUrl?: string | null;
  isPrimary?: boolean;
};

type PhotoGalleryProps = {
  photos: GalleryPhoto[];
  isLoading?: boolean;
  isBusy?: boolean;
  maxPhotos: number;
  /** Endpoint que recebe o arquivo (multipart) e devolve as URLs. */
  uploadEndpoint: string;
  /** Campos extras do formData (ex.: { productId } ou { orderId }). */
  uploadFields: Record<string, string>;
  /** Chamado com a resposta do upload — o pai persiste (create mutation). */
  onUploaded: (payload: GalleryUploadResponse) => void;
  onDelete: (photo: GalleryPhoto) => void;
  /** Opcional: define a foto principal (só faz sentido no catálogo de produto). */
  onSetPrimary?: (photo: GalleryPhoto) => void;
  altText?: string;
  emptyLabel?: string;
  deleteTitle?: string;
  deleteDescription?: string;
};

/**
 * Galeria de fotos reutilizável (drag-and-drop + grid + remoção) — extraída do
 * catálogo de produto para ser compartilhada com as fotos do aparelho na OS.
 * O componente cuida do upload (POST multipart → `uploadEndpoint`) e da UI; o pai
 * fornece as fotos e as callbacks de persistência/remoção (as queries/mutations
 * tRPC específicas de cada entidade ficam no pai).
 */
export function PhotoGallery({
  photos,
  isLoading = false,
  isBusy = false,
  maxPhotos,
  uploadEndpoint,
  uploadFields,
  onUploaded,
  onDelete,
  onSetPrimary,
  altText = "Foto",
  emptyLabel = "Nenhuma foto cadastrada.",
  deleteTitle = "Remover foto?",
  deleteDescription = "A foto será removida e apagada do storage quando possível.",
}: PhotoGalleryProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GalleryPhoto | null>(null);

  const busy = uploading || isBusy;
  const canUpload = photos.length < maxPhotos;

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
      toast.error(`Máximo de ${maxPhotos} fotos.`);
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      for (const [k, v] of Object.entries(uploadFields)) formData.append(k, v);

      const response = await fetch(uploadEndpoint, { method: "POST", body: formData });
      const payload = parseUploadResponse(await response.json());
      if (!response.ok) throw new Error(payload.error ?? "Erro ao enviar imagem.");
      onUploaded(payload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao enviar imagem.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

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
              <a
                href={photo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block aspect-square"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.mediumUrl ?? photo.thumbUrl ?? photo.url}
                  alt={altText}
                  className="h-full w-full object-cover"
                />
              </a>
              {photo.isPrimary && (
                <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">
                  Principal
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex gap-1 bg-background/90 p-2 opacity-0 transition-opacity group-hover:opacity-100">
                {onSetPrimary && !photo.isPrimary && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 flex-1"
                    disabled={busy}
                    onClick={() => onSetPrimary(photo)}
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
                  disabled={busy}
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
            onClick={() => !busy && fileRef.current?.click()}
            className={`flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
              isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/60"
            } ${busy ? "pointer-events-none opacity-50" : ""}`}
          >
            {busy ? (
              <Loader2 className="mb-2 h-8 w-8 animate-spin text-muted-foreground" />
            ) : (
              <Upload className={`mb-2 h-8 w-8 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
            )}
            <p className="text-sm font-medium">{isDragging ? "Solte a foto aqui" : "Adicionar foto"}</p>
            <p className="mt-1 text-xs text-muted-foreground">JPG, PNG ou WebP até 10MB</p>
          </div>
        )}
      </div>

      {!canUpload && (
        <p className="text-xs text-muted-foreground">Limite de {maxPhotos} fotos atingido.</p>
      )}

      {photos.length === 0 && !isLoading && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          <ImageIcon className="h-4 w-4" />
          {emptyLabel}
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
        title={deleteTitle}
        description={deleteDescription}
        confirmLabel="Remover"
        variant="destructive"
        isLoading={isBusy}
        onConfirm={() => {
          if (deleteTarget) {
            onDelete(deleteTarget);
            setDeleteTarget(null);
          }
        }}
      />
    </div>
  );
}

function parseUploadResponse(value: unknown): GalleryUploadResponse {
  if (!isRecord(value)) return { id: "", url: "", error: "Resposta invalida do upload." };
  return {
    id: typeof value.id === "string" ? value.id : "",
    url: typeof value.url === "string" ? value.url : "",
    thumbUrl: typeof value.thumbUrl === "string" ? value.thumbUrl : null,
    mediumUrl: typeof value.mediumUrl === "string" ? value.mediumUrl : null,
    provider: isImageProvider(value.provider) ? value.provider : null,
    providerPublicId: typeof value.providerPublicId === "string" ? value.providerPublicId : null,
    metadata: isImageMetadata(value.metadata) ? value.metadata : null,
    error: typeof value.error === "string" ? value.error : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isImageProvider(value: unknown): value is GalleryImageProvider {
  return value === "cloudinary" || value === "minio" || value === "external";
}

function isImageMetadata(value: unknown): value is GalleryImageMetadata {
  if (!isRecord(value)) return false;
  return Object.values(value).every(
    (entry) =>
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean" ||
      entry === null,
  );
}
