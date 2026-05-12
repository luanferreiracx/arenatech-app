"use client";

import { use } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { DiagnosticTemplateForm } from "../../_components/diagnostic-template-form";

export default function EditDiagnosticTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const trpc = useTRPC();
  const { data: template, isLoading } = useQuery(
    trpc.catalog.getDiagnosticTemplate.queryOptions({ id }),
  );

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Editar Template" />
        <LoadingState variant="form" rows={4} />
      </div>
    );
  }

  if (!template) {
    return (
      <div>
        <PageHeader title="Template nao encontrado" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Editar Template" subtitle={template.title} />
      <DiagnosticTemplateForm
        isEdit
        defaultValues={{
          id: template.id,
          title: template.title,
          content: template.content,
          category: template.category ?? "",
        }}
      />
    </div>
  );
}
