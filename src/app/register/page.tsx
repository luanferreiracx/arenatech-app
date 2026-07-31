import { RegisterForm } from "./_components/register-form";

export const metadata = {
  title: "Cadastre sua Loja | Arena Tech",
};

export default function RegisterPage() {
  // AD-2: `<main>` em vez de `div`. Medido: as quatro telas de auto-cadastro não
  // tinham landmark nenhum (main 0, header 0) — mesma ausência do catálogo
  // público (CTU-2). São a porta de entrada de quem chega de fora e ainda não tem
  // conta; sem `main` não há como pular para o conteúdo (WCAG 1.3.1).
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-accent/20 p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary">Arena Tech</h1>
          <p className="text-muted-foreground mt-2">Cadastre sua loja na plataforma</p>
        </div>
        <RegisterForm />
      </div>
    </main>
  );
}
