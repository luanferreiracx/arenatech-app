import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pagamento DePix | Arena Tech",
  description: "Pague com PIX de forma rapida e segura",
};

export default async function PublicPaymentPage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="text-center p-8 border-b border-white/5">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-amber-600 flex items-center justify-center mx-auto mb-4 text-2xl">
              &#8383;
            </div>
            <h1 className="text-xl font-bold text-white mb-1">Pagamento via DePix</h1>
            <p className="text-white/50 text-sm">Pague com PIX de forma rapida e segura</p>
          </div>

          {/* Body */}
          <div className="p-8 space-y-6">
            <div className="text-center">
              <p className="text-xs uppercase tracking-wider text-white/40 font-semibold mb-1">Token de Pagamento</p>
              <p className="font-mono text-sm text-white/70 break-all">{params.token}</p>
            </div>

            <div className="text-center py-8">
              <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
                <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24" className="text-white/30">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-white/60 text-sm">
                Esta pagina exibira o QR Code para pagamento quando a integracao DePix estiver ativa.
              </p>
              <p className="text-white/40 text-xs mt-2">
                Pagamento processado via rede Liquid (Bitcoin)
              </p>
            </div>

            <div className="text-center text-xs text-white/30 flex items-center justify-center gap-1">
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              Pagamento seguro
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
