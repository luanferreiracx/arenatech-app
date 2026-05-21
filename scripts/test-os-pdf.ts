import { writeFileSync } from "node:fs";
import { ServiceOrderPdfDocument } from "@/lib/pdf/service-order-pdf";
import { renderPdfToBuffer } from "@/lib/pdf/render";

async function main() {
  const buf = await renderPdfToBuffer(
    ServiceOrderPdfDocument({
      order: {
        number: "OS202600999",
        entryDate: new Date(),
        deviceType: "Celular",
        deviceModel: "Galaxy S22",
        imei: "352099001761481",
        devicePassword: "1234",
        reportedProblem: "Tela quebrada apos queda",
        entryChecklist: { aparelho_liga: true, aparelho_vibra: true, botoes_ok: false, audio_ok: null },
        deviceInfo: { cliente_aparelho_sofreu_queda: true, cliente_aparelho_molhou: false },
        serviceAmount: 150,
        partsAmount: 350,
        discount: 0,
        totalAmount: 500,
        paymentMethod: "PIX",
        completedDate: null,
        technicianId: "x",
        items: [
          { description: "Troca de tela", quantity: 1, unitPrice: 350, total: 350 },
          { description: "Mao de obra", quantity: 1, unitPrice: 150, total: 150 },
        ],
      },
      customer: { name: "Joao da Silva", cpf: "111.444.777-35", phone: "(86) 99999-8888", email: "joao@test.com" },
      store: { name: "ARENA TECH", cnpj: "11.222.333/0001-81", phone: "(86) 3000-0000", logoUrl: null },
      technicianName: "Carlos Tecnico",
      termsOfService: "Termo 1\nTermo 2\nTermo 3",
      warrantyPolicy: "Garantia de 90 dias.",
    }),
  );
  writeFileSync("/tmp/test-os-output.pdf", buf);
  console.log(`OK: ${buf.length} bytes em /tmp/test-os-output.pdf`);
}
main().catch((e) => { console.error(e); process.exit(1); });
