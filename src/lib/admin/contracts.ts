import type { CommercialPack, CommercialChecklistItem } from "./commercial";
import { formatCurrency, type ResourceTone } from "./resources";

export type AdvisoryGateStage = "blocked" | "ready" | "authorized";
export type RequirementScope = "pre_contract" | "signature";

export type AdvisoryContractSnapshot = {
  id: string;
  contractCode: string;
  status: string;
  signerName: string;
  signerEmail: string;
  maxAuthorizedBid: number | null;
  authorizedUntil: string;
  signedAt: string;
  reviewedBy: string;
  reviewedAt: string;
  notes: string;
};

export type ContractGateMetric = {
  label: string;
  value: string;
  detail: string;
  tone: ResourceTone;
};

export type ContractGateRequirement = {
  label: string;
  status: string;
  tone: ResourceTone;
  detail: string;
  required: boolean;
  scope: RequirementScope;
};

export type ContractGateDocument = {
  label: string;
  status: string;
  tone: ResourceTone;
  owner: string;
  detail: string;
};

export type ContractGateAuthorization = {
  contractId: string | null;
  contractCode: string;
  status: string;
  tone: ResourceTone;
  signerName: string;
  signerEmail: string;
  maxAuthorizedBid: number;
  maxAuthorizedBidLabel: string;
  expiresAt: string;
  signedAt: string;
  reviewedAt: string;
  notes: string;
  reviewOwner: string;
  legalNote: string;
};

export type ContractGateAction = {
  label: string;
  status: string;
  tone: ResourceTone;
  detail: string;
};

export type ContractGateAuditItem = {
  label: string;
  detail: string;
  tone: ResourceTone;
};

export type AdvisoryContractGate = {
  id: string;
  investor: CommercialPack["investor"];
  opportunity: CommercialPack["opportunity"];
  match: CommercialPack["match"];
  contract: AdvisoryContractSnapshot | null;
  stage: AdvisoryGateStage;
  statusLabel: string;
  statusTone: ResourceTone;
  summary: string;
  preconditionsReady: boolean;
  canIssueContract: boolean;
  canSignContract: boolean;
  canOperate: boolean;
  metrics: ContractGateMetric[];
  requirements: ContractGateRequirement[];
  documents: ContractGateDocument[];
  authorization: ContractGateAuthorization;
  lockedActions: ContractGateAction[];
  nextUnlocks: string[];
  auditTrail: ContractGateAuditItem[];
};

export function buildAdvisoryContractGate(
  pack: CommercialPack,
  contract: AdvisoryContractSnapshot | null = null
): AdvisoryContractGate {
  const preliminaryCeiling = Math.min(
    pack.investor.maxBudget,
    Math.round(pack.opportunity.initialBid * 1.08)
  );
  const contractStatus = getContractStatus(contract);
  const requirements = buildRequirements(pack, contract);
  const preContractRequirements = requirements.filter((item) => item.scope === "pre_contract");
  const openPreContractRequirements = preContractRequirements.filter((item) => item.tone !== "green");
  const preconditionsReady = openPreContractRequirements.length === 0;
  const signatureRequirement = requirements.find((item) => item.scope === "signature");
  const hasSignedAuthorization = contractStatus.status === "signed";
  const hasIssuedContract = Boolean(contract);
  const isCancelled = contractStatus.status === "cancelled";
  const stage: AdvisoryGateStage = hasSignedAuthorization ? "authorized" : preconditionsReady ? "ready" : "blocked";
  const statusLabel =
    stage === "authorized"
      ? "Autorizado"
      : preconditionsReady
        ? "Pronto para minuta"
        : "Bloqueado por pendencias";
  const statusTone: ResourceTone = stage === "authorized" ? "green" : preconditionsReady ? "cyan" : "red";
  const openReason =
    openPreContractRequirements[0]?.label ||
    signatureRequirement?.label ||
    "Contrato/autorizacao";
  const canIssueContract = preconditionsReady && !hasIssuedContract;
  const canSignContract = preconditionsReady && hasIssuedContract && !hasSignedAuthorization && !isCancelled;
  const canOperate = stage === "authorized";
  const authorizedBid = contract?.maxAuthorizedBid || preliminaryCeiling;

  return {
    id: `gate-${pack.id}`,
    investor: pack.investor,
    opportunity: pack.opportunity,
    match: pack.match,
    contract,
    stage,
    statusLabel,
    statusTone,
    preconditionsReady,
    canIssueContract,
    canSignContract,
    canOperate,
    summary:
      stage === "authorized"
        ? "Autorizacao formal registrada. O fluxo pode seguir para contato supervisionado, estrategia de lance e sala de arremate."
        : preconditionsReady
          ? "As precondicoes internas permitem emitir a minuta de assessoria e autorizacao. Acoes externas seguem travadas ate aceite formal."
          : "O fluxo comercial permanece travado ate resolver as pendencias obrigatorias do dossie, fonte, parecer ou aderencia ao perfil.",
    metrics: [
      {
        label: "Gate",
        value: statusLabel,
        detail:
          stage === "authorized"
            ? "operacao liberada com aceite formal"
            : preconditionsReady
              ? hasIssuedContract
                ? contractStatus.label.toLowerCase()
                : "minuta pode ser preparada"
              : `pendente: ${openReason}`,
        tone: statusTone,
      },
      {
        label: "Precondicoes",
        value: `${preContractRequirements.length - openPreContractRequirements.length}/${preContractRequirements.length}`,
        detail: "itens obrigatorios antes da minuta",
        tone: preconditionsReady ? "green" : "yellow",
      },
      {
        label: "Teto proposto",
        value: formatCurrency(authorizedBid),
        detail: contract?.maxAuthorizedBid ? "limite registrado na autorizacao" : "referencia interna para autorizacao",
        tone: "cyan",
      },
      {
        label: canOperate ? "Acoes liberadas" : "Acoes travadas",
        value: canOperate ? "3" : "3",
        detail: "WhatsApp, lance e sala de arremate",
        tone: canOperate ? "green" : "purple",
      },
    ],
    requirements,
    documents: buildDocuments(pack, preconditionsReady, contract, contractStatus),
    authorization: {
      contractId: contract?.id || null,
      contractCode: contract?.contractCode || "Sem minuta emitida",
      status: contractStatus.label,
      tone: contractStatus.tone,
      signerName: contract?.signerName || pack.investor.name,
      signerEmail: contract?.signerEmail || pack.investor.email,
      maxAuthorizedBid: authorizedBid,
      maxAuthorizedBidLabel: formatCurrency(authorizedBid),
      expiresAt: formatDateLabel(contract?.authorizedUntil) || "Definir antes do leilao",
      signedAt: formatDateLabel(contract?.signedAt) || "Nao assinado",
      reviewedAt: formatDateLabel(contract?.reviewedAt) || "Nao revisado",
      notes: contract?.notes || "Sem observacoes registradas.",
      reviewOwner: contract?.reviewedBy || "Juridico + Operacao",
      legalNote:
        "A autorizacao deve registrar escopo da assessoria, limite de lance, ressalvas juridicas e aceite expresso do investidor.",
    },
    lockedActions: [
      {
        label: "Enviar WhatsApp ativo",
        status: stage === "authorized" ? "Liberado" : "Travado",
        tone: stage === "authorized" ? "green" : "red",
        detail:
          stage === "authorized"
            ? "Contato supervisionado liberado com contrato e autorizacao registrados."
            : stage === "ready"
            ? "Pode preparar a minuta, mas contato conclusivo exige aceite formal."
            : `Resolver ${openReason.toLowerCase()} antes de qualquer abordagem externa.`,
      },
      {
        label: "Orientar lance",
        status: stage === "authorized" ? "Liberado" : "Travado",
        tone: stage === "authorized" ? "green" : "red",
        detail:
          stage === "authorized"
            ? "Limite autorizado pode alimentar a estrategia de lance supervisionada."
            : "Nenhum teto ou estrategia de lance deve ser orientado sem autorizacao assinada.",
      },
      {
        label: "Abrir sala de arremate",
        status: stage === "authorized" ? "Liberado" : "Travado",
        tone: stage === "authorized" ? "green" : "red",
        detail:
          stage === "authorized"
            ? "Sala de arremate pode ser criada com trilha de contrato e responsavel registrado."
            : "Sala operacional so abre com contrato, limite autorizado e responsavel juridico registrado.",
      },
    ],
    nextUnlocks: [
      "Gerar minuta de contrato de assessoria vinculada ao investidor e oportunidade.",
      "Registrar aceite/assinatura e limite maximo autorizado para o leilao.",
      "Liberar rascunho supervisionado de WhatsApp com trilha de auditoria.",
      "Criar estrategia de lance e sala de arremate apenas depois da autorizacao.",
    ],
    auditTrail: [
      {
        label: "Pacote comercial consolidado",
        detail: `${pack.investor.name} cruzado com ${pack.opportunity.id} usando score ${pack.match.matchScore}.`,
        tone: "cyan",
      },
      {
        label: "Precondicoes avaliadas",
        detail: preconditionsReady
          ? "Dossie, parecer, fonte e aderencia ao perfil passaram no gate interno."
          : `${openPreContractRequirements.length} precondicao pendente antes da minuta.`,
        tone: preconditionsReady ? "green" : "yellow",
      },
      {
        label: canOperate ? "Acoes externas liberadas" : "Acoes externas bloqueadas",
        detail: canOperate
          ? `Contrato ${contract?.contractCode || ""} autoriza continuidade operacional.`
          : "Contato conclusivo, lance e sala de arremate aguardam autorizacao formal.",
        tone: canOperate ? "green" : "purple",
      },
    ],
  };
}

function buildRequirements(
  pack: CommercialPack,
  contract: AdvisoryContractSnapshot | null
): ContractGateRequirement[] {
  const dossier = findChecklistItem(pack, "dossie");
  const legal = findChecklistItem(pack, "parecer");
  const source = findChecklistItem(pack, "fonte");
  const risk = findChecklistItem(pack, "apetite");
  const contractChecklist = findChecklistItem(pack, "contrato");
  const contractStatus = getContractStatus(contract);

  return [
    mapChecklistRequirement(dossier, {
      label: "Dossie executivo",
      status: "Preparar",
      tone: "yellow",
      detail: "Resumo, financeiro, documentos e ressalvas precisam estar consolidados.",
      scope: "pre_contract",
    }),
    mapChecklistRequirement(legal, {
      label: "Parecer juridico",
      status: pack.opportunity.legalStatus,
      tone: pack.opportunity.legalStatus.toLowerCase().includes("aprov") ? "green" : "yellow",
      detail: "Obrigatorio antes de contato conclusivo e autorizacao.",
      scope: "pre_contract",
    }),
    mapChecklistRequirement(source, {
      label: "Fonte oficial",
      status: "Pendente",
      tone: "red",
      detail: "Edital ou fonte oficial precisa estar rastreavel.",
      scope: "pre_contract",
    }),
    mapChecklistRequirement(risk, {
      label: "Aderencia ao perfil",
      status: pack.opportunity.riskScore >= 70 ? "Revisar risco" : "Dentro do perfil",
      tone: pack.opportunity.riskScore >= 70 ? "red" : "green",
      detail: "Cruza risco da oportunidade com tese e apetite do investidor.",
      scope: "pre_contract",
    }),
    {
      label: "Contrato/autorizacao",
      status: contractStatus.label,
      tone: contractStatus.tone,
      detail:
        contractChecklist?.detail ||
        "Necessario antes de WhatsApp conclusivo, orientacao de lance ou sala de arremate.",
      required: true,
      scope: "signature",
    },
  ];
}

function buildDocuments(
  pack: CommercialPack,
  preconditionsReady: boolean,
  contract: AdvisoryContractSnapshot | null,
  contractStatus: { status: string; label: string; tone: ResourceTone }
): ContractGateDocument[] {
  return [
    {
      label: "Dossie executivo revisado",
      status: findChecklistItem(pack, "dossie")?.status || "Preparar",
      tone: findChecklistItem(pack, "dossie")?.tone || "yellow",
      owner: "Operacao",
      detail: "Documento comercial seguro com fatos, hipoteses e ressalvas separados.",
    },
    {
      label: "Parecer juridico",
      status: findChecklistItem(pack, "parecer")?.status || pack.opportunity.legalStatus,
      tone: findChecklistItem(pack, "parecer")?.tone || "yellow",
      owner: "Juridico",
      detail: "Valida riscos, ocupacao, edital, matricula e restricoes relevantes.",
    },
    {
      label: "Contrato de assessoria",
      status: contract ? contractStatus.label : preconditionsReady ? "Pronto para minuta" : "Aguardando precondicoes",
      tone: contract ? contractStatus.tone : preconditionsReady ? "cyan" : "yellow",
      owner: "Juridico",
      detail: "Formaliza escopo, honorarios, limites e responsabilidade da assessoria.",
    },
    {
      label: "Termo de autorizacao de lance",
      status: contractStatus.status === "signed" ? "Assinado" : contract ? contractStatus.label : "Nao emitido",
      tone: contractStatus.status === "signed" ? "green" : contract ? contractStatus.tone : "yellow",
      owner: "Investidor",
      detail: "Registra teto maximo, validade e aceite expresso para atuacao no leilao.",
    },
  ];
}

function findChecklistItem(pack: CommercialPack, token: string) {
  return pack.checklist.find((item) => item.label.toLowerCase().includes(token));
}

function mapChecklistRequirement(
  item: CommercialChecklistItem | undefined,
  fallback: Omit<ContractGateRequirement, "required">
): ContractGateRequirement {
  return {
    label: item?.label || fallback.label,
    status: item?.status || fallback.status,
    tone: item?.tone || fallback.tone,
    detail: item?.detail || fallback.detail,
    required: true,
    scope: fallback.scope,
  };
}

function getContractStatus(contract: AdvisoryContractSnapshot | null) {
  const status = contract?.status.toLowerCase() || "not_issued";

  if (status === "signed") {
    return { status, label: "Autorizada", tone: "green" as ResourceTone };
  }

  if (status === "pending_signature") {
    return { status, label: "Aguardando assinatura", tone: "yellow" as ResourceTone };
  }

  if (status === "cancelled" || status === "voided") {
    return { status: "cancelled", label: "Cancelada", tone: "red" as ResourceTone };
  }

  if (status === "draft") {
    return { status, label: "Minuta criada", tone: "cyan" as ResourceTone };
  }

  return { status, label: "Nao emitida", tone: "yellow" as ResourceTone };
}

function formatDateLabel(value: string | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
