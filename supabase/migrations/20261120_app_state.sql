-- MONEO: estado integral do aplicativo, isolado por proprietário.
-- Execute no SQL Editor. Não altera snapshots ou dados do navegador.
create table if not exists public.moneo_app_state (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 payload jsonb not null check (jsonb_typeof(payload) = 'object'),
 source_snapshot_id uuid references public.moneo_migration_snapshots(id),
 revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
alter table public.moneo_app_state enable row level security;
revoke all on public.moneo_app_state from anon;
grant select, insert, update on public.moneo_app_state to authenticated;
drop policy if exists moneo_app_state_owner on public.moneo_app_state;
create policy moneo_app_state_owner on public.moneo_app_state
 for all to authenticated
 using (owner_id = (select auth.uid()) and (select public.is_moneo_owner()))
 with check (owner_id = (select auth.uid()) and (select public.is_moneo_owner()));

-- Ativação segura: só permite importar snapshot do próprio usuário,
-- e nunca sobrescreve um estado já existente.
create or replace function public.moneo_initialize_from_snapshot(p_snapshot_id uuid)
returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
declare
 v_owner uuid := (select auth.uid());
 v_snapshot public.moneo_migration_snapshots%rowtype;
 v_state public.moneo_app_state%rowtype;
begin
 if v_owner is null or not (select public.is_moneo_owner()) then
   raise exception 'Usuário não autorizado';
 end if;
 select * into v_snapshot from public.moneo_migration_snapshots
  where id = p_snapshot_id and owner_id = v_owner;
 if not found then raise exception 'Snapshot não encontrado'; end if;
 insert into public.moneo_app_state(owner_id,payload,source_snapshot_id)
 values(v_owner,v_snapshot.payload,p_snapshot_id)
 on conflict(owner_id) do nothing;
 select * into v_state from public.moneo_app_state where owner_id=v_owner;
 return jsonb_build_object(
  'source_snapshot_id',v_state.source_snapshot_id,
  'revision',v_state.revision,
  'matches_requested_snapshot',v_state.source_snapshot_id = p_snapshot_id,
  'counts',jsonb_build_object(
   'accounts',jsonb_array_length(coalesce(v_state.payload->'accounts','[]'::jsonb)),
   'transactions',jsonb_array_length(coalesce(v_state.payload->'transactions','[]'::jsonb)),
   'categories',jsonb_array_length(coalesce(v_state.payload->'categories','[]'::jsonb)),
   'cardEntries',jsonb_array_length(coalesce(v_state.payload->'cardEntries','[]'::jsonb)),
   'pendingTransactions',jsonb_array_length(coalesce(v_state.payload->'pendingTransactions','[]'::jsonb))
  )
 );
end;
$$;
revoke all on function public.moneo_initialize_from_snapshot(uuid) from public, anon;
grant execute on function public.moneo_initialize_from_snapshot(uuid) to authenticated;
