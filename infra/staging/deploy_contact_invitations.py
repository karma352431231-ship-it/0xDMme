"""Owner-approved 093→094 invitation transition, only through deploy.py."""
import json

import deploy_remote as base
import deploy_blocks45 as backups
import deploy_background as background
import deploy_profile_directory as directory

BEFORE = '74608210ba76752c0603308a3c7897a8c7bbcdef'
REVIEWED = '449fedf81c3dac1415179191fd29776a99652700'
TABLES = directory.TABLES
OMIT_COLUMNS = {'contact_controls': ('invite_hash', 'revision'),
                'content_usage_legacy': ('used_bytes',)}
ABSENT = "SELECT to_regclass('hash_talk.contact_invitations') IS NULL AND to_regprocedure('hash_talk.wake_contact_invitation_cleanup()') IS NULL"
SCHEMA_CHECK = """SELECT
 NOT EXISTS(SELECT 1 FROM hash_talk.contact_controls WHERE invite_hash IS NOT NULL)
 AND NOT EXISTS(SELECT 1 FROM hash_talk.contact_invitations
   WHERE used_by IS NOT NULL OR consumed_at IS NOT NULL OR charge<>256
   OR expires_at IS DISTINCT FROM (SELECT applied_at+interval '24 hours' FROM hash_talk.schema_migrations WHERE version=94))
 AND (SELECT count(*)=6 FROM information_schema.columns WHERE table_schema='hash_talk' AND table_name='contact_invitations')
 AND (SELECT count(*)=4 FROM pg_trigger WHERE tgrelid='hash_talk.contact_invitations'::regclass
   AND NOT tgisinternal AND tgenabled='O'
   AND tgname IN ('content_allocation_source','content_usage_insert','content_usage_delete','invitation_cleanup_hint'))
 AND (SELECT count(*)=6 FROM pg_constraint WHERE conrelid='hash_talk.contact_invitations'::regclass AND convalidated)
 AND (SELECT indisvalid AND indisready FROM pg_index WHERE indexrelid=to_regclass('hash_talk.contact_invitation_expiry'))
 AND (SELECT reloptions @> ARRAY['autovacuum_vacuum_scale_factor=0.05','autovacuum_vacuum_threshold=20']
   FROM pg_class WHERE oid='hash_talk.contact_invitations'::regclass)"""
COUNTER_CHECKS = directory.ranking.COUNTER_CHECKS.replace('tgrelid)=84', 'tgrelid)=85')
GLOBAL_CHECK = directory.ranking.GLOBAL_CHECK.replace('sources<>84', 'sources<>85')

# Hash normalized target controls and grants on PostgreSQL. Raw token hashes,
# account IDs and aliases never reach the executor's output or receipts.
CONTROL_ROWS = """SELECT to_jsonb(t)||jsonb_build_object('invite_hash',NULL,
 'revision',revision+CASE WHEN invite_hash IS NULL THEN 0 ELSE 1 END) AS value
 FROM hash_talk.contact_controls t"""
OLD_GRANTS = """SELECT jsonb_build_object('account_id',account_id,'token_hash',invite_hash,
 'used_by',NULL,'consumed_at',NULL,'charge',256) AS value
 FROM hash_talk.contact_controls WHERE invite_hash IS NOT NULL"""
NEW_GRANTS = """SELECT to_jsonb(t)-'expires_at' AS value FROM hash_talk.contact_invitations t"""


def grant_snapshot():
    source = """
import {createRequire} from 'node:module';
const pg=createRequire('/var/lib/0xdmme/data/release/package.json')('pg');
""" + backups.URL_CHECK + """
const client=new pg.Client({connectionString:url.href,connectionTimeoutMillis:3000,query_timeout:15000,statement_timeout:12000});
try {
 await client.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const present=(await client.query("SELECT to_regclass('hash_talk.contact_invitations') IS NOT NULL AS present")).rows[0].present;
 const queries=""" + json.dumps([CONTROL_ROWS, OLD_GRANTS, NEW_GRANTS]) + """;
 const result={present};
 for(const [name,query] of [['controls',queries[0]],['grants',queries[present?2:1]]]) {
  const bounded=await client.query('SELECT 1 FROM ('+query+') rows LIMIT 10001');
  if(bounded.rowCount>10000)throw new Error('Invitation snapshot row budget exceeded.');
  result[name]=(await client.query("SELECT count(*)::integer AS count,md5(coalesce(string_agg(value::text,'' ORDER BY value::text),'')) AS hash FROM ("+query+") rows")).rows[0];
 }
 result.ledger=(await client.query('SELECT used_bytes::text AS bytes FROM hash_talk.content_usage WHERE singleton')).rows[0].bytes;
 await client.query('ROLLBACK');console.log(JSON.stringify(result));
}finally{await client.end();}
"""
    return json.loads(backups.node(source))


def review(candidate, live):
    base.reviewed_database(candidate, live, {'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 94, 'previous_versions': 93})
    base.verify_community_tables(TABLES)
    for unit in [base.UNIT, *background.UNITS]:
        name = 'infra/staging/' + unit
        if base.digest(candidate / name) != base.digest(live / name):
            raise RuntimeError('Contact invitations do not authorize unit changes.')
    if directory.ranking.capacity.psql(ABSENT) != b't':
        raise RuntimeError('Contact invitation predecessor schema differs.')


def snapshot():
    small = tuple(name for name in TABLES if name not in directory.ranking.batches.KEYS)
    result = backups.database_snapshot(small, omit_columns=OMIT_COLUMNS,
        version_limit=94, include_reserved=True)
    result['tables'].update(directory.ranking.batches.snapshot(backups.node, backups.URL_CHECK))
    result.update(grant_snapshot())
    return result


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:93] or after['versions'] != versions
            or before['tables'] != after['tables'] or before['controls'] != after['controls']
            or before['grants'] != after['grants'] or before['present'] or not after['present']):
        raise RuntimeError('Invitation migration changed preserved data, grants or applied history.')
    if int(after['ledger']) != int(before['ledger']) + before['grants']['count'] * 256:
        raise RuntimeError('Invitation migration storage delta differs.')
    base.verify_community_tables(TABLES + ('contact_invitations',))
    if any(directory.ranking.capacity.psql(sql) != b't' for sql in
           [SCHEMA_CHECK, COUNTER_CHECKS, GLOBAL_CHECK]):
        raise RuntimeError('Invitation schema or capacity reconciliation failed.')


def activate(config, work, candidate, before_state):
    if config.get('contact_invitations') is not True:
        raise RuntimeError('Contact invitation migration requires explicit --contact-invitations approval.')
    background.verify_current(config)
    directory.ranking.parts.require_workers()
    result = base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 93, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start,
        'start': background.start,
    })
    result['contact_invitation_schema_versions'] = 94
    base.receipt(work, result)
    return result
