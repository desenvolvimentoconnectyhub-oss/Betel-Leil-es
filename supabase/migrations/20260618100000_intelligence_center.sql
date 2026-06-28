-- Intelligence reports posted by agents into the shared workspace
create table if not exists public.intelligence_reports (
  id uuid primary key default gen_random_uuid(),
  report_code text not null unique,
  agent_key text,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  opportunity_id uuid references public.auction_opportunities(id) on delete set null,
  report_type text not null default 'analysis'
    check (report_type in ('analysis', 'curation', 'risk', 'compliance', 'market', 'content', 'alert')),
  title text not null,
  summary text,
  structured_data jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  visibility text not null default 'internal'
    check (visibility in ('internal', 'subscriber', 'public')),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  consumed_by_content boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_intelligence_reports_agent_key on public.intelligence_reports (agent_key);
create index if not exists idx_intelligence_reports_opportunity on public.intelligence_reports (opportunity_id);
create index if not exists idx_intelligence_reports_status on public.intelligence_reports (status);
create index if not exists idx_intelligence_reports_type on public.intelligence_reports (report_type);

create trigger set_intelligence_reports_updated_at
  before update on public.intelligence_reports
  for each row execute function public.set_updated_at();

-- Blog and news content generated from intelligence reports
create table if not exists public.content_posts (
  id uuid primary key default gen_random_uuid(),
  post_code text not null unique,
  content_type text not null default 'blog'
    check (content_type in ('blog', 'news', 'alert', 'update', 'educational')),
  agent_key text,
  title text not null,
  slug text not null unique,
  excerpt text,
  body_html text,
  body_markdown text,
  source_report_ids uuid[] not null default '{}',
  tags text[] not null default '{}',
  status text not null default 'draft'
    check (status in ('draft', 'review', 'published', 'archived')),
  visibility text not null default 'public'
    check (visibility in ('public', 'subscriber', 'internal')),
  reviewed_by text,
  reviewed_at timestamptz,
  published_at timestamptz,
  featured_image_path text,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_content_posts_slug on public.content_posts (slug);
create index if not exists idx_content_posts_status on public.content_posts (status);
create index if not exists idx_content_posts_type on public.content_posts (content_type);

create trigger set_content_posts_updated_at
  before update on public.content_posts
  for each row execute function public.set_updated_at();
