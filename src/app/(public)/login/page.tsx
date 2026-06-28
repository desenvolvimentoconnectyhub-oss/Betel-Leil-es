import { Suspense } from "react";
import { LoginPage } from "@/components/public/LoginPage";

export const metadata = {
  title: "Entrar | Betel Leiloes",
  description: "Acesse sua conta para ver oportunidades de leilao.",
};

export default function LoginRoute() {
  return (
    <Suspense fallback={null}>
      <LoginPage />
    </Suspense>
  );
}
