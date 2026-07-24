import { describe, it, expect, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { assertSkuBarcodeAvailable } from "@/server/services/product-sku-barcode.service";

/**
 * Comportamento: SKU e código de barras são únicos por tenant (produtos ativos).
 * O helper barra a duplicata com CONFLICT antes de gravar, em create/update/
 * duplicate. `excludeProductId` isenta o próprio produto na edição.
 */

/** tx fake: `product.findFirst` devolve o que a fábrica configurar. */
function makeTx(findResult: { name: string } | null) {
  const findFirst = vi.fn().mockResolvedValue(findResult);
  const tx = { product: { findFirst } } as unknown as Prisma.TransactionClient;
  return { tx, findFirst };
}

describe("assertSkuBarcodeAvailable", () => {
  it("passa quando SKU e barcode estão livres", async () => {
    const { tx } = makeTx(null);
    await expect(
      assertSkuBarcodeAvailable(tx, { sku: "ABC-1", barcode: "789" }),
    ).resolves.toBeUndefined();
  });

  it("lança CONFLICT quando o SKU já pertence a outro produto", async () => {
    const { tx } = makeTx({ name: "Produto X" });
    await expect(
      assertSkuBarcodeAvailable(tx, { sku: "ABC-1" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("lança CONFLICT quando o barcode já pertence a outro produto", async () => {
    const { tx } = makeTx({ name: "Produto Y" });
    await expect(
      assertSkuBarcodeAvailable(tx, { barcode: "789" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("ignora SKU/barcode vazios ou nulos (não consulta nem barra)", async () => {
    const { tx, findFirst } = makeTx({ name: "qualquer" });
    await expect(
      assertSkuBarcodeAvailable(tx, { sku: "  ", barcode: null }),
    ).resolves.toBeUndefined();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("na edição, isenta o próprio produto via excludeProductId", async () => {
    const { tx, findFirst } = makeTx(null);
    await assertSkuBarcodeAvailable(tx, { sku: "ABC-1", excludeProductId: "self-id" });
    // O where deve incluir a exclusão do próprio id.
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: "self-id" } }),
      }),
    );
  });
});
