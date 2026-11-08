-- Public visitor markers stay 30 days on the server (owner, 08/11/2026), so
-- rolling 7- and 30-day distinct visitor windows become measurable. Replay
-- receipts keep engagement_technical_retention().
CREATE FUNCTION hash_talk.engagement_visitor_retention() RETURNS interval LANGUAGE sql IMMUTABLE AS $$
  SELECT interval '30 days';
$$;
-- Markers older than the technical retention were already deleted, so a
-- longer window is complete only when it starts at or after this instant.
ALTER TABLE hash_talk.engagement_state ADD COLUMN visitors_complete_from timestamptz(3);
UPDATE hash_talk.engagement_state
  SET visitors_complete_from=clock_timestamp()-hash_talk.engagement_technical_retention();
ALTER TABLE hash_talk.engagement_state ALTER COLUMN visitors_complete_from SET NOT NULL;
