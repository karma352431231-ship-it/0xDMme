-- Transaction-local baselines distinguish growth from cleanup under pressure.
-- Only volume-mode application connections pay for the pending partition sum.
CREATE FUNCTION hash_talk.capture_storage_admission_baseline() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('hash_talk.storage_capacity_mode',true) IS DISTINCT FROM 'volume' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='content_usage' THEN
    IF coalesce(current_setting('hash_talk.storage_logical_baseline',true),'')='' THEN
      PERFORM set_config('hash_talk.storage_logical_baseline',OLD.used_bytes::text,true);
    END IF;
  ELSE
    IF coalesce(current_setting('hash_talk.storage_pending_baseline',true),'')='' THEN
      PERFORM set_config('hash_talk.storage_pending_baseline',
        (SELECT sum(reserved_bytes)::text FROM hash_talk.storage_reservation_usage),true);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER storage_admission_baseline BEFORE UPDATE OF used_bytes ON hash_talk.content_usage
  FOR EACH ROW WHEN(OLD.used_bytes IS DISTINCT FROM NEW.used_bytes)
  EXECUTE FUNCTION hash_talk.capture_storage_admission_baseline();
CREATE TRIGGER storage_admission_baseline BEFORE UPDATE ON hash_talk.storage_reservation_usage
  FOR EACH ROW WHEN(OLD.reserved_bytes IS DISTINCT FROM NEW.reserved_bytes OR OLD.reservations IS DISTINCT FROM NEW.reservations)
  EXECUTE FUNCTION hash_talk.capture_storage_admission_baseline();
