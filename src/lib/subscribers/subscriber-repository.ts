import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ResourceTone } from "@/lib/admin/resources";
import type { DataResult, MutationResult } from "@/lib/admin/repository/shared";

export type SubscriberPlan = "explorer" | "investor" | "professional" | "office";
export type AccessLevel = "teaser" | "full" | "premium";

export type SubscriberProfile = {
  id: string;
  authUserId: string;
  email: string;
  name: string;
  phone: string;
  organizationName: string;
  planKey: SubscriberPlan;
  planStatus: string;
  trialEndsAt: string;
  planStartedAt: string;
  fullAccessUntil: string;
  whatsappOptIn: boolean;
  emailOptIn: boolean;
  pushOptIn: boolean;
  preferredRegions: string[];
  preferredPropertyTypes: string[];
  maxBudget: number;
  riskAppetite: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  tone: ResourceTone;
};

export type PublicOpportunity = {
  id: string;
  code: string;
  title: string;
  propertyType: string;
  city: string;
  state: string;
  discountPct: number;
  opportunityScore: number;
  auctionDate: string;
  stage: string;
  accessLevel: AccessLevel;
  initialBid: number | null;
  appraisalValue: number | null;
  address: string | null;
  summary: string | null;
  riskScore: number | null;
  sourceName: string;
  tone: ResourceTone;
};

export type PublicOpportunitiesData = {
  opportunities: PublicOpportunity[];
  total: number;
  planKey: SubscriberPlan;
};

export type SubscriberPlanInfo = {
  key: SubscriberPlan;
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  highlight: boolean;
  tone: ResourceTone;
};

export type CreateSubscriberAccountInput = {
  name: string;
  email: string;
  password: string;
  phone?: string;
  planKey?: SubscriberPlan;
  whatsappOptIn?: boolean;
  preferredRegions?: string[];
};

export const subscriberPlans: SubscriberPlanInfo[] = [
  {
    key: "explorer",
    name: "Explorer",
    price: "Gratis",
    period: "",
    description: "Acesso a teasers de oportunidades com dados parciais. Ideal para conhecer a plataforma.",
    features: [
      "Tipo, regiao e faixa de desconto",
      "Score de oportunidade (range)",
      "Data do leilao",
      "Endereco e valores borrados",
      "Limite de 5 oportunidades/mes",
    ],
    highlight: false,
    tone: "muted",
  },
  {
    key: "investor",
    name: "Investor+",
    price: "R$ 197",
    period: "/mes",
    description: "Acesso completo a oportunidades, alertas personalizados e dossie de risco.",
    features: [
      "Tudo do Explorer",
      "Endereco completo e valores reais",
      "Dossie de risco por imovel",
      "Alertas por WhatsApp e email",
      "Score detalhado e ROI projetado",
      "Acesso ilimitado",
    ],
    highlight: true,
    tone: "green",
  },
  {
    key: "professional",
    name: "Professional",
    price: "R$ 497",
    period: "/mes",
    description: "Para assessores e advogados. API de integracao e multi-usuario.",
    features: [
      "Tudo do Investor+",
      "API de acesso programatico",
      "Multi-seat (ate 5 usuarios)",
      "Relatorios exportaveis",
      "Suporte prioritario",
      "Webhooks de notificacao",
    ],
    highlight: false,
    tone: "cyan",
  },
  {
    key: "office",
    name: "Office",
    price: "Sob consulta",
    period: "",
    description: "Para escritorios de investimento e operacoes de grande porte.",
    features: [
      "Tudo do Professional",
      "Usuarios ilimitados",
      "API com rate limit estendido",
      "Onboarding dedicado",
      "Integracao com CRM",
      "SLA garantido",
    ],
    highlight: false,
    tone: "purple",
  },
];

function planTone(plan: string): ResourceTone {
  const map: Record<string, ResourceTone> = {
    explorer: "muted",
    investor: "green",
    professional: "cyan",
    office: "purple",
  };
  return map[plan] || "muted";
}

function accessLevelForPlan(plan: SubscriberPlan): AccessLevel {
  if (plan === "explorer") return "teaser";
  return "full";
}

function normalizeSubscriberPlan(value: string | undefined): SubscriberPlan {
  if (value === "investor" || value === "professional" || value === "office") return value;
  return "explorer";
}

function normalizeSubscriber(row: Record<string, unknown>): SubscriberProfile {
  const planKey = String(row.plan_key || "explorer") as SubscriberPlan;
  return {
    id: String(row.id || ""),
    authUserId: String(row.auth_user_id || ""),
    email: String(row.email || ""),
    name: String(row.name || ""),
    phone: String(row.phone || ""),
    organizationName: String(row.organization_name || ""),
    planKey,
    planStatus: String(row.plan_status || "active"),
    trialEndsAt: String(row.trial_ends_at || ""),
    planStartedAt: String(row.plan_started_at || ""),
    fullAccessUntil: String(row.full_access_until || ""),
    whatsappOptIn: Boolean(row.whatsapp_opt_in),
    emailOptIn: Boolean(row.email_opt_in),
    pushOptIn: Boolean(row.push_opt_in),
    preferredRegions: Array.isArray(row.preferred_regions) ? row.preferred_regions : [],
    preferredPropertyTypes: Array.isArray(row.preferred_property_types) ? row.preferred_property_types : [],
    maxBudget: Number(row.max_budget) || 0,
    riskAppetite: String(row.risk_appetite || "moderado"),
    notes: String(row.notes || ""),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
    tone: planTone(planKey),
  };
}

export function getSubscriberPlanInfo(planKey: string | undefined) {
  const normalizedPlan = normalizeSubscriberPlan(planKey);
  return subscriberPlans.find((plan) => plan.key === normalizedPlan) || subscriberPlans[0];
}

export async function createSubscriberAccountRecord(
  input: CreateSubscriberAccountInput
): Promise<MutationResult<{ id: string; email: string; planKey: SubscriberPlan }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const planKey = normalizeSubscriberPlan(input.planKey);
  const preferredRegions = input.preferredRegions?.map((item) => item.trim()).filter(Boolean) || [];

  if (!name) return { ok: false, error: "Informe seu nome." };
  if (!email || !email.includes("@")) return { ok: false, error: "Informe um email valido." };
  if (password.length < 8) return { ok: false, error: "A senha precisa ter pelo menos 8 caracteres." };

  const { data: existingProfile, error: existingProfileError } = await supabase
    .from("subscriber_profiles")
    .select("id,auth_user_id,email")
    .eq("email", email)
    .maybeSingle();

  if (existingProfileError) return { ok: false, error: existingProfileError.message };
  if (existingProfile?.auth_user_id) {
    return { ok: false, error: "Este email ja esta cadastrado. Use Entrar para acessar." };
  }

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name,
      phone: input.phone || "",
      plan_key: planKey,
      source: "public_signup",
    },
  });

  if (authError || !authData.user?.id) {
    return {
      ok: false,
      error: authError?.message?.includes("already")
        ? "Este email ja existe no Supabase Auth. Use Entrar ou recupere a senha."
        : authError?.message || "Nao foi possivel criar o usuario.",
    };
  }

  const now = new Date();
  const trialEndsAt = new Date(now);
  trialEndsAt.setDate(trialEndsAt.getDate() + 7);

  const { data, error } = await supabase
    .from("subscriber_profiles")
    .upsert(
      {
        auth_user_id: authData.user.id,
        email,
        name,
        phone: input.phone || null,
        organization_name: null,
        plan_key: planKey,
        plan_status: planKey === "explorer" ? "active" : "trial",
        trial_ends_at: planKey === "explorer" ? null : trialEndsAt.toISOString(),
        plan_started_at: now.toISOString(),
        full_access_until: planKey === "explorer" ? null : trialEndsAt.toISOString(),
        whatsapp_opt_in: Boolean(input.whatsappOptIn),
        email_opt_in: true,
        push_opt_in: false,
        preferred_regions: preferredRegions,
        preferred_property_types: [],
        risk_appetite: "moderado",
        notes: "Cadastro publico pelo portal Betel.",
      },
      { onConflict: "email" }
    )
    .select("id,email,plan_key")
    .single();

  if (error || !data?.id) {
    return { ok: false, error: error?.message || "Usuario criado, mas perfil de assinante nao foi salvo." };
  }

  return {
    ok: true,
    data: {
      id: String(data.id),
      email: String(data.email || email),
      planKey: normalizeSubscriberPlan(String(data.plan_key || planKey)),
    },
  };
}

function normalizePublicOpportunity(
  row: Record<string, unknown>,
  level: AccessLevel
): PublicOpportunity {
  const score = Number(row.opportunity_score) || 50;
  const tone: ResourceTone = score >= 75 ? "green" : score >= 50 ? "yellow" : "red";

  return {
    id: String(row.id || ""),
    code: String(row.opportunity_code || ""),
    title: String(row.title || "Oportunidade de leilao"),
    propertyType: String(row.property_type || "Imovel"),
    city: String(row.city || ""),
    state: String(row.state || ""),
    discountPct: Number(row.discount_pct) || 0,
    opportunityScore: score,
    auctionDate: String(row.auction_date || ""),
    stage: String(row.stage || ""),
    accessLevel: level,
    initialBid: level !== "teaser" ? Number(row.initial_bid) || null : null,
    appraisalValue: level !== "teaser" ? Number(row.appraisal_value) || null : null,
    address: level !== "teaser" ? String(row.address || "") : null,
    summary: level !== "teaser" ? String(row.summary || "") : null,
    riskScore: level !== "teaser" ? Number(row.risk_score) || null : null,
    sourceName: String(row.source_name || ""),
    tone,
  };
}

export async function getPublicOpportunities(
  planKey: SubscriberPlan = "explorer"
): Promise<DataResult<PublicOpportunitiesData>> {
  const level = accessLevelForPlan(planKey);

  try {
    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      return {
        data: { opportunities: buildMockOpportunities(level), total: 6, planKey },
        source: "mock",
        reason: "Supabase nao configurado. Exibindo mock.",
      };
    }

    const { data: rows, error, count } = await supabase
      .from("auction_opportunities")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(planKey === "explorer" ? 5 : 50);

    if (error || !rows || rows.length === 0) {
      return {
        data: { opportunities: buildMockOpportunities(level), total: 6, planKey },
        source: "mock",
        reason: error
          ? `Tabela auction_opportunities: ${error.message}. Exibindo mock.`
          : "Tabela sem registros. Exibindo mock de demonstracao.",
      };
    }

    return {
      data: {
        opportunities: rows.map((r) =>
          normalizePublicOpportunity(r as Record<string, unknown>, level)
        ),
        total: count || rows.length,
        planKey,
      },
      source: "supabase",
    };
  } catch {
    return {
      data: { opportunities: buildMockOpportunities(level), total: 6, planKey },
      source: "mock",
      reason: "Supabase indisponivel. Exibindo mock.",
    };
  }
}

export async function checkSubscriberAccess(
  subscriberId: string,
  opportunityId: string
): Promise<DataResult<{ level: AccessLevel }>> {
  try {
    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      return { data: { level: "teaser" }, source: "mock", reason: "Supabase nao configurado." };
    }

    const { data } = await supabase
      .from("subscriber_opportunity_access")
      .select("access_level")
      .eq("subscriber_id", subscriberId)
      .eq("opportunity_id", opportunityId)
      .single();

    if (data) {
      return {
        data: { level: String(data.access_level) as AccessLevel },
        source: "supabase",
      };
    }

    return { data: { level: "teaser" }, source: "supabase" };
  } catch {
    return { data: { level: "teaser" }, source: "mock", reason: "Fallback para teaser." };
  }
}

export async function grantOpportunityAccess(
  subscriberId: string,
  opportunityId: string,
  level: AccessLevel,
  grantedBy: string
): Promise<MutationResult<{ id: string }>> {
  try {
    const supabase = getSupabaseAdminClient();
    if (!supabase) return { ok: false, error: "Supabase nao configurado." };

    const { data, error } = await supabase
      .from("subscriber_opportunity_access")
      .upsert(
        {
          subscriber_id: subscriberId,
          opportunity_id: opportunityId,
          access_level: level,
          granted_by: grantedBy,
          granted_at: new Date().toISOString(),
        },
        { onConflict: "subscriber_id,opportunity_id" }
      )
      .select("id")
      .single();

    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { id: String(data?.id || "") } };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function buildMockOpportunities(level: AccessLevel): PublicOpportunity[] {
  const cities = [
    ["Balneario Camboriu", "SC"],
    ["Sao Paulo", "SP"],
    ["Rio de Janeiro", "RJ"],
    ["Curitiba", "PR"],
    ["Belo Horizonte", "MG"],
    ["Florianopolis", "SC"],
  ];

  return cities.map(([city, state], i) => ({
    id: `mock-${i + 1}`,
    code: `OPP-${2024 + i}`,
    title: `${["Apartamento", "Casa", "Terreno", "Sala comercial", "Cobertura", "Sobrado"][i]} em leilao`,
    propertyType: ["Apartamento", "Casa", "Terreno", "Sala comercial", "Cobertura", "Sobrado"][i],
    city,
    state,
    discountPct: 25 + i * 7,
    opportunityScore: 55 + i * 6,
    auctionDate: `2026-07-${10 + i * 3}`,
    stage: "Aprovado",
    accessLevel: level,
    initialBid: level !== "teaser" ? 280000 + i * 85000 : null,
    appraisalValue: level !== "teaser" ? 420000 + i * 120000 : null,
    address: level !== "teaser" ? `Rua Exemplo ${100 + i}, ${city}` : null,
    summary: level !== "teaser" ? "Oportunidade com desconto significativo e risco controlado." : null,
    riskScore: level !== "teaser" ? 30 + i * 5 : null,
    sourceName: ["Zukerman", "Mega Leiloes", "Caixa", "Vip Leiloes", "Superbid", "Resale"][i],
    tone: (55 + i * 6) >= 75 ? "green" : (55 + i * 6) >= 50 ? "yellow" : "red" as ResourceTone,
  }));
}
