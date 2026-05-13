import { RegisterForm } from "./_components/register-form";

export const metadata = {
  title: "Cadastre sua Loja | Arena Tech",
};

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-accent/20 p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary">Arena Tech</h1>
          <p className="text-muted-foreground mt-2">Cadastre sua loja na plataforma</p>
        </div>
        <RegisterForm />
      </div>
    </div>
  );
}
