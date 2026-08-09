import { Suspense } from "react";
import { LoginPage } from "@/components/public/LoginPage";

export const metadata = {
  title: "Acesso CRM | Betel Leiloes",
  description: "Acesso interno para operadores do sistema Betel.",
};

export default function LoginRoute() {
  return (
    <Suspense fallback={null}>
      <LoginPage />
    </Suspense>
  );
}
