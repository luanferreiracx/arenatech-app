import { MessageCircle } from "lucide-react";

type WhatsAppFabProps = {
  whatsappNumber: string;
  storeName: string;
};

export function WhatsAppFab({ whatsappNumber, storeName }: WhatsAppFabProps) {
  const message = `Olá, ${storeName}! Vi o catálogo e gostaria de mais informações.`;
  const href = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="Falar no WhatsApp"
      className="group fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-[#25D366] py-3 pl-3 pr-4 font-semibold text-[var(--cat-bg)] shadow-[0_12px_40px_-8px_rgba(37,211,102,0.6)] transition hover:scale-105 active:scale-95 sm:bottom-7 sm:right-7"
    >
      <MessageCircle className="size-6" />
      <span className="hidden text-sm sm:inline">Falar no WhatsApp</span>
    </a>
  );
}
