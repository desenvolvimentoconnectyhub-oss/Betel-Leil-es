'use client';
import { useEffect, useState } from 'react';

export function VisitorPreferences() {
  const [state, setState] = useState<{ remembered: boolean; identified: boolean; denied: boolean; days: number } | null>(null);
  const [claim, setClaim] = useState<{ claimId: string; code: string } | null>(null);
  const [suffix, setSuffix] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    const response = await fetch('/api/visita', { cache: 'no-store' });
    if (!response.ok) throw new Error('Preferências indisponíveis.');
    setState(await response.json());
  }
  useEffect(() => { void Promise.resolve().then(load).catch(error => setError(error.message)); }, []);
  async function act(action: string) {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/visita', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, claimId: claim?.claimId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Tente novamente.');
      if (action === 'claim') { setClaim(result); setSuffix(''); }
      if (action === 'claim_status') {
        if (result.ready) setSuffix(result.phoneSuffix);
        else setError('A mensagem de confirmação ainda não chegou. Envie o código na sua conversa com a Betel e confira novamente.');
      }
      if (action === 'forget' || action === 'confirm') { setClaim(null); setSuffix(''); }
      await load();
    } catch (error) { setError(error instanceof Error ? error.message : 'Tente novamente.'); }
    finally { setBusy(false); }
  }
  const button = 'rounded-md border border-[var(--line)] px-4 py-3 text-sm disabled:opacity-50';
  return <section className="space-y-5 rounded-xl border border-[var(--line)] p-6">
    <h2 className="text-xl font-semibold">Reconhecimento neste navegador</h2>
    <p>{state?.remembered ? state.identified ? 'Este navegador está associado ao seu atendimento confirmado.' : 'Este navegador é reconhecido de forma anônima.' : 'Reconhecimento de visitas desativado.'}</p>
    <p className="text-sm text-[var(--muted)]">Se você aceitar, a Betel reconhece visitas por {state?.days || 30} dias neste navegador. Apagar cookies, bloquear armazenamento ou usar outro aparelho interrompe esse reconhecimento. Não usamos impressão digital do dispositivo.</p>
    <div className="flex flex-wrap gap-3">
      <button className={button} disabled={busy || !state || state.remembered} onClick={() => void act('remember')}>Permitir reconhecimento</button>
      <button className={button} disabled={busy || !state} onClick={() => void act('forget')}>Desativar e esquecer navegador</button>
      {state?.remembered && !state.identified ? <button className={button} disabled={busy} onClick={() => void act('claim')}>Associar ao meu atendimento</button> : null}
    </div>
    {claim ? <div className="space-y-4">
      <p>Envie este código na sua conversa direta com um agente da Betel no WhatsApp. Ele vale por 15 minutos. Não encaminhe o código a outras pessoas.</p>
      <code className="block break-all rounded bg-black/20 p-3">{claim.code}</code>
      <button className={button} disabled={busy} onClick={() => void act('claim_status')}>Já enviei: conferir contato</button>
      {suffix ? <div className="space-y-3"><p>Recebemos o código do WhatsApp terminado em <strong>{suffix}</strong>. Confirme apenas se esse contato é seu. Suas visitas ainda guardadas neste navegador serão associadas a esse atendimento.</p><button className={button} disabled={busy} onClick={() => void act('confirm')}>Esse contato é meu: confirmar associação</button></div> : null}
    </div> : null}
    {error ? <p role="alert" className="text-amber-300">{error}</p> : null}
  </section>;
}
