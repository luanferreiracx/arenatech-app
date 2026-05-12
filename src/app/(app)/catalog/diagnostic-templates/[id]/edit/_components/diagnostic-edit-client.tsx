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
  const { data: template, isLoading } = useQuery(
    trpc.catalog.getDiagnosticTemplate.queryOptions({ id }),
  );

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
