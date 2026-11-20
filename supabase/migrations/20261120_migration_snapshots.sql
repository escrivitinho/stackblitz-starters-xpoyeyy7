-- Etapa 1: backup integral online, sem alterar as tabelas operacionais.
create table if not exists public.moneo_migration_snapshots (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 source_origin text not null,
 payload jsonb not null check (jsonb_typeof(payload) = 'object'),
 counts jsonb not null check (jsonb_typeof(counts) = 'object')
);
alter table public.moneo_migration_snapshots enable row level security;
revoke all on public.moneo_migration_snapshots from anon;
grant select, insert on public.moneo_migration_snapshots to authenticated;
drop policy if exists moneo_migration_owner on public.moneo_migration_snapshots;
create policy moneo_migration_owner on public.moneo_migration_snapshots
 for all to authenticated
 using (owner_id = (select auth.uid()) and (select public.is_moneo_owner()))
 with check (owner_id = (select auth.uid()) and (select public.is_moneo_owner()));
create index if not exists moneo_migration_snapshots_owner_idx
 on public.moneo_migration_snapshots(owner_id, created_at desc);
