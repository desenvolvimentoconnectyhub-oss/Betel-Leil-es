-- Market review now releases an opportunity to WhatsApp publication instead of legal review.

update public.pipeline_stage_definitions
set
  description = 'Analista valida valores, desconto, score e dados essenciais antes da divulgacao WhatsApp.',
  next_stage_key = 'communication',
  updated_at = now()
where stage_key = 'market_review';

update public.pipeline_stage_definitions
set
  name = 'Divulgacao WhatsApp',
  description = 'Comunicacao escolhe agente, grupo, canal ou lista e acompanha o envio da oportunidade aprovada.',
  updated_at = now()
where stage_key = 'communication';
