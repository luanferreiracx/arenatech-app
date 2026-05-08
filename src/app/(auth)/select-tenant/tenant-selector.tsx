"use client";

import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { switchTenantAction } from "@/app/actions/auth";

interface TenantSelectorProps {
  tenants: Array<{ id: string; slug: string; name: string; role: string }>;
}

export function TenantSelector({ tenants }: TenantSelectorProps) {
  async function handleSelect(tenantId: string) {
    const result = await switchTenantAction(tenantId);
    if (result && "error" in result) return;
    // Full navigation so proxy can handle the new cookie
    window.location.href = "/";
  }

  return (
    <div className="grid gap-3">
      {tenants.map((tenant) => (
        <button key={tenant.id} onClick={() => handleSelect(tenant.id)} className="text-left w-full">
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
