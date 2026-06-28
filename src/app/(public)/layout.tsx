import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const logoUrl = "https://pub-3b8a3e7613ad4776be18e72d6d78207f.r2.dev/logo-betel.png";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[rgba(8,9,11,0.85)] backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3 lg:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-md border border-[rgba(216,173,88,0.22)]">
              <Image src={logoUrl} alt="Betel Leiloes" width={28} height={28} className="object-contain" />
            </span>
            <span className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">
              Betel Leiloes
            </span>
          </Link>

          <nav className="hidden items-center gap-5 text-sm text-[var(--muted)] md:flex">
            <Link href="/oportunidades" className="transition hover:text-white">
              Oportunidades
            </Link>
            <Link href="/blog" className="transition hover:text-white">
              Blog
            </Link>
            <Link href="/planos" className="transition hover:text-white">
              Planos
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/cadastro"
              className="hidden h-9 items-center rounded-md border border-[var(--line)] px-3 text-xs font-semibold text-white transition hover:border-[var(--gold)] sm:inline-flex"
            >
              Cadastrar
            </Link>
            <Link
              href="/login"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--gold)] px-4 text-xs font-semibold text-[#141007] transition hover:bg-[var(--betel-gold-soft)]"
            >
              Entrar
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </header>
      {children}
      <footer className="border-t border-[var(--line)] bg-[#0a0b0d] px-5 py-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 text-center text-xs text-[var(--muted)] md:flex-row md:justify-between md:text-left">
          <p>&copy; 2026 Betel Leiloes. Todos os direitos reservados.</p>
          <div className="flex items-center gap-4">
            <Link href="/planos" className="transition hover:text-white">Planos</Link>
            <Link href="/oportunidades" className="transition hover:text-white">Oportunidades</Link>
            <Link href="/blog" className="transition hover:text-white">Blog</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
