-- An account row without a profile has no charge, so before 101 signing in
-- never touched the global capacity ledger. Its engagement fact writes charged
-- counters, which took the ledger row from the account insert until commit and
-- serialized concurrent first sign-ins behind the 1 s lock timeout. The same
-- fact now runs at commit: identical writes, accounting and atomicity, with
-- the ledger held only while the transaction commits.
DROP TRIGGER engagement_account_fact ON hash_talk.accounts;
CREATE CONSTRAINT TRIGGER engagement_account_fact AFTER INSERT OR DELETE ON hash_talk.accounts
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION hash_talk.engagement_account_fact('accounts');
