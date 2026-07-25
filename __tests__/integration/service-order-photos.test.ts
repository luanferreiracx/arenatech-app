/**
 * C1 — fotos do aparelho na OS (serviceOrder.addPhoto/listPhotos/deletePhoto),
 * reusando a infra de imagem do catálogo. Testa a persistência (ServiceOrderDocument
 * type="photo"), a listagem, a remoção e a guarda de máximo.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = `os-photos-${Date.now().toString(36)}`;
let tenantId: string, adminId: string, customerId: string, orderId: string, adminCtx: any;
const call = (c: any) => createCallerFactory(appRouter)(c);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id;
  adminId = admin.id;
  adminCtx = {
    session: { user: { id: adminId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }] },
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };
  const customer = await prisma.customer.create({ data: { tenantId, name: `Cliente ${MARK}`, phone: "11955551234" } });
  customerId = customer.id;
  const order = await prisma.serviceOrder.create({
    data: {
      tenantId,
      number: `${MARK}-OS`,
      customerId,
      createdById: adminId,
      publicLink: `${MARK}-${Math.random().toString(36).slice(2)}`,
      deviceBrand: "Apple",
      deviceModel: "iPhone 13",
    },
  });
  orderId = order.id;
});

afterAll(async () => {
  await prisma.serviceOrderDocument.deleteMany({ where: { orderId } });
  await prisma.serviceOrder.deleteMany({ where: { id: orderId } });
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.$disconnect();
});

const photoInput = (n: number) => ({
  orderId,
  url: `https://example.com/${MARK}-${n}.webp`,
  thumbUrl: `https://example.com/${MARK}-${n}-thumb.webp`,
  mediumUrl: `https://example.com/${MARK}-${n}-medium.webp`,
  provider: null,
  providerPublicId: null,
});

describe("C1 — fotos do aparelho na OS", () => {
  it("add persiste e list retorna a foto (com thumb/medium)", async () => {
    const created = await call(adminCtx).serviceOrder.addPhoto(photoInput(1));
    expect(created.id).toBeTruthy();

    const list = await call(adminCtx).serviceOrder.listPhotos({ orderId });
    const found = list.find((p: any) => p.id === created.id);
    expect(found).toBeDefined();
    expect(found!.url).toContain(`${MARK}-1.webp`);
    expect(found!.thumbUrl).toContain("thumb");

    // Persistido como ServiceOrderDocument type="photo".
    const doc = await prisma.serviceOrderDocument.findUniqueOrThrow({ where: { id: created.id } });
    expect(doc.type).toBe("photo");
  });

  it("delete remove a foto", async () => {
    const created = await call(adminCtx).serviceOrder.addPhoto(photoInput(2));
    await call(adminCtx).serviceOrder.deletePhoto({ id: created.id });
    const doc = await prisma.serviceOrderDocument.findUnique({ where: { id: created.id } });
    expect(doc).toBeNull();
  });

  it("bloqueia acima de 12 fotos", async () => {
    // Já há 1 (foto 1). Enche até 12, a 13ª falha.
    const existing = await prisma.serviceOrderDocument.count({ where: { orderId, type: "photo" } });
    for (let i = existing; i < 12; i++) {
      await call(adminCtx).serviceOrder.addPhoto(photoInput(100 + i));
    }
    await expect(call(adminCtx).serviceOrder.addPhoto(photoInput(999))).rejects.toThrow(/Maximo de 12/i);
  });
});
