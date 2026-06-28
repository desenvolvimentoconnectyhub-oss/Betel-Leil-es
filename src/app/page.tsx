import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  ClipboardCheck,
  FileSearch,
  Gavel,
  KeyRound,
  MessageCircle,
  Scale,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { HomeLocationMap } from "@/components/public/HomeLocationMap";

const logoUrl = "https://pub-3b8a3e7613ad4776be18e72d6d78207f.r2.dev/logo-betel.png";

const process = [
  ["01", "Captacao", "Fontes, leiloeiros e editais entram na fila com deduplicacao e logs."],
  ["02", "Analise", "ROI, checklist juridico e valor de mercado antes de qualquer oferta."],
  ["03", "Matching", "Oportunidade cruza com capital, regiao, perfil de risco e liquidez."],
  ["04", "Leilao", "Teto autorizado, estrategia de lance e acompanhamento humano no dia."],
  ["05", "Pos-arremate", "Boleto, carta, matricula, posse e chaves ate o encerramento real."],
];

const modules = [
  { icon: Gavel, title: "Oportunidades", text: "Fila de imoveis, status, documentos, midias e fontes." },
  { icon: TrendingUp, title: "Score financeiro", text: "Custo total, desconto real, liquidez e teto racional." },
  { icon: FileSearch, title: "Juridico assistido", text: "IA prepara checklist; parecer final fica com revisao humana." },
  { icon: MessageCircle, title: "WhatsApp IA", text: "Envio semiautomatico, coleta de interesse e historico no CRM." },
  { icon: ClipboardCheck, title: "Contratos", text: "Assinatura, documentos e autorizacao formal de limite." },
  { icon: KeyRound, title: "Posse e chaves", text: "O caso so encerra quando matricula, posse e chaves forem entregues." },
];

const agents = [
  "Agente Captador",
  "Agente Triagem",
  "Agente Mercado",
  "Agente Edital",
  "Agente ROI",
  "Agente Matchmaker",
  "SDR WhatsApp IA",
  "CEO IA / Watchdog",
];

const guardrails = [
  "Sem promessa de lucro garantido",
  "Sem promessa de risco zero",
  "Juridico humano valida o parecer final",
  "Lance nunca ultrapassa o teto autorizado",
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <section className="relative flex min-h-[88svh] items-end overflow-hidden border-b border-[var(--line)]">
        <HomeLocationMap />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,9,11,0.98)_0%,rgba(8,9,11,0.9)_34%,rgba(8,9,11,0.5)_74%,rgba(8,9,11,0.32)_100%)]" />

        <header className="absolute left-0 right-0 top-0 z-10 border-b border-[var(--line)] bg-[rgba(8,9,11,0.7)] backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
            <Link href="/" className="flex min-w-0 items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-md border border-[rgba(216,173,88,0.22)] bg-transparent">
                <Image src={logoUrl} alt="Betel Leiloes" width={35} height={35} className="object-contain" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">
                  Betel Leiloes
                </span>
                <span className="block text-xs text-[var(--muted)]">AI Command Center</span>
              </span>
            </Link>

            <nav className="hidden items-center gap-6 text-sm text-[var(--muted)] md:flex">
              <a href="#processo" className="transition hover:text-white">Processo</a>
              <a href="#modulos" className="transition hover:text-white">Modulos</a>
              <a href="#governanca" className="transition hover:text-white">Governanca</a>
            </nav>

            <Link
              href="/admin"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--gold)] px-4 text-sm font-semibold text-[#141007] transition hover:bg-[var(--betel-gold-soft)]"
            >
              Entrar
              <ArrowRight size={16} />
            </Link>
          </div>
        </header>

        <div className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-40 pt-28 sm:pb-36 lg:px-8 lg:pb-14">
          <div className="max-w-4xl">
            <div className="mb-5 inline-flex h-9 items-center gap-2 rounded-md border border-[rgba(216,173,88,0.32)] bg-[rgba(216,173,88,0.1)] px-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--gold)]">
              <Sparkles size={15} />
              Betel AI
            </div>
            <h1 className="text-5xl font-semibold leading-[1.02] text-white sm:text-6xl lg:text-7xl">
              Betel AI
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[#d7d1c6] sm:text-lg">
              Command Center interno para assessoria em leiloes imobiliarios: da captacao da oportunidade ao pos-arremate, com IA operacional, governanca e decisao humana nos pontos criticos.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/admin"
                className="inline-flex h-11 items-center gap-2 rounded-md bg-[var(--gold)] px-5 text-sm font-semibold text-[#141007] transition hover:bg-[var(--betel-gold-soft)]"
              >
                Abrir painel admin
                <ArrowRight size={17} />
              </Link>
              <Link
                href="/admin/maintenance"
                className="inline-flex h-11 items-center gap-2 rounded-md border border-[var(--line)] bg-[rgba(21,23,27,0.82)] px-5 text-sm font-semibold text-white transition hover:border-[var(--gold)]"
              >
                Sala de manutencao
                <ShieldCheck size={17} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="processo" className="border-b border-[var(--line)] bg-[#0b0c0e] px-5 py-10 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">Fluxo Betel</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Do edital as chaves</h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-[var(--muted)]">
              A operacao acompanha cada caso ate matricula, posse e entrega das chaves, sem automatizar lance sem autorizacao.
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-5">
            {process.map(([n, title, text]) => (
              <article key={n} className="betel-panel rounded-md p-4">
                <div className="mb-5 flex items-center justify-between">
                  <span className="font-mono text-xs text-[var(--gold)]">{n}</span>
                  <BadgeCheck size={16} className="text-[var(--gold)]" />
                </div>
                <h3 className="text-sm font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="modulos" className="px-5 py-12 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 xl:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">Painel administrativo</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">A area interna vem primeiro</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              A Betel AI nasce focada na equipe: oportunidades, investidores, ROI, juridico, contratos, sala de leilao, pos-arremate e governanca.
            </p>
            <div className="mt-6 grid gap-2">
              {agents.map((agent) => (
                <div key={agent} className="flex items-center gap-3 rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[#d7d1c6]">
                  <Bot size={16} className="text-[var(--gold)]" />
                  {agent}
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {modules.map((module) => {
              const Icon = module.icon;
              return (
                <article key={module.title} className="betel-panel rounded-md p-4">
                  <div className="grid size-10 place-items-center rounded-md border border-[rgba(216,173,88,0.32)] bg-[rgba(216,173,88,0.1)]">
                    <Icon size={19} className="text-[var(--gold)]" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-white">{module.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{module.text}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="governanca" className="border-t border-[var(--line)] bg-[#0b0c0e] px-5 py-12 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="betel-panel rounded-md p-6">
            <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--gold)]">
              <Scale size={18} />
              Governanca
            </div>
            <h2 className="mt-4 text-2xl font-semibold text-white">IA auxilia, humano decide</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              A plataforma reduz trabalho manual e organiza decisoes, mas preserva revisao humana em juridico, autorizacao de lance e comunicacao sensivel com investidores.
            </p>
          </div>

          <div className="grid gap-3">
            {guardrails.map((rule) => (
              <div key={rule} className="flex items-center gap-3 rounded-md border border-[rgba(216,173,88,0.28)] bg-[rgba(216,173,88,0.08)] px-4 py-3 text-sm font-semibold text-[#f3dfb2]">
                <ShieldCheck size={17} className="text-[var(--gold)]" />
                {rule}
              </div>
            ))}
            <Link
              href="/admin"
              className="mt-2 inline-flex min-h-11 items-center justify-between gap-3 rounded-md border border-[var(--line)] bg-[var(--panel)] px-4 text-sm font-semibold text-white transition hover:border-[var(--gold)]"
            >
              Continuar para o Command Center
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
