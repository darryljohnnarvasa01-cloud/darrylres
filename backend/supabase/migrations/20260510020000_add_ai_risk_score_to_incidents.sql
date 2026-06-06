alter table public.incidents
    add column if not exists ai_risk_score smallint not null default 0
    check (ai_risk_score between 0 and 100);

create index if not exists incidents_ai_risk_created_idx
    on public.incidents(ai_risk_score, created_at);
