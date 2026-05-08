"use client";

import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { switchTenantAction } from "@/app/actions/auth";

interface TenantSelectorProps {
  tenants: Array<{ id: string; slug: string; name: string; role: string }>;
}

export function TenantSelector({ tenants }: TenantSelectorProps) {
  const router = useRouter();

  async function handleSelect(tenantId: string) {
    await switchTenantAction(tenantId);
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      {tenants.map((tenant) => (
        <button key={tenant.id} onClick={() => handleSelect(tenant.id)} className="text-left">
          <Card className="cursor-pointer transition-colors hover:bg-accent">
            <CardHeader className="py-4">
              <CardTitle className="text-base">{tenant.name}</CardTitle>
              <CardDescription className="text-xs">
                {tenant.slug} &middot; {tenant.role}
              </CardDescription>
            </CardHeader>
          </Card>
        </button>
      ))}
    </div>
  );
}
