import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Cadastro Aprovado | Arena Tech",
};

export default function RegisterApprovedPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg text-center">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-12">
          {/* Icon */}
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center mx-auto mb-6">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-white mb-4">Cadastro Aprovado!</h1>

          <p className="text-white/60 text-lg mb-8 leading-relaxed">
            Parabens! Sua conta foi criada com sucesso.
            <br />
            Acesse o sistema usando as credenciais enviadas para seu email.
          </p>

          <Link
            href="/login"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-primary to-amber-600 text-black font-bold py-3 px-8 rounded-lg hover:opacity-90 transition-opacity"
          >
            Acessar o Sistema
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>

          <p className="text-white/40 text-sm mt-6">
            Verifique sua caixa de entrada (e spam) para as credenciais de acesso.
          </p>
        </div>
      </div>
    </div>
  );
}
