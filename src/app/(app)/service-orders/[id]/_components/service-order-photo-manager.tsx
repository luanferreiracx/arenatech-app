"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { toast } from "@/lib/toast";
import { PhotoGallery } from "@/components/domain/photo-gallery";

const MAX_PHOTOS = 12;

/**
 * Fotos do aparelho na OS — reusa a MESMA galeria do catálogo (PhotoGallery) e a
 * mesma infra de upload (Cloudinary/MinIO). Só troca os endpoints/mutations por
 * entidade. Registrar o estado do aparelho na entrada/saída é a defesa nº1 de
 * assistência técnica ("vocês arranharam meu celular").
 */
export function ServiceOrderPhotoManager({ orderId }: { orderId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: photos = [], isLoading } = useQuery(
    trpc.serviceOrder.listPhotos.queryOptions({ orderId }),
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trpc.serviceOrder.listPhotos.queryKey({ orderId }) });

  const addMutation = useMutation(
    trpc.serviceOrder.addPhoto.mutationOptions({
      onSuccess: () => {
        toast.success("Foto adicionada");
        void invalidate();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const deleteMutation = useMutation(
    trpc.serviceOrder.deletePhoto.mutationOptions({
      onSuccess: () => {
        toast.success("Foto removida");
        void invalidate();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <PhotoGallery
      photos={photos}
      isLoading={isLoading}
      isBusy={addMutation.isPending || deleteMutation.isPending}
      maxPhotos={MAX_PHOTOS}
      uploadEndpoint="/api/service-orders/upload"
      uploadFields={{ orderId }}
      altText="Foto do aparelho"
      emptyLabel="Nenhuma foto do aparelho. Fotografe o estado na entrada e na saída."
      deleteTitle="Remover foto do aparelho?"
      deleteDescription="A foto será removida da OS e apagada do storage quando possível."
      onUploaded={(payload) =>
        addMutation.mutate({
          orderId,
          url: payload.url,
          thumbUrl: payload.thumbUrl ?? null,
          mediumUrl: payload.mediumUrl ?? null,
          provider: payload.provider ?? null,
          providerPublicId: payload.providerPublicId ?? null,
        })
      }
      onDelete={(photo) => deleteMutation.mutate({ id: photo.id })}
    />
  );
}
