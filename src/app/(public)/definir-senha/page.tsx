import { Suspense } from "react";
import { AdminInvitePasswordPage } from "@/components/public/AdminInvitePasswordPage";

export const metadata = {
  title: "Definir senha | Betel Leiloes",
  description: "Cadastre sua senha de acesso ao painel administrativo da Betel.",
};

export default function DefinePasswordRoute() {
  return (
    <Suspense fallback={null}>
      <AdminInvitePasswordPage />
    </Suspense>
  );
}

