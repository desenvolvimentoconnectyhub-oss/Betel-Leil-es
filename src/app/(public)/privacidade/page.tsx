import { VisitorPreferences } from '@/components/public/VisitorPreferences';
import { journeyDays } from '@/lib/whatsapp/visitor-journey';
export const dynamic = 'force-dynamic';
export default function PrivacyPage() {
  return <main className="mx-auto w-full max-w-3xl space-y-6 px-5 py-12">
    <h1 className="text-3xl font-semibold">Privacidade das visitas e links</h1>
    <p className="leading-7 text-[var(--muted)]">A Betel registra aberturas dos seus links e, com sua autorização, visitas às páginas públicas. Esses eventos ficam no banco da Betel por até {journeyDays()} dias, junto do atendimento quando houver uma associação confirmada. O destinatário de uma mensagem não é considerado automaticamente o autor do clique.</p>
    <p className="leading-7 text-[var(--muted)]">Não coletamos IP, localização precisa, conteúdo de formulários ou impressão digital para esse reconhecimento. Não acompanhamos sua navegação nos portais externos após o redirecionamento. Abrir um convite não comprova entrada no grupo. As preferências de privacidade DNT e GPC são respeitadas.</p>
    <VisitorPreferences />
    <p className="text-sm text-[var(--muted)]">Desativar remove o vínculo do navegador para novas visitas. Mensagens e registros comerciais anteriores seguem as regras do atendimento. Para solicitar revisão ou exclusão do seu histórico, use seu canal de atendimento com a Betel.</p>
  </main>;
}
