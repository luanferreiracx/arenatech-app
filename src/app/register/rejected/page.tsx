import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pre-Cadastro Nao Aprovado | Arena Tech",
};

export default function RegisterRejectedPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg text-center">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-12">
          {/* Icon */}
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center mx-auto mb-6">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-white mb-4">Pre-Cadastro Nao Aprovado</h1>

          <p className="text-white/60 text-lg mb-8 leading-relaxed">
            Infelizmente, nao foi possivel aprovar seu pre-cadastro.
            <br />
            Se voce acredita que houve um erro, entre em contato conosco.
          </p>

          <div className="flex gap-4 justify-center flex-wrap">
            <a
              href="https://wa.me/5586999999999"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-emerald-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Falar no WhatsApp
            </a>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 bg-white/10 text-white font-bold py-3 px-6 rounded-lg hover:bg-white/20 transition-colors"
            >
              Ver Planos
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
