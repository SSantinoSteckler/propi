-- MANUAL rollback of function behavior, NOT data deletion or schema removal.
-- Stop the local test first. Test ledgers remain physically isolated.
-- Restoring old entitlement definitions disables test Premium; it does not move
-- fictitious payments into the real ledger. Review/authorize remote execution.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '15s';
do $$ declare f record; begin
 if (select count(*) from private.billing_expand_backup)<>3 then raise exception 'Backup de funciones incompleto'; end if;
 update private.billing_rollout set contracted=false where singleton;
 for f in select definition from private.billing_expand_backup order by identity loop
  execute f.definition;
 end loop;
end $$;
notify pgrst, 'reload schema';
commit;
