import {
  riskAppetiteLabel,
  type InvestorOpportunityMatch,
  type InvestorProfile,
} from "./investors";
import {
  formatCurrency,
  type AuctionOpportunity,
  type ResourceTone,
} from "./resources";

export type CommercialMetric = {
  label: string;
  value: string;
  detail: string;
  tone: ResourceTone;
};

export type CommercialChecklistItem = {
  label: string;
  status: string;
  tone: ResourceTone;
  detail: string;
};

export type CommercialPack = {
  id: string;
  investor: InvestorProfile;
  opportunity: AuctionOpportunity;
  match: InvestorOpportunityMatch;
  suitability: {
    label: string;
    tone: ResourceTone;
    detail: string;
  };
  metrics: CommercialMetric[];
  dossierBlocks: Array<{
    title: string;
    body: string;
    tone: ResourceTone;
  }>;
  checklist: CommercialChecklistItem[];
  riskNotes: Array<{
    label: string;
    detail: string;
    tone: ResourceTone;
  }>;
  supervisedMessage: string;
  nextSteps: string[];
  complianceNotes: string[];
};

export function buildCommercialPack(
  investor: InvestorProfile,
  match: InvestorOpportunityMatch
): CommercialPack {
  const opportunity = match.opportunity;
  const budgetGap = investor.maxBudget - opportunity.initialBid;
  const preliminaryCeiling = Math.min(
    investor.maxBudget,
    Math.round(opportunity.initialBid * 1.08)
  );
  const fitTone = match.matchScore >= 85 ? "green" : match.matchScore >= 70 ? "yellow" : "purple";
  const fitLabel = match.matchScore >= 85 ? "Fit forte" : match.matchScore >= 70 ? "Fit supervisionado" : "Fit exploratorio";

  return {
    id: `${investor.id}-${opportunity.id}`,
    investor,
    opportunity,
    match,
    suitability: {
      label: fitLabel,
      tone: fitTone,
      detail:
        match.matchScore >= 85
          ? "Pode seguir para dossie comercial com revisao humana antes de contato."
          : "Exige validacao comercial e juridica antes de qualquer abordagem conclusiva.",
    },
    metrics: [
      {
        label: "Match",
        value: `${match.matchScore}`,
        detail: "score do perfil",
        tone: fitTone,
      },
      {
        label: "Teto investidor",
        value: formatCurrency(investor.maxBudget),
        detail: budgetGap >= 0 ? `${formatCurrency(budgetGap)} acima do lance` : "abaixo do lance inicial",
        tone: budgetGap >= 0 ? "green" : "red",
      },
      {
        label: "Triagem de teto",
        value: formatCurrency(preliminaryCeiling),
        detail: "referencia interna, nao enviada ao cliente",
        tone: "cyan",
      },
      {
        label: "Desconto",
        value: `${opportunity.discountPct}%`,
        detail: `ROI alvo ${investor.targetRoiPct}%`,
        tone: opportunity.discountPct >= investor.targetRoiPct ? "green" : "yellow",
      },
    ],
    dossierBlocks: [
      {
        title: "Resumo seguro",
        body: `${opportunity.title} em ${opportunity.city}/${opportunity.state}, com lance inicial de ${formatCurrency(
          opportunity.initialBid
        )} e desconto estimado de ${opportunity.discountPct}%. A oportunidade ainda depende de revisao documental, parecer humano e confirmacao de custos antes de qualquer recomendacao.`,
        tone: "cyan",
      },
      {
        title: "Por que combina",
        body: match.reasons.join(". ") + ".",
        tone: fitTone,
      },
      {
        title: "Tese do investidor",
        body: `${investor.name} busca ${investor.preferredPropertyTypes.join(
          ", "
        ) || "imoveis elegiveis"} em ${investor.cityFocus.join(", ") || "pracas abertas"}, com apetite ${riskAppetiteLabel(
          investor.riskAppetite
        ).toLowerCase()} e ROI alvo de ${investor.targetRoiPct}%.`,
        tone: "purple",
      },
    ],
    checklist: buildChecklist(opportunity, investor),
    riskNotes: opportunity.riskFlags.map((risk) => ({
      label: risk.label,
      detail: risk.detail,
      tone: risk.severity,
    })),
    supervisedMessage: buildSupervisedMessage(investor, match),
    nextSteps: [
      "Revisar dossie executivo e documentos obrigatorios",
      "Confirmar parecer juridico e ressalvas antes do contato",
      "Validar contrato ou autorizacao de assessoria antes de orientar lance",
      "Registrar aceite interno antes de WhatsApp ou email externo",
    ],
    complianceNotes: [
      "Nao prometer lucro, arrematacao ou risco zero.",
      "Separar fatos verificaveis de hipoteses comerciais.",
      "Enviar apenas apos revisao humana quando houver risco juridico, ocupacao ou divergencia.",
      "Manter trilha de auditoria para mensagem, dossie e autorizacao.",
    ],
  };
}

function buildChecklist(
  opportunity: AuctionOpportunity,
  investor: InvestorProfile
): CommercialChecklistItem[] {
  const hasOfficialNotice = opportunity.documents.some(
    (document) =>
      document.label.toLowerCase().includes("edital") &&
      !document.status.toLowerCase().includes("pendente")
  );
  const legalApproved = opportunity.legalStatus.toLowerCase().includes("aprov");
  const riskyForConservative = investor.riskAppetite === "conservador" && opportunity.riskScore > 45;
  const dossierReady =
    opportunity.stage.toLowerCase().includes("dossie") ||
    opportunity.documents.some((document) => document.label.toLowerCase().includes("dossie"));

  return [
    {
      label: "Dossie executivo",
      status: dossierReady ? "Pronto para revisao" : "Preparar",
      tone: dossierReady ? "green" : "yellow",
      detail: "Consolidar resumo, financeiro, documentos e ressalvas.",
    },
    {
      label: "Parecer juridico",
      status: legalApproved ? "Aprovado" : opportunity.legalStatus,
      tone: legalApproved ? "green" : "yellow",
      detail: "Obrigatorio antes de abordagem conclusiva.",
    },
    {
      label: "Fonte oficial",
      status: hasOfficialNotice ? "Anexada" : "Pendente",
      tone: hasOfficialNotice ? "green" : "red",
      detail: "O edital ou fonte oficial precisa estar rastreavel.",
    },
    {
      label: "Apetite de risco",
      status: riskyForConservative ? "Incompativel" : "Dentro do perfil",
      tone: riskyForConservative ? "red" : "green",
      detail: "Cruza o score de risco com a tese cadastrada.",
    },
    {
      label: "Contrato/autorizacao",
      status: "Pendente",
      tone: "yellow",
      detail: "Necessario antes de orientar lance ou sala de arremate.",
    },
  ];
}

function buildSupervisedMessage(investor: InvestorProfile, match: InvestorOpportunityMatch) {
  const opportunity = match.opportunity;

  return [
    `Ola, ${investor.name}. Separamos uma pre-analise de ${opportunity.title} em ${opportunity.city}/${opportunity.state}.`,
    `O lance inicial esta em ${formatCurrency(opportunity.initialBid)} e o desconto estimado e de ${opportunity.discountPct}%, ainda sujeito a confirmacao documental e custos da diligencia.`,
    `O motivo do envio: ${match.reasons.slice(0, 3).join("; ")}.`,
    "Antes de qualquer decisao, precisamos revisar o dossie, as ressalvas juridicas e sua autorizacao formal para seguir.",
  ].join("\n\n");
}
