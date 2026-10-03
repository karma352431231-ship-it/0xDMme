-- Owner decision on 2026-10-03: remove contact quantity/frequency budgets.
-- Preserve revisions, discovery choices, invitations, relations and blocks.
-- Migration 010 remains immutable; its obsolete daily counters are removed.
ALTER TABLE hash_talk.contact_controls
 DROP COLUMN request_day,
 DROP COLUMN requests_today;
