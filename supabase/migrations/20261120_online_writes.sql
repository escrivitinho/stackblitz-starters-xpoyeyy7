-- Escrita com controle de revisão: impede sobrescrever alterações de outra sessão.
create or replace function public.moneo_save_app_state(p_expected_revision bigint, p_payload jsonb)
returns bigint language plpgsql security invoker set search_path = ''
as $$
declare v_revision bigint;
begin
 if (select auth.uid()) is null or not (select public.is_moneo_owner()) then raise exception 'Não autorizado'; end if;
 if jsonb_typeof(p_payload) <> 'object' then raise exception 'Estado inválido'; end if;
 update public.moneo_app_state
 set payload=p_payload, revision=revision+1, updated_at=now()
 where owner_id=(select auth.uid()) and revision=p_expected_revision
 returning revision into v_revision;
 if v_revision is null then raise exception 'Conflito de versão: recarregue os dados online antes de salvar'; end if;
 return v_revision;
end;
$$;
revoke all on function public.moneo_save_app_state(bigint,jsonb) from public,anon;
grant execute on function public.moneo_save_app_state(bigint,jsonb) to authenticated;
