"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { adminNavGroups } from "@/lib/admin/modules";
import { cn } from "@/lib/utils";

const items = adminNavGroups.flatMap((group) =>
  group.items.map((item) => ({ ...item, group: group.label }))
);

export function CommandSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items.slice(0, 6);
    return items
      .filter((item) => `${item.label} ${item.group}`.toLowerCase().includes(normalized))
      .slice(0, 7);
  }, [query]);

  return (
    <div className="relative hidden min-w-[22rem] max-w-[34rem] flex-1 xl:block">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full items-center gap-2 rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] px-3 text-left text-xs text-[var(--admin-muted)] transition hover:border-[rgba(255,255,255,0.2)]"
      >
        <Search size={15} />
        Buscar oportunidade, fonte, agente, usuario ou conteudo
        <span className="ml-auto rounded-md border border-[var(--admin-border)] px-1.5 py-0.5 font-mono text-[10px]">
          Ctrl K
        </span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-11 z-50 rounded-lg border border-[var(--admin-border)] bg-[#0b0b0b] p-2 shadow-2xl">
          <div className="flex h-10 items-center gap-2 border-b border-[var(--admin-border)] px-2">
            <Search size={15} className="text-[var(--admin-muted)]" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Digite para buscar"
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[var(--admin-muted)]"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid size-7 place-items-center rounded-md text-[var(--admin-muted)] hover:bg-white/[0.06] hover:text-white"
            >
              <X size={14} />
              <span className="sr-only">Fechar busca</span>
            </button>
          </div>
          <div className="mt-2 grid gap-1">
            {filtered.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center justify-between rounded-md px-2 py-2 text-sm text-[var(--admin-soft)] hover:bg-white/[0.06] hover:text-white"
                )}
              >
                <span>{item.label}</span>
                <span className="font-mono text-[10px] uppercase text-[var(--admin-muted)]">{item.group}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
