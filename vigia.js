const fs = require('fs');
const WEBHOOK = process.env.DISCORD_WEBHOOK;
const ARQ = 'estado.json';
const alvos = [
  { id: 'api', nome: 'API do Loudly', url: 'https://api.loudlyapp.duckdns.org/health', fallback: 'https://api.loudlyapp.duckdns.org/' },
  { id: 'site', nome: 'Site da Furia Store', url: 'https://furia-store.com/' },
];
if (process.env.ALVO_TESTE) alvos.push({ id: 'teste', nome: 'Alvo de teste', url: process.env.ALVO_TESTE });

const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
async function req(url) {
  try {
    const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
    return r.status < 500 ? { ok: true } : { ok: false, motivo: 'HTTP ' + r.status };
  } catch (e) {
    const t = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    return { ok: false, motivo: t ? 'timeout' : 'erro de conexão' };
  }
}
async function testa(a) {
  let r = await req(a.url);
  if (!r.ok && a.fallback) r = await req(a.fallback);
  return r;
}
async function checa(a) {
  let r = await testa(a);
  if (r.ok) return r;
  console.log(`[${a.nome}] falhou (${r.motivo}), nova tentativa em 20 s`);
  await dorme(20000);
  return testa(a);
}
const fmt = (d, tz) => new Date(d).toLocaleString('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
async function avisa(content) {
  if (!WEBHOOK) { console.log('sem webhook:', content); return; }
  const r = await fetch(WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
  console.log('Discord POST status', r.status);
}

(async () => {
  let estado = {};
  try { estado = JSON.parse(fs.readFileSync(ARQ, 'utf8')); } catch {}
  const antes = JSON.stringify(estado);
  const msgs = [];
  const agora = Date.now();
  const resultados = await Promise.all(alvos.map(async (a) => [a, await checa(a)]));
  for (const [a, r] of resultados) {
    const e = estado[a.id];
    console.log(`[${a.nome}] ${r.ok ? 'no ar' : 'fora: ' + r.motivo}`);
    if (!r.ok) {
      if (!e || !e.fora) {
        estado[a.id] = { fora: true, desde: new Date(agora).toISOString(), ultimoAviso: new Date(agora).toISOString() };
        await avisa(`🔴 **${a.nome} FORA DO AR** desde ${fmt(agora, 'Europe/Lisbon')} Lisboa / ${fmt(agora, 'America/Sao_Paulo')} Brasília — ${r.motivo}`);
        msgs.push(`estado: ${a.nome} fora`);
      } else {
        const desde = new Date(e.desde).getTime();
        const ult = new Date(e.ultimoAviso).getTime();
        if (agora - desde > 15 * 60000 && agora - ult >= 60 * 60000) {
          e.ultimoAviso = new Date(agora).toISOString();
          await avisa(`🔴 **${a.nome} FORA DO AR** desde ${fmt(desde, 'Europe/Lisbon')} Lisboa / ${fmt(desde, 'America/Sao_Paulo')} Brasília — ${r.motivo}`);
          msgs.push(`estado: ${a.nome} fora (repetido)`);
        }
      }
    } else if (e && e.fora) {
      const min = Math.max(1, Math.round((agora - new Date(e.desde).getTime()) / 60000));
      delete estado[a.id];
      await avisa(`🟢 **${a.nome} voltou** — ficou ${min} min fora`);
      msgs.push(`estado: ${a.nome} voltou`);
    }
  }
  // alvo de teste ausente nesta rodada: sai do estado sem aviso
  if (!process.env.ALVO_TESTE && estado.teste) { delete estado.teste; msgs.push('estado: Alvo de teste removido'); }
  if (JSON.stringify(estado) !== antes) {
    fs.writeFileSync(ARQ, JSON.stringify(estado, null, 2) + '\n');
    fs.writeFileSync('.msg-commit', msgs.join('; ') || 'estado: atualizado');
  }
})();
