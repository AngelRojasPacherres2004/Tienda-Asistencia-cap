-- Application connections must preserve every worker with linked records,
-- including references that would otherwise cascade or be set to NULL.
-- Direct database administration as postgres remains available for corrections.
CREATE OR REPLACE FUNCTION public.protect_worker_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  reference record;
  has_history boolean;
  predicate text;
BEGIN
  IF current_user IN ('postgres', 'supabase_admin') THEN
    RETURN OLD;
  END IF;

  FOR reference IN
    SELECT c.conrelid, c.conname, c.conkey, c.confkey
    FROM pg_constraint c
    WHERE c.contype = 'f' AND c.confrelid = TG_RELID
    ORDER BY c.conrelid, c.conname
  LOOP
    SELECT string_agg(format('linked.%I = ($1).%I', child.attname, parent.attname), ' AND ' ORDER BY keys.ordinality)
    INTO predicate
    FROM unnest(reference.conkey, reference.confkey) WITH ORDINALITY AS keys(child_num, parent_num, ordinality)
    JOIN pg_attribute child ON child.attrelid = reference.conrelid AND child.attnum = keys.child_num
    JOIN pg_attribute parent ON parent.attrelid = TG_RELID AND parent.attnum = keys.parent_num;

    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s linked WHERE %s)', reference.conrelid::regclass, predicate)
      INTO has_history USING OLD;
    IF has_history THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'WORKER_HAS_HISTORY',
        DETAIL = reference.conrelid::regclass::text;
    END IF;
  END LOOP;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_worker_history() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_worker_history() TO service_role;

DROP TRIGGER IF EXISTS protect_worker_history_before_delete ON public.usuarios;
CREATE TRIGGER protect_worker_history_before_delete
BEFORE DELETE ON public.usuarios
FOR EACH ROW EXECUTE FUNCTION public.protect_worker_history();
