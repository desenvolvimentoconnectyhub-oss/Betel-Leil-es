import { redirect } from "next/navigation";

export const metadata = {
  title: "Acesso administrativo | Betel Leiloes",
  description: "Acessos administrativos sao gerenciados dentro do painel Betel.",
};

export default function CadastroRoute() {
  redirect("/login?error=operator_invite_required");
}
