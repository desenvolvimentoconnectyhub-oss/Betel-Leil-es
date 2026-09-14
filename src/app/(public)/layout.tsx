import { PublicShell } from "@/components/public/PublicShell";
import { VisitorActivity } from "@/components/public/VisitorActivity";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell><VisitorActivity />{children}<footer className="px-5 py-6 text-center text-sm text-[var(--muted)]"><a href="/privacidade">Privacidade e reconhecimento de visitas</a></footer></PublicShell>;
}
