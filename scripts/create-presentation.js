/* eslint-disable @typescript-eslint/no-require-imports */
const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.author = "Betel AI";
pres.title = "Betel Leiloes - Assessoria Inteligente";

// Color palette — dark/gold theme
const C = {
  bg: "0F0E0C",
  panel: "1A1816",
  panelSoft: "242220",
  gold: "D8AD58",
  goldDark: "B8922E",
  green: "51C878",
  red: "EF6B5E",
  cyan: "5BC0EB",
  white: "FFFFFF",
  muted: "A7A29A",
  line: "2E2C28",
  textLight: "D7D1C6",
};

// ============================================================
// SLIDE 1 — CAPA
// ============================================================
const s1 = pres.addSlide();
s1.background = { color: C.bg };

s1.addShape(pres.shapes.RECTANGLE, {
  x: 0, y: 0, w: 10, h: 5.625,
  fill: { color: C.bg },
});

// Gold accent line top
s1.addShape(pres.shapes.RECTANGLE, {
  x: 1.5, y: 1.4, w: 2, h: 0.04,
  fill: { color: C.gold },
});

s1.addText("BETEL", {
  x: 1.5, y: 1.6, w: 7, h: 1,
  fontSize: 54, fontFace: "Georgia", bold: true,
  color: C.gold, margin: 0,
});

s1.addText("LEILOES", {
  x: 1.5, y: 2.3, w: 7, h: 0.8,
  fontSize: 42, fontFace: "Georgia",
  color: C.white, margin: 0, charSpacing: 8,
});

s1.addText("Assessoria Inteligente em Leiloes de Imoveis", {
  x: 1.5, y: 3.2, w: 6, h: 0.5,
  fontSize: 16, fontFace: "Calibri",
  color: C.muted, margin: 0,
});

s1.addText("Reuniao de Alinhamento — Junho 2026", {
  x: 1.5, y: 4.6, w: 5, h: 0.4,
  fontSize: 12, fontFace: "Calibri",
  color: C.muted, margin: 0,
});

// ============================================================
// SLIDE 2 — O PROBLEMA
// ============================================================
const s2 = pres.addSlide();
s2.background = { color: C.bg };

s2.addText("O PROBLEMA", {
  x: 0.8, y: 0.4, w: 8, h: 0.6,
  fontSize: 14, fontFace: "Calibri", bold: true,
  color: C.gold, charSpacing: 4, margin: 0,
});

s2.addText("Investir em leiloes de imoveis e lucrativo, mas complexo.", {
  x: 0.8, y: 1.0, w: 8.4, h: 0.6,
  fontSize: 26, fontFace: "Georgia", bold: true,
  color: C.white, margin: 0,
});

const problems = [
  { num: "01", title: "Informacao dispersa", desc: "Dezenas de sites de leiloeiros, tribunais e bancos. Impossivel acompanhar tudo manualmente." },
  { num: "02", title: "Risco oculto", desc: "Processos judiciais, dividas, problemas na matricula — dados espalhados em multiplas fontes." },
  { num: "03", title: "Tempo limitado", desc: "Prazos curtos entre publicacao do edital e data do leilao. Quem demora, perde." },
  { num: "04", title: "Falta de analise", desc: "Sem dados de mercado, nao da para calcular se o lance minimo realmente vale a pena." },
];

problems.forEach((p, i) => {
  const y = 1.9 + i * 0.85;
  // Number
  s2.addText(p.num, {
    x: 0.8, y, w: 0.6, h: 0.7,
    fontSize: 28, fontFace: "Georgia", bold: true,
    color: C.gold, margin: 0, valign: "top",
  });
  // Title + desc
  s2.addText([
    { text: p.title, options: { bold: true, fontSize: 16, color: C.white, breakLine: true } },
    { text: p.desc, options: { fontSize: 13, color: C.muted } },
  ], {
    x: 1.5, y, w: 7.5, h: 0.7,
    fontFace: "Calibri", margin: 0, valign: "top",
  });
});

// ============================================================
// SLIDE 3 — A SOLUCAO BETEL
// ============================================================
const s3 = pres.addSlide();
s3.background = { color: C.bg };

s3.addText("A SOLUCAO", {
  x: 0.8, y: 0.4, w: 8, h: 0.6,
  fontSize: 14, fontFace: "Calibri", bold: true,
  color: C.gold, charSpacing: 4, margin: 0,
});

s3.addText("16 agentes de IA trabalhando 24/7 para voce.", {
  x: 0.8, y: 1.0, w: 8.4, h: 0.6,
  fontSize: 26, fontFace: "Georgia", bold: true,
  color: C.white, margin: 0,
});

s3.addText("Cada agente tem uma especialidade. Juntos, eles cobrem todo o ciclo: da busca do imovel ate o pos-leilao.", {
  x: 0.8, y: 1.7, w: 8.4, h: 0.5,
  fontSize: 14, fontFace: "Calibri",
  color: C.muted, margin: 0,
});

// 4 pillars
const pillars = [
  { icon: "BUSCA", title: "Busca Automatica", desc: "Varredura diaria em dezenas de sites de leilao", color: C.cyan },
  { icon: "ANALISE", title: "Analise Profunda", desc: "Risco juridico, avaliacao de mercado e estrategia de lance", color: C.gold },
  { icon: "QUALIDADE", title: "Controle de Qualidade", desc: "Compliance legal e revisao humana antes de publicar", color: C.green },
  { icon: "DISTRIBUICAO", title: "Distribuicao Inteligente", desc: "WhatsApp, email, portal e blog — cada lead recebe o que importa", color: C.red },
];

pillars.forEach((p, i) => {
  const x = 0.8 + i * 2.3;
  const y = 2.6;
  // Card background
  s3.addShape(pres.shapes.RECTANGLE, {
    x, y, w: 2.1, h: 2.5,
    fill: { color: C.panel },
    line: { color: C.line, width: 1 },
  });
  // Accent top bar
  s3.addShape(pres.shapes.RECTANGLE, {
    x, y, w: 2.1, h: 0.05,
    fill: { color: p.color },
  });
  // Icon text
  s3.addText(p.icon, {
    x: x + 0.2, y: y + 0.25, w: 1.7, h: 0.35,
    fontSize: 11, fontFace: "Calibri", bold: true,
    color: p.color, margin: 0, charSpacing: 3,
  });
  // Title
  s3.addText(p.title, {
    x: x + 0.2, y: y + 0.7, w: 1.7, h: 0.5,
    fontSize: 15, fontFace: "Georgia", bold: true,
    color: C.white, margin: 0,
  });
  // Description
  s3.addText(p.desc, {
    x: x + 0.2, y: y + 1.3, w: 1.7, h: 1,
    fontSize: 12, fontFace: "Calibri",
    color: C.muted, margin: 0,
  });
});

// ============================================================
// SLIDE 4 — PIPELINE: BUSCA E ANALISE
// ============================================================
const s4 = pres.addSlide();
s4.background = { color: C.bg };

s4.addText("PIPELINE DOS AGENTES", {
  x: 0.8, y: 0.4, w: 8, h: 0.6,
  fontSize: 14, fontFace: "Calibri", bold: true,
  color: C.gold, charSpacing: 4, margin: 0,
});

s4.addText("Fase 1 — Busca e Analise", {
  x: 0.8, y: 0.9, w: 8.4, h: 0.5,
  fontSize: 22, fontFace: "Georgia", bold: true,
  color: C.white, margin: 0,
});

const phase1Agents = [
  { name: "Renata", role: "Buscadora", desc: "Varre dezenas de sites de leilao e extrai todos os imoveis disponiveis automaticamente.", color: C.cyan, step: "1" },
  { name: "Marcos", role: "Sentinela", desc: "Monitora editais ja encontrados e alerta quando ha mudancas importantes (preco, data, cancelamento).", color: C.cyan, step: "2" },
  { name: "Helena", role: "Curadora", desc: "Analisa cada edital, extrai fatos relevantes e monta um dossie organizado do imovel.", color: C.gold, step: "3" },
  { name: "Igor", role: "Risco Oculto", desc: "Cruza dados de processos, CNPJ, matricula e historico para classificar o nivel de risco.", color: C.red, step: "4" },
  { name: "Rafael", role: "Estrategista", desc: "Calcula o teto de lance ideal, ROI estimado e compara com precos de mercado.", color: C.green, step: "5" },
];

phase1Agents.forEach((a, i) => {
  const y = 1.65 + i * 0.73;

  // Step number circle
  s4.addShape(pres.shapes.OVAL, {
    x: 0.8, y: y + 0.05, w: 0.5, h: 0.5,
    fill: { color: a.color, transparency: 85 },
    line: { color: a.color, width: 1.5 },
  });
  s4.addText(a.step, {
    x: 0.8, y: y + 0.05, w: 0.5, h: 0.5,
    fontSize: 16, fontFace: "Georgia", bold: true,
    color: a.color, align: "center", valign: "middle", margin: 0,
  });

  // Connector line (except last)
  if (i < phase1Agents.length - 1) {
    s4.addShape(pres.shapes.RECTANGLE, {
      x: 1.03, y: y + 0.55, w: 0.04, h: 0.23,
      fill: { color: C.line },
    });
  }

  // Agent info
  s4.addText([
    { text: a.name, options: { bold: true, fontSize: 16, color: C.white } },
    { text: `  —  ${a.role}`, options: { fontSize: 14, color: a.color } },
  ], {
    x: 1.5, y, w: 4, h: 0.35,
    fontFace: "Calibri", margin: 0,
  });
  s4.addText(a.desc, {
    x: 1.5, y: y + 0.3, w: 7.5, h: 0.4,
    fontSize: 12, fontFace: "Calibri",
    color: C.muted, margin: 0,
  });
});

// ============================================================
// SLIDE 5 — PIPELINE: QUALIDADE E PUBLICACAO
// ============================================================
const s5 = pres.addSlide();
s5.background = { color: C.bg };

s5.addText("PIPELINE DOS AGENTES", {
  x: 0.8, y: 0.4, w: 8, h: 0.6,
  fontSize: 14, fontFace: "Calibri", bold: true,
  color: C.gold, charSpacing: 4, margin: 0,
});

s5.addText("Fase 2 — Qualidade e Publicacao", {
  x: 0.8, y: 0.9, w: 8.4, h: 0.5,
  fontSize: 22, fontFace: "Georgia", bold: true,
  color: C.white, margin: 0,
});

const phase2Agents = [
  { name: "Dr. Otavio", role: "Compliance", desc: "Valida a linguagem, bloqueia promessas indevidas e garante conformidade legal em tudo que e publicado.", color: C.gold, step: "6" },
  { name: "Patricia", role: "Revisao Humana", desc: "Organiza o dossie final e envia para aprovacao do admin antes da publicacao.", color: C.gold, step: "7" },
  { name: "Danilo", role: "Publicador", desc: "Formata a oportunidade e publica no portal para que investidores possam visualizar.", color: C.green, step: "8" },
  { name: "Fernanda", role: "Pos-Leilao", desc: "Gera checklist de providencias para o investidor que arrematou o imovel.", color: C.green, step: "9" },
];

phase2Agents.forEach((a, i) => {
  const y = 1.65 + i * 0.85;
  s5.addShape(pres.shapes.OVAL, {
    x: 0.8, y: y + 0.05, w: 0.5, h: 0.5,
    fill: { color: a.color, transparency: 85 },
    line: { color: a.color, width: 1.5 },
  });
  s5.addText(a.step, {
    x: 0.8, y: y + 0.05, w: 0.5, h: 0.5,
    fontSize: 16, fontFace: "Georgia", bold: true,
    color: a.color, align: "center", valign: "middle", margin: 0,
  });
  if (i < phase2Agents.length - 1) {
    s5.addShape(pres.shapes.RECTANGLE, {
      x: 1.03, y: y + 0.55, w: 0.04, h: 0.35,
      fill: { color: C.line },
    });
  }
  s5.addText([
    { text: a.name, options: { bold: true, fontSize: 16, color: C.white } },
    { text: `  —  ${a.role}`, options: { fontSize: 14, color: a.color } },
  ], {
    x: 1.5, y, w: 4, h: 0.35,
    fontFace: "Calibri", margin: 0,
  });
  s5.addText(a.desc, {
    x: 1.5, y: y + 0.3, w: 7.5, h: 0.5,
    fontSize: 12, fontFace: "Calibri",
    color: C.muted, margin: 0,
  });
});

// ============================================================
// SLIDE 6 — PIPELINE: COMUNICACAO
// ============================================================
const s6 = pres.addSlide();
s6.background = { color: C.bg };

s6.addText("PIPELINE DOS AGENTES", {
  x: 0.8, y: 0.4, w: 8, h: 0.6,
  fontSize: 14, fontFace: "Calibri", bold: true,
  color: C.gold, charSpacing: 4, margin: 0,
});

s6.addText("Fase 3 — Comunicacao e Conteudo", {
  x: 0.8, y: 0.9, w: 8.4, h: 0.5,
  fontSize: 22, fontFace: "Georgia", bold: true,
  color: C.white, margin: 0,
});

const phase3Agents = [
  { name: "Camila", role: "Leads Premium", desc: "Envia notificacao completa com dossie, risco e estrategia para assinantes.", color: C.gold, step: "A" },
  { name: "Tiago", role: "Leads Frios", desc: "Envia teaser parcial com CTA para se tornar assinante.", color: C.cyan, step: "B" },
  { name: "Lucas", role: "Multicanal", desc: "Decide o melhor canal (WhatsApp, email, push) e formato para cada perfil.", color: C.green, step: "C" },
  { name: "Beatriz", role: "Comunidade", desc: "Cria conteudo educacional seguro sobre leiloes para redes sociais.", color: C.red, step: "D" },
  { name: "Julia", role: "Blog", desc: "Transforma relatorios e analises em artigos para o blog da plataforma.", color: C.gold, step: "E" },
  { name: "Andre", role: "Noticias", desc: "Cria noticias curtas e formatadas sobre o mercado de leiloes.", color: C.cyan, step: "F" },
];

phase3Agents.forEach((a, i) => {
  const y = 1.55 + i * 0.63;
  s6.addShape(pres.shapes.OVAL, {
    x: 0.8, y: y + 0.03, w: 0.45, h: 0.45,
    fill: { color: a.color, transparency: 85 },
    line: { color: a.color, width: 1.5 },
  });
  s6.addText(a.step, {
    x: 0.8, y: y + 0.03, w: 0.45, h: 0.45,
    fontSize: 14, fontFace: "Georgia", bold: true,
    color: a.color, align: "center", valign: "middle", margin: 0,
  });
  s6.addText([
    { text: a.name, options: { bold: true, fontSize: 15, color: C.white } },
    { text: `  —  ${a.role}`, options: { fontSize: 13, color: a.color } },
  ], {
    x: 1.45, y, w: 3.5, h: 0.3,
    fontFace: "Calibri", margin: 0,
  });
  s6.addText(a.desc, {
    x: 1.45, y: y + 0.27, w: 7.7, h: 0.35,
    fontSize: 11.5, fontFace: "Calibri",
    color: C.muted, margin: 0,
  });
});

// Vinícius — separate callout
s6.addShape(pres.shapes.RECTANGLE, {
  x: 0.8, y: 5.0, w: 8.4, h: 0.45,
  fill: { color: C.panel },
  line: { color: C.line, width: 1 },
});
s6.addText([
  { text: "Vinicius — Alertas Admin", options: { bold: true, fontSize: 13, color: C.red } },
  { text: "  |  Monitora todo o pipeline e alerta o admin sobre erros, falhas e anomalias.", options: { fontSize: 12, color: C.muted } },
], {
  x: 1.0, y: 5.0, w: 8, h: 0.45,
  fontFace: "Calibri", margin: 0, valign: "middle",
});

// ============================================================
// SLIDE 7 — FLUXO VISUAL COMPLETO
// ============================================================
const s7 = pres.addSlide();
s7.background = { color: C.bg };

s7.addText("FLUXO COMPLETO", {
  x: 0.8, y: 0.4, w: 8, h: 0.6,
  fontSize: 14, fontFace: "Calibri", bold: true,
  color: C.gold, charSpacing: 4, margin: 0,
});

s7.addText("Da busca ate o investidor — tudo automatizado.", {
  x: 0.8, y: 0.9, w: 8.4, h: 0.5,
  fontSize: 22, fontFace: "Georgia", bold: true,
  color: C.white, margin: 0,
});

const flowSteps = [
  { label: "BUSCA", sub: "Renata + Marcos", color: C.cyan },
  { label: "ANALISE", sub: "Helena + Igor", color: C.gold },
  { label: "ESTRATEGIA", sub: "Rafael", color: C.green },
  { label: "COMPLIANCE", sub: "Dr. Otavio", color: C.gold },
  { label: "REVISAO", sub: "Patricia", color: C.muted },
  { label: "PUBLICACAO", sub: "Danilo", color: C.green },
  { label: "NOTIFICACAO", sub: "Camila + Tiago + Lucas", color: C.cyan },
];

flowSteps.forEach((step, i) => {
  const x = 0.4 + i * 1.33;
  const y = 2.0;
  // Box
  s7.addShape(pres.shapes.RECTANGLE, {
    x, y, w: 1.15, h: 1.6,
    fill: { color: C.panel },
    line: { color: step.color, width: 1.5 },
  });
  // Step label
  s7.addText(step.label, {
    x, y: y + 0.2, w: 1.15, h: 0.5,
    fontSize: 10, fontFace: "Calibri", bold: true,
    color: step.color, align: "center", margin: 0, charSpacing: 1,
  });
  // Step sub
  s7.addText(step.sub, {
    x, y: y + 0.75, w: 1.15, h: 0.7,
    fontSize: 9.5, fontFace: "Calibri",
    color: C.muted, align: "center", margin: 0,
  });
  // Arrow (except last)
  if (i < flowSteps.length - 1) {
    s7.addText(">", {
      x: x + 1.15, y: y + 0.5, w: 0.18, h: 0.4,
      fontSize: 18, fontFace: "Calibri", bold: true,
      color: C.gold, align: "center", valign: "middle", margin: 0,
    });
  }
});

// Bottom row — support agents
s7.addShape(pres.shapes.RECTANGLE, {
  x: 0.8, y: 4.2, w: 8.4, h: 0.9,
  fill: { color: C.panelSoft },
  line: { color: C.line, width: 1 },
});

s7.addText("Agentes de Suporte Continuo", {
  x: 0.8, y: 4.2, w: 8.4, h: 0.35,
  fontSize: 11, fontFace: "Calibri", bold: true,
  color: C.gold, align: "center", margin: 0, valign: "middle",
});

const supportAgents = [
  "Beatriz — Comunidade",
  "Julia — Blog",
  "Andre — Noticias",
  "Fernanda — Pos-Leilao",
  "Vinicius — Alertas",
];
s7.addText(supportAgents.join("    |    "), {
  x: 0.8, y: 4.55, w: 8.4, h: 0.45,
  fontSize: 11, fontFace: "Calibri",
  color: C.muted, align: "center", margin: 0, valign: "middle",
});

// ============================================================
// SLIDE 8 — MODELO DE ACESSO
// ============================================================
const s8 = pres.addSlide();
s8.background = { color: C.bg };

s8.addText("MODELO DE ACESSO", {
  x: 0.8, y: 0.4, w: 8, h: 0.6,
  fontSize: 14, fontFace: "Calibri", bold: true,
  color: C.gold, charSpacing: 4, margin: 0,
});

s8.addText("Todos veem. Assinantes acessam.", {
  x: 0.8, y: 0.9, w: 8.4, h: 0.5,
  fontSize: 26, fontFace: "Georgia", bold: true,
  color: C.white, margin: 0,
});

// LEFT — Visitante / Lead Frio
s8.addShape(pres.shapes.RECTANGLE, {
  x: 0.8, y: 1.8, w: 4, h: 3.2,
  fill: { color: C.panel },
  line: { color: C.line, width: 1 },
});
s8.addShape(pres.shapes.RECTANGLE, {
  x: 0.8, y: 1.8, w: 4, h: 0.05,
  fill: { color: C.muted },
});

s8.addText("VISITANTE / LEAD FRIO", {
  x: 1.1, y: 2.05, w: 3.4, h: 0.35,
  fontSize: 12, fontFace: "Calibri", bold: true,
  color: C.muted, charSpacing: 2, margin: 0,
});

s8.addText("Cadastro gratuito na plataforma", {
  x: 1.1, y: 2.4, w: 3.4, h: 0.3,
  fontSize: 13, fontFace: "Calibri",
  color: C.white, margin: 0,
});

const freeFeatures = [
  "Ve o catalogo completo de imoveis",
  "Ve fotos, endereco e data do leilao",
  "Recebe teasers por WhatsApp/email",
  "Ao clicar \"Ver mais\"...",
];
freeFeatures.forEach((f, i) => {
  s8.addText(f, {
    x: 1.1, y: 2.85 + i * 0.35, w: 3.4, h: 0.3,
    fontSize: 12, fontFace: "Calibri",
    color: i < 3 ? C.textLight : C.gold, margin: 0,
    bullet: i < 3,
    bold: i === 3,
  });
});

// Popup mockup
s8.addShape(pres.shapes.RECTANGLE, {
  x: 1.3, y: 4.1, w: 3.2, h: 0.7,
  fill: { color: C.goldDark, transparency: 80 },
  line: { color: C.gold, width: 1 },
});
s8.addText("Torne-se assinante para ver o dossie completo!", {
  x: 1.3, y: 4.1, w: 3.2, h: 0.7,
  fontSize: 11, fontFace: "Calibri", bold: true,
  color: C.gold, align: "center", valign: "middle", margin: 0,
});

// RIGHT — Assinante Premium
s8.addShape(pres.shapes.RECTANGLE, {
  x: 5.2, y: 1.8, w: 4, h: 3.2,
  fill: { color: C.panel },
  line: { color: C.gold, width: 1.5 },
});
s8.addShape(pres.shapes.RECTANGLE, {
  x: 5.2, y: 1.8, w: 4, h: 0.05,
  fill: { color: C.gold },
});

s8.addText("ASSINANTE PREMIUM", {
  x: 5.5, y: 2.05, w: 3.4, h: 0.35,
  fontSize: 12, fontFace: "Calibri", bold: true,
  color: C.gold, charSpacing: 2, margin: 0,
});

s8.addText("Acesso completo a plataforma", {
  x: 5.5, y: 2.4, w: 3.4, h: 0.3,
  fontSize: 13, fontFace: "Calibri",
  color: C.white, margin: 0,
});

const premiumFeatures = [
  "Dossie completo do imovel",
  "Analise de risco detalhada",
  "Estrategia de lance e ROI",
  "Alertas em tempo real",
  "Checklist pos-arremate",
  "Suporte prioritario",
];
premiumFeatures.forEach((f, i) => {
  s8.addText(f, {
    x: 5.5, y: 2.85 + i * 0.32, w: 3.4, h: 0.28,
    fontSize: 12, fontFace: "Calibri",
    color: C.green, margin: 0, bullet: true,
  });
});

// ============================================================
// SLIDE 9 — FONTES DE DADOS
// ============================================================
const s9 = pres.addSlide();
s9.background = { color: C.bg };

s9.addText("FONTES DE DADOS", {
  x: 0.8, y: 0.4, w: 8, h: 0.6,
  fontSize: 14, fontFace: "Calibri", bold: true,
  color: C.gold, charSpacing: 4, margin: 0,
});

s9.addText("De onde vem a inteligencia dos nossos agentes.", {
  x: 0.8, y: 0.9, w: 8.4, h: 0.5,
  fontSize: 22, fontFace: "Georgia", bold: true,
  color: C.white, margin: 0,
});

// Group 1 — Infraestrutura (configured)
const groups = [
  {
    title: "Infraestrutura Base",
    status: "CONFIGURADO",
    statusColor: C.green,
    items: ["Supabase — Banco de dados", "Cloudflare R2 — Armazenamento", "Google Gemini — Inteligencia Artificial"],
    y: 1.6,
  },
  {
    title: "Operacao",
    status: "EM CONFIGURACAO",
    statusColor: C.gold,
    items: ["Inngest — Automacao de tarefas", "ConnectyHub — WhatsApp automatizado", "Resend — Email transacional"],
    y: 2.85,
  },
  {
    title: "Dados de Mercado",
    status: "PENDENTE",
    statusColor: C.red,
    items: ["DataZAP+ (OLX) — Avaliacao de imoveis e preco/m2", "FipeZAP — Indice de precos por cidade", "IBGE — Dados demograficos (gratuito)"],
    y: 4.1,
  },
];

groups.forEach((g) => {
  // Group card
  s9.addShape(pres.shapes.RECTANGLE, {
    x: 0.8, y: g.y, w: 4, h: 1.05,
    fill: { color: C.panel },
    line: { color: C.line, width: 1 },
  });
  // Title + status
  s9.addText(g.title, {
    x: 1.0, y: g.y + 0.08, w: 2.5, h: 0.25,
    fontSize: 12, fontFace: "Calibri", bold: true,
    color: C.white, margin: 0,
  });
  s9.addText(g.status, {
    x: 3.3, y: g.y + 0.08, w: 1.3, h: 0.25,
    fontSize: 9, fontFace: "Calibri", bold: true,
    color: g.statusColor, align: "right", margin: 0,
  });
  // Items
  g.items.forEach((item, i) => {
    s9.addText(item, {
      x: 1.0, y: g.y + 0.38 + i * 0.22,
      w: 3.5, h: 0.2,
      fontSize: 10.5, fontFace: "Calibri",
      color: C.muted, margin: 0,
      bullet: true,
    });
  });
});

// Group 4 — Juridica (right side)
s9.addShape(pres.shapes.RECTANGLE, {
  x: 5.2, y: 1.6, w: 4, h: 3.55,
  fill: { color: C.panel },
  line: { color: C.line, width: 1 },
});
s9.addText("Verificacao Juridica", {
  x: 5.4, y: 1.68, w: 2.5, h: 0.25,
  fontSize: 12, fontFace: "Calibri", bold: true,
  color: C.white, margin: 0,
});
s9.addText("PENDENTE", {
  x: 7.7, y: 1.68, w: 1.3, h: 0.25,
  fontSize: 9, fontFace: "Calibri", bold: true,
  color: C.red, align: "right", margin: 0,
});

const juridicas = [
  { name: "CNJ DataJud", desc: "Processos judiciais", cost: "Gratuito" },
  { name: "ReceitaWS", desc: "CNPJ de leiloeiros", cost: "Gratuito (3/min)" },
  { name: "BigData Corp", desc: "Enriquecimento de dados", cost: "Contrato" },
  { name: "ONR Registradores", desc: "Matricula do imovel", cost: "Por consulta" },
  { name: "InfoSimples", desc: "Dados legais agregados", cost: "Creditos" },
  { name: "SerPro", desc: "Dados governamentais", cost: "Contrato gov" },
];

juridicas.forEach((j, i) => {
  const y = 2.1 + i * 0.48;
  s9.addText(j.name, {
    x: 5.4, y, w: 2, h: 0.22,
    fontSize: 11, fontFace: "Calibri", bold: true,
    color: C.textLight, margin: 0,
  });
  s9.addText(j.cost, {
    x: 7.7, y, w: 1.3, h: 0.22,
    fontSize: 9.5, fontFace: "Calibri",
    color: C.gold, align: "right", margin: 0,
  });
  s9.addText(j.desc, {
    x: 5.4, y: y + 0.2, w: 3.5, h: 0.2,
    fontSize: 10, fontFace: "Calibri",
    color: C.muted, margin: 0,
  });
});

// ============================================================
// SLIDE 10 — PROXIMOS PASSOS
// ============================================================
const s10 = pres.addSlide();
s10.background = { color: C.bg };

s10.addText("PROXIMOS PASSOS", {
  x: 0.8, y: 0.4, w: 8, h: 0.6,
  fontSize: 14, fontFace: "Calibri", bold: true,
  color: C.gold, charSpacing: 4, margin: 0,
});

s10.addText("O que falta para operar.", {
  x: 0.8, y: 0.9, w: 8.4, h: 0.5,
  fontSize: 26, fontFace: "Georgia", bold: true,
  color: C.white, margin: 0,
});

const steps = [
  { phase: "FASE 1", title: "Contratar APIs de dados", desc: "DataZAP+, CNJ DataJud, ReceitaWS — para que Igor e Helena tenham dados reais para analisar risco e valor de mercado.", status: "Prioridade alta", statusColor: C.red },
  { phase: "FASE 2", title: "Configurar canais de comunicacao", desc: "ConnectyHub (WhatsApp) e Resend (email) — para que Lucas, Camila e Tiago consigam enviar mensagens aos leads.", status: "Prioridade alta", statusColor: C.red },
  { phase: "FASE 3", title: "Testar fluxo completo", desc: "Executar uma coleta real, processar pelo pipeline, publicar e notificar — validar cada etapa do workflow.", status: "Em breve", statusColor: C.gold },
  { phase: "FASE 4", title: "Lancar versao beta", desc: "Convidar grupo seleto de investidores para testar a plataforma e coletar feedback antes do lancamento publico.", status: "Planejado", statusColor: C.cyan },
];

steps.forEach((s, i) => {
  const y = 1.7 + i * 0.92;
  // Card
  s10.addShape(pres.shapes.RECTANGLE, {
    x: 0.8, y, w: 8.4, h: 0.78,
    fill: { color: C.panel },
    line: { color: C.line, width: 1 },
  });
  // Phase badge
  s10.addText(s.phase, {
    x: 1.0, y: y + 0.12, w: 0.8, h: 0.25,
    fontSize: 9, fontFace: "Calibri", bold: true,
    color: C.bg, align: "center", valign: "middle", margin: 0,
    fill: { color: s.statusColor },
  });
  // Title
  s10.addText(s.title, {
    x: 2.0, y: y + 0.08, w: 5, h: 0.3,
    fontSize: 14, fontFace: "Calibri", bold: true,
    color: C.white, margin: 0,
  });
  // Status
  s10.addText(s.status, {
    x: 7.5, y: y + 0.08, w: 1.5, h: 0.3,
    fontSize: 10, fontFace: "Calibri", bold: true,
    color: s.statusColor, align: "right", margin: 0,
  });
  // Description
  s10.addText(s.desc, {
    x: 2.0, y: y + 0.38, w: 7, h: 0.35,
    fontSize: 11, fontFace: "Calibri",
    color: C.muted, margin: 0,
  });
});

// ============================================================
// SLIDE 11 — ENCERRAMENTO
// ============================================================
const s11 = pres.addSlide();
s11.background = { color: C.bg };

s11.addShape(pres.shapes.RECTANGLE, {
  x: 1.5, y: 1.8, w: 2, h: 0.04,
  fill: { color: C.gold },
});

s11.addText("BETEL LEILOES", {
  x: 1.5, y: 2.0, w: 7, h: 0.8,
  fontSize: 36, fontFace: "Georgia", bold: true,
  color: C.gold, margin: 0,
});

s11.addText("Inteligencia artificial a servico do investidor.", {
  x: 1.5, y: 2.8, w: 7, h: 0.5,
  fontSize: 18, fontFace: "Calibri",
  color: C.textLight, margin: 0,
});

s11.addText("Obrigado.", {
  x: 1.5, y: 3.8, w: 7, h: 0.6,
  fontSize: 28, fontFace: "Georgia",
  color: C.white, margin: 0,
});

s11.addText("Duvidas e proximos passos", {
  x: 1.5, y: 4.5, w: 5, h: 0.4,
  fontSize: 14, fontFace: "Calibri",
  color: C.muted, margin: 0,
});

// ============================================================
// SAVE
// ============================================================
const outputPath = process.argv[2] || "Betel-Leiloes-Apresentacao.pptx";
pres.writeFile({ fileName: outputPath }).then(() => {
  console.log(`Presentation saved: ${outputPath}`);
});
