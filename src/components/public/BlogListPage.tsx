"use client";

import { FileText, PenTool } from "lucide-react";
import Link from "next/link";
import type { ContentPost } from "@/lib/admin/repository/intelligence";

function formatDate(iso: string) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function BlogListPage({ posts }: { posts: ContentPost[] }) {
  const published = posts.filter((p) => p.status === "published");

  return (
    <main className="min-h-screen bg-[var(--background)] px-5 py-10 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <PenTool size={24} className="text-[var(--gold)]" />
            <h1 className="text-2xl font-bold text-white">Blog</h1>
          </div>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Artigos, noticias e analises sobre leiloes imobiliarios no Brasil.
          </p>
        </div>

        {published.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <FileText size={48} className="text-[var(--muted)] opacity-30" />
            <h2 className="text-lg font-semibold text-white">Em breve</h2>
            <p className="max-w-md text-sm text-[var(--muted)]">
              Nossos agentes de conteudo estao sendo ativados. Em breve, artigos e noticias sobre o mercado de leiloes
              imobiliarios serao publicados aqui automaticamente.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {published.map((post) => (
              <article
                key={post.id}
                className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 transition hover:border-[var(--gold)]"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--gold)]">
                  {post.contentType}
                </p>
                <h2 className="mt-2 text-base font-semibold text-white">{post.title}</h2>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--muted)]">{post.excerpt}</p>
                <div className="mt-4 flex items-center justify-between text-xs text-[var(--muted)]">
                  <span>{formatDate(post.publishedAt || post.createdAt)}</span>
                  {post.tags.length > 0 && (
                    <div className="flex gap-1">
                      {post.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
