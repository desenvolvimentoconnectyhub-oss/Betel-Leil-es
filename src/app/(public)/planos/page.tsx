import { subscriberPlans } from "@/lib/subscribers";
import { PlansPage } from "@/components/public/PlansPage";

export const metadata = {
  title: "Planos | Betel Leiloes",
  description: "Escolha o plano ideal para acessar oportunidades de leilao imobiliario.",
};

export default function PlanosRoute() {
  return <PlansPage plans={subscriberPlans} />;
}
