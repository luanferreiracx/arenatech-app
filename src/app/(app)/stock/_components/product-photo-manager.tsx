"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { toast } from "@/lib/toast";
import { PhotoGallery } from "@/components/domain/photo-gallery";

const MAX_PHOTOS = 3;

type ProductPhotoManagerProps = {
  productId: string;
};

export function ProductPhotoManager({ productId }: ProductPhotoManagerProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

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

  const isBusy =
    createPhotoMutation.isPending || deletePhotoMutation.isPending || setPrimaryMutation.isPending;

  return (
    <PhotoGallery
      photos={photos}
      isLoading={isLoading}
      isBusy={isBusy}
      maxPhotos={MAX_PHOTOS}
      uploadEndpoint="/api/products/upload"
      uploadFields={{ productId }}
      altText="Foto do produto"
      emptyLabel="Nenhuma foto cadastrada para este produto."
      deleteTitle="Remover foto do produto?"
      deleteDescription="A foto será removida do produto e apagada do storage quando possível."
      onUploaded={(payload) =>
        createPhotoMutation.mutate({
          productId,
          url: payload.url,
          thumbUrl: payload.thumbUrl ?? null,
          mediumUrl: payload.mediumUrl ?? null,
          provider: payload.provider ?? null,
          providerPublicId: payload.providerPublicId ?? null,
          metadata: payload.metadata ?? null,
          isPrimary: photos.length === 0,
        })
      }
      onDelete={(photo) => deletePhotoMutation.mutate({ id: photo.id, productId })}
      onSetPrimary={(photo) => setPrimaryMutation.mutate({ productId, photoId: photo.id })}
    />
  );
}
