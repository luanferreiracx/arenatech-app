import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Aguardando Aprovacao | Arena Tech",
};

export default function RegisterPendingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg text-center">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-12">
          {/* Icon */}
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-500 to-primary flex items-center justify-center mx-auto mb-6">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-white mb-4">Aguardando Aprovacao</h1>

          <p className="text-white/60 text-lg mb-8 leading-relaxed">
            Seu pre-cadastro foi recebido e esta em analise pela nossa equipe.
            <br />
            Voce recebera uma mensagem no <strong className="text-white/80">WhatsApp</strong> informado assim que for aprovado.
          </p>

          <p className="text-white/40 text-sm">
            Duvidas? Entre em contato pelo WhatsApp{" "}
            <a href="https://wa.me/5586999999999" className="text-primary hover:underline">
              (86) 99999-9999
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
