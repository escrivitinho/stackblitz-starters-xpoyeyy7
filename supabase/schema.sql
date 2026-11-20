-- MONEO Finance | Esquema inicial seguro | executar no SQL Editor do Supabase
-- NÃO apaga nem altera dados locais. Execute uma única vez em projeto novo.
create extension if not exists pgcrypto;

-- Somente o proprietário explicitamente autorizado poderá ler ou escrever dados.
create table if not exists public.moneo_owner (
 user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.moneo_owner enable row level security;
revoke all on public.moneo_owner from anon, authenticated;

create or replace function public.is_moneo_owner()
returns boolean language sql stable security definer
set search_path = '' as $$
 select exists (select 1 from public.moneo_owner where user_id = (select auth.uid()));
$$;
revoke all on function public.is_moneo_owner() from public;
grant execute on function public.is_moneo_owner() to authenticated;

-- Mantemos os IDs originais do aplicativo para migração sem perda de referências.
create table if not exists public.moneo_accounts (
 owner_id uuid not null references auth.users(id) on delete cascade,
 id bigint not null,
 name text not null,
 type text not null,
 opening_balance_cents bigint,
 opening_balance_date date,
 source text not null,
 primary key(owner_id,id)
);
create table if not exists public.moneo_categories (
 owner_id uuid not null references auth.users(id) on delete cascade,
 id text not null,
 name text not null,
 type text not null check(type in ('income','expense','transfer')),
 primary key(owner_id,id)
);
create table if not exists public.moneo_subcategories (
 owner_id uuid not null references auth.users(id) on delete cascade,
 id text not null,
 category_id text not null,
 name text not null,
 primary key(owner_id,id),
 foreign key(owner_id,category_id) references public.moneo_categories(owner_id,id) on delete cascade
);
create table if not exists public.moneo_transactions (
 owner_id uuid not null references auth.users(id) on delete cascade,
 id bigint not null,
 date date not null,
 amount_cents bigint not null check(amount_cents >= 0),
 description text not null,
 display_description text,
 type text not null check(type in ('income','expense','transfer')),
 account_id bigint,
 from_account_id bigint,
 to_account_id bigint,
 category_id text,
 subcategory_id text,
 group_name text not null default '',
 subcategory_name text not null default '',
 paid_for text,
 internal_transfer_pair_id text,
 source text not null,
 external_id text,
 import_hash text,
 status text not null default 'confirmed' check(status in ('confirmed','pending')),
 primary key(owner_id,id),
 foreign key(owner_id,category_id) references public.moneo_categories(owner_id,id) on delete set null,
 foreign key(owner_id,subcategory_id) references public.moneo_subcategories(owner_id,id) on delete set null
);
create table if not exists public.moneo_card_entries (
 owner_id uuid not null references auth.users(id) on delete cascade,
 id text not null,
 card text not null,
 date date not null,
 purchase_date date,
 paid_for text,
 description text not null,
 amount_cents bigint not null,
 import_key text not null,
 category_id text,
 subcategory_id text,
 kind text,
 primary key(owner_id,id),
 foreign key(owner_id,category_id) references public.moneo_categories(owner_id,id) on delete set null,
 foreign key(owner_id,subcategory_id) references public.moneo_subcategories(owner_id,id) on delete set null
);
create table if not exists public.moneo_description_rules (
 owner_id uuid not null references auth.users(id) on delete cascade,
 id text not null,
 term text not null,
 category_id text not null,
 subcategory_id text not null,
 primary key(owner_id,id),
 foreign key(owner_id,category_id) references public.moneo_categories(owner_id,id) on delete cascade,
 foreign key(owner_id,subcategory_id) references public.moneo_subcategories(owner_id,id) on delete cascade
);
create table if not exists public.moneo_preferences (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 rejected_transfer_pairs jsonb not null default '[]'::jsonb,
 updated_at timestamptz not null default now()
);

-- RLS em TODAS as tabelas. Usuários não autorizados não veem nada.
do $$
declare tbl text;
begin
 foreach tbl in array array[
 'moneo_accounts','moneo_categories','moneo_subcategories',
 'moneo_transactions','moneo_card_entries','moneo_description_rules','moneo_preferences'
 ] loop
  execute format('alter table public.%I enable row level security',tbl);
  execute format('revoke all on public.%I from anon',tbl);
  execute format('grant select, insert, update, delete on public.%I to authenticated',tbl);
  execute format('drop policy if exists moneo_owner_only on public.%I',tbl);
  execute format('create policy moneo_owner_only on public.%I for all to authenticated using (owner_id = (select auth.uid()) and (select public.is_moneo_owner())) with check (owner_id = (select auth.uid()) and (select public.is_moneo_owner()))',tbl);
 end loop;
end $$;

create index if not exists moneo_transactions_date_idx on public.moneo_transactions(owner_id,date);
create index if not exists moneo_card_entries_date_idx on public.moneo_card_entries(owner_id,date);

-- ETAPA MANUAL POSTERIOR (não executar até criar seu usuário em Authentication):
-- insert into public.moneo_owner(user_id) values ('UUID-DO-SEU-USUARIO');
-- Nunca compartilhe senha, token de sessão ou chave service_role.
