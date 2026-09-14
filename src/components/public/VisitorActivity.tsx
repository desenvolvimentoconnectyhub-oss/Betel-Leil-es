'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export function VisitorActivity() {
  const path = usePathname();
  useEffect(() => {
    if (!/^\/(?:oportunidades(?:\/[a-zA-Z0-9_-]+)?|blog(?:\/[a-zA-Z0-9_-]+)?|planos)?$/.test(path)) return;
    const controller = new AbortController();
    const eventId = crypto.randomUUID();
    async function record() {
      const state = await fetch('/api/visita', { signal: controller.signal, cache: 'no-store' });
      if (!state.ok || !(await state.json()).remembered) return;
      const request = { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'page', eventId, path }) };
      const response = await fetch('/api/visita', request);
      if (!response.ok) await fetch('/api/visita', request);
    }
    void record().catch(() => undefined);
    return () => controller.abort();
  }, [path]);
  return null;
}
