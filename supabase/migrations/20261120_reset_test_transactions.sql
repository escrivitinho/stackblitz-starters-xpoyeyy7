-- MONEO | Reiniciar somente movimentações financeiras de teste
-- Executar no SQL Editor do projeto Supabase correto, com o MONEO fechado em todas as abas.
-- Preserva contas, categorias, regras de classificação, autenticação e snapshots.
-- Identifica o proprietário pelo snapshot de migração confirmado.
begin;
do $$
declare
  v_owner uuid;
  v_affected integer;
begin
  select owner_id into strict v_owner
  from public.moneo_migration_snapshots
  where id = '7269b660-f09f-40d8-9052-f4c375af8835'::uuid;
  if not exists(select 1 from public.moneo_owner where user_id = v_owner) then
    raise exception 'Proprietário não autorizado; nenhuma alteração realizada';
  end if;
  update public.moneo_app_state
  set payload = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(payload, '{transactions}', '[]'::jsonb, true),
        '{pendingTransactions}', '[]'::jsonb, true
      ),
      '{cardEntries}', '[]'::jsonb, true
    ),
    '{rejectedTransferPairs}', '[]'::jsonb, true
  ),
  revision = revision + 1,
  updated_at = now()
  where owner_id = v_owner;
  get diagnostics v_affected = row_count;
  if v_affected <> 1 then
    raise exception 'Estado online não encontrado ou ambíguo; nenhuma alteração realizada';
  end if;
  -- Tabelas legadas também são limpas para evitar ressurgimento de dados de teste.
  delete from public.moneo_transactions where owner_id = v_owner;
  delete from public.moneo_card_entries where owner_id = v_owner;
  update public.moneo_preferences
    set rejected_transfer_pairs='[]'::jsonb, updated_at=now()
    where owner_id = v_owner;
  raise notice 'Movimentações zeradas para proprietário autorizado. Contas, categorias e regras preservadas.';
end $$;
commit;

-- Conferência (resultado esperado: todos os valores abaixo iguais a zero):
select
  jsonb_array_length(coalesce(payload->'transactions','[]'::jsonb)) as lancamentos,
  jsonb_array_length(coalesce(payload->'pendingTransactions','[]'::jsonb)) as pendentes,
  jsonb_array_length(coalesce(payload->'cardEntries','[]'::jsonb)) as cartao,
  jsonb_array_length(coalesce(payload->'rejectedTransferPairs','[]'::jsonb)) as pares_rejeitados
from public.moneo_app_state
where owner_id = (
  select owner_id from public.moneo_migration_snapshots
  where id = '7269b660-f09f-40d8-9052-f4c375af8835'::uuid
);
