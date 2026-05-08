"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { LoadingState } from "@/components/domain/loading-state";
import { DiagnosticForm } from "../../../_components/diagnostic-form";

interface Props {
  id: string;
}

export function DiagnosticEditClient({ id }: Props) {
  const trpc = useTRPC();
  // We list all and find the one — simple enough since templates are paginated
  const { data, isLoading } = useQuery(
    trpc.catalog.listDiagnosticTemplates.queryOptions({ page: 0, pageSize: 200 }),
  );

  const template = data?.items.find((t) => t.id === id);

  if (isLoading) return <LoadingState variant="form" />;
  if (!template) return <p className="text-muted-foreground">Template não encontrado.</p>;

  return (
    <DiagnosticForm
      mode="edit"
      defaultValues={{
        id: template.id,
        title: template.title,
        content: template.content,
        category: template.category ?? undefined,
        active: template.active,
      }}
    />
  );
}
