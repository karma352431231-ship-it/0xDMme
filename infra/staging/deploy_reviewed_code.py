"""Exact reviewed code/runtime transitions, independent of activation mechanics."""
import hashlib
import json
from deploy_archive import digest

# Owner requested normal main integration and activation on 24/10/2026 after
# behavior-preserving hotspot refactors. Pin both complete database trees:
# only the admission owner, four consumers, contacts and composition differ.
# All SQL migrations, lock helpers and runtime dependencies remain exact.
HOTSPOT_ADMISSION_BEFORE = '69f80ca74cb97fee16d5a6f35a47272c87755f89'
HOTSPOT_ADMISSION_REVIEWED = '84a63090dc2bd9dc25f87eaa6f21800adfb0537a'
HOTSPOT_ADMISSION_MODULES = frozenset({
    'admission.ts', 'contacts.ts', 'group-daily.ts', 'group-media.ts',
    'group-retention.ts', 'index.ts', 'representatives.ts',
})

# Owner requested activation of the top nested reply preview. Only these two
# bounded read projections change; pin both complete database trees and retain
# every migration, runtime dependency and unrelated database module guard.
TOP_REPLY_PREVIEW_BEFORE = '008ee6aaf2da4342c0d80c32c0c41c849699d34f'
TOP_REPLY_PREVIEW_REVIEWED = '8bf7b251899f1da9ebbb21b08b731cd36dc44eae'
TOP_REPLY_PREVIEW_MODULES = frozenset({'community-discussion.ts', 'community-posts.ts'})

# Owner-reviewed dev-only NaCl transition, including rollback. Never a general
# allowance for dev dependencies; every other changed lock remains blocked.
PHANTOM_PROBE_LOCKFILES = frozenset([
    '4db68588987a5b5a1a3afedd09a6096a2c5ab51c37ac9f334af2cc06b8125092',
    'fac024d2596d80a4450f9ad46cc212e6b51e536f02062f630fd8c8c1adcc0be5',
])

# Routine UI release: two reviewed read projections, with the entire database
# tree pinned on both sides. No SQL or migration executor change is permitted.
COMMUNITY_FEED_BEFORE = '194bbd2988a622265aaf06650549691743d23c7b'

COMMUNITY_FEED_REVIEWED = '18523cadb16aaf70504317e6e01375b59618e00f'

# Owner authorized the mobile login fix and its activation on 07/10/2026.
# Only authentication.ts changes: provisional account ID, confirmed atomically.
# Pin the whole database tree; SQL and its executor remain byte-identical.
MOBILE_OPENING_BEFORE = 'f8ac068973468cc0bcae13ca3b1312171ca99252'

MOBILE_OPENING_REVIEWED = '6f8f2abe8b8521d78dfa53bb76b9364cd0f881d1'

# Ranking query fix under the owner's completion/deployment authorization.
# Code only: every migration, dependency and unrelated database file stays exact.
RANKING_METRICS_BEFORE = '0139e1d0f04681555e1dffea23f77cdf367c70d3'

RANKING_METRICS_REVIEWED = '04a02dad65d480ad662f0a0f93e58da884518a5f'

# Owner approved the chat fix and its activation. Only post-COMMIT control
# markers change in these four modules; migrations/SQL/executor stay identical.
MESSAGE_REMOVAL_BEFORE = '0c5b6290370bde4f5d0e0a52c2e72cf576756dc3'

MESSAGE_REMOVAL_REVIEWED = '260719297084c8d8f74fb117dcacd42e7530be6a'

# Owner request of 09/10/2026: only the connection pool size in index.ts changes
# (web 4 -> 16, worker 1 -> 4) to match PostgreSQL max_connections 64. No SQL,
# migration or other database module changes.
POOL_SIZE_BEFORE = 'b1aa82c092e16650baebad8b2f522bcb837b48f5'

POOL_SIZE_REVIEWED = '68831a56089d26c2de8c129a47eda9be6ac0b5a5'

# Owner activation request of 10/10/2026: reply notices carry a preview read
# through the existing public post projection (readMany). Only these two read
# modules change; no SQL, migration or executor change.
ACTIVITY_PREVIEW_BEFORE = '9a3170dd3815689d7d547d117824a92f66283d3b'

ACTIVITY_PREVIEW_REVIEWED = '0bb7b9dddbd84fe8c033b2ae04dec93a2f97fade'

# Owner approved activation of the frozen public pose detector on 10/10/2026.
# Only media visibility, review and capacity accounting code changes. The
# existing 052 schema, migrations and migration executor remain byte-identical.
POSE_MODERATION_BEFORE = '2ac00f98698d384cff2a2f9d6937093e552d276b'

POSE_MODERATION_REVIEWED = '5a54ddbe4a0dbdd91b1965b902dae970f12e646d'

# Owner-approved 11/10/2026 code-only reservation upgrade; all migrations unchanged.
MEDIA_OUTPUT_BEFORE = 'feff745968330663f956d26faac583d9b3194340'

MEDIA_OUTPUT_REVIEWED = '5e024bfa606213f6c99760378a82fed68d2699e2'

# Owner activation request of 13/10/2026: bounded reads of the current viewer's
# saved-post preferences. Entire database projections are pinned; all 64 SQL
# migrations, accounting, write operations and other modules stay identical.
SAVED_BOOKMARK_BEFORE = 'c2beaf05d3c62826580b752e8b31d94930386a4e'

SAVED_BOOKMARK_REVIEWED = '877a9f9d80bd08a6dca23e2ad3616c7044f9f1c9'

# Owner activation request of 15/10/2026: chat previews and public DM edits.
# Pin both full database trees, including the reaction-to-action module rename.
# All 69 migrations, their executor, dependencies and Node remain unchanged.
CHAT_PARITY_BEFORE = '02b47e9050f78d7a770661ea0326945a1c992cd2'

CHAT_PARITY_REVIEWED = '2fc2ed033851c69b8b54dbf962d2676b7b0f75a4'

# Owner authorized integration and activation of direct public DMs on 15/10/2026.
# Only these six database modules change; all 69 SQL files/executor stay exact.
PUBLIC_DM_OPENING_BEFORE = '08dff889caa2fe04911b2bc8f720c71465013e5a'

PUBLIC_DM_OPENING_REVIEWED = '3bfc25dd20fb202d1a4ea834e18bd66b316bc3b0'

# Owner requested X-style alerts for followed profiles on 16/10/2026. Only the
# preview read, its store and the store wiring change; all 71 SQL files stay exact.
FOLLOWED_ALERTS_BEFORE = '762bd805aa6af374d98688eca5e7c1a571eb8b66'

FOLLOWED_ALERTS_REVIEWED = '49f1c1984de1364b251d6b8225ae8b74de242010'

# Owner approved the measured snapshot read repair for deployment on 17/10/2026.
# Pin both complete database trees; all 91 migrations and write paths stay exact.
SCOPED_SNAPSHOT_BEFORE = '2d4fabaa37d0d1fc7b40059595a500c0f8651d01'

SCOPED_SNAPSHOT_REVIEWED = '90126582d128ed5e0a0e1a1138950c06b9a53488'

# Owner requested completion of the database audit on 18/10/2026. Exact code-only
# upload recovery/retry/collection correction; all 91 migrations stay byte-identical.
UPLOAD_LIFECYCLE_BEFORE = 'f2049d24b61d95f86e80afe7db79fcfada60bc63'

UPLOAD_LIFECYCLE_REVIEWED = '1c92c68fc1bacaae0dbbd5fd669827e7b75a2efe'

# Owner requested the FOMO user ranking and its activation on 19/10/2026. Exact
# code-only change: previous-window account score, page bio/followers and 60-day
# aggregated counters; all 92 migrations stay byte-identical.
ACCOUNT_RANKING_GROWTH_BEFORE = '6d0645faede7709af13c7033a1ba2caa033853d0'

ACCOUNT_RANKING_GROWTH_REVIEWED = 'f3de52a96c0a3a6a224d53e69842e0d368336355'

# Owner requested this release on 19/10/2026. Exact code-only change: only the text of
# error reasons and labels differs; the syntax of every module is otherwise identical
# and all 92 migrations stay byte-identical.
SOURCE_TEXT_BEFORE = '29873898f51161a9ff0776f71e94a15721da79e8'

SOURCE_TEXT_REVIEWED = 'f994fd6eef061aaba564d5520ff8240f9c86c85f'

SOURCE_TEXT_MODULES = frozenset({
    'attachment-reservations.ts', 'attachments.ts', 'authentication.ts', 'backups.ts', 'calls.ts',
    'communities.ts', 'community-address.ts', 'community-authority.ts', 'community-badges.ts',
    'community-discovery.ts', 'community-discussion.ts', 'community-followers.ts',
    'community-governance.ts', 'community-interactions.ts', 'community-media.ts',
    'community-moderation.ts', 'community-names.ts', 'community-post-authority.ts',
    'community-post-moderation.ts', 'community-post-tags.ts', 'community-posts.ts',
    'community-preferences.ts', 'community-ranking.ts', 'community-upvotes.ts', 'contacts.ts',
    'content-capacity.ts', 'daily.ts', 'devices.ts', 'group-admission.ts', 'group-daily.ts',
    'group-matrix.ts', 'group-media.ts', 'group-message-updates.ts', 'group-messages.ts',
    'group-quota.ts', 'group-retention.ts', 'groups.ts', 'matrix.ts', 'mention-admission.ts',
    'message-index.ts', 'message-opening.ts', 'message-recovery.ts',
    'message-removal-allocations.ts', 'messages.ts', 'personal-cleanup-allocations.ts',
    'personal-cleanup-authority.ts', 'post-sharing.ts', 'profile-banners.ts',
    'profile-descriptions.ts', 'profile-mutuals.ts', 'profile-notifications.ts',
    'profile-ranking.ts', 'profile-social.ts', 'public-moderation-details.ts',
    'public-moderation.ts', 'public-profile.ts', 'public-reports.ts', 'representatives.ts',
    'social-cleanup-authority.ts', 'social-conversations.ts', 'social-crypto.ts', 'social-dm.ts',
    'social-history.ts', 'social-matrix.ts', 'social-media.ts', 'social-read-receipts.ts',
    'status-media.ts', 'status.ts', 'upload-admission.ts', 'vault-quota.ts', 'vault.ts',
})

# Exact reviewed runtime diagnostics; schema and runtime contracts remain fixed.
RUNTIME_DIAGNOSTICS_BEFORE = '4c54956dc6ab04e6c29c04f317b54d93f307b886'

RUNTIME_DIAGNOSTICS_REVIEWED = 'edc3d95e6f3c8b94866bd8470ebe0b447599ad03'

RUNTIME_DIAGNOSTICS_MODULES = frozenset({
    'authentication.ts', 'changes.ts', 'community-badges.ts',
    'community-post-visibility.ts', 'contacts.ts', 'content-capacity.ts', 'daily.ts',
    'group-quota.ts', 'index.ts', 'personal-quota.ts', 'public-moderation.ts',
    'public-profile.ts', 'social-dm.ts', 'status.ts', 'work-signals.ts',
})

# Measured signed feed/follower read correction; pin the full database trees.
# All 91 migrations, write paths, timeouts and runtime remain exact.
COMMUNITY_READER_BEFORE = 'ed30f83d47a3932e391d17a6ecde4031da9ab0ec'

COMMUNITY_READER_REVIEWED = 'd441c08eb2298aed7e9db52eecd8b979fb9372a3'

# Exact two-reader repair approved after explanation on 14/10/2026.
# Pin both full database trees; all 66 migrations/executor stay exact.
# Owner-requested mandatory topics: only new admission changes, without SQL or backfill.
# Owner-authorized notification repair: generic commit-only wakes; all 67 SQL files unchanged.
AUTOMATIC_ACTIVITY_BEFORE = '803a569a4d2b2c9fec9895762759e11ad290d7ec'

AUTOMATIC_ACTIVITY_REVIEWED = '0a2df41fb7e3e3f236ea108e2826f2d93939b3f8'

REQUIRED_COMMUNITY_TOPICS_BEFORE = '8d94f34ca6637cec6518a53d095a50c7af19a9b0'

REQUIRED_COMMUNITY_TOPICS_REVIEWED = 'b086ad511cd3338a5246f7f6752ca250be7892ff'

OWNER_REVIEW_MEDIA_BEFORE = '28b851b29ff11883511f5992083969534f7f7733'

OWNER_REVIEW_MEDIA_REVIEWED = 'e4f9bfa8f35b4636e4ab8dfda720608962868817'

# Bounded public inbox metadata; all applied migrations remain byte-identical.
CONVERSATION_FLOW_BEFORE = '8edc9aae0bfa6e4c0939d3834c50960bd1721dfa'

CONVERSATION_FLOW_REVIEWED = '4f03719b2e82209f23e0760b65aaf24f67494b67'

# Owner-requested preview/local detailed push repair; exact trees, no schema/runtime change.
PREVIEW_NOTIFICATIONS_BEFORE = 'f049623ec2ff065e4c4d6c1c369ee75295aa876f'

PREVIEW_NOTIFICATIONS_REVIEWED = '1a9d2de89b38a048c7c60953de86f5f13bd5f05a'

# Owner authorized main integration and activation of f5df9d6 on 21/10/2026.
# Pin both complete database trees; all SQL, dependencies and runtime stay exact.
CATEGORIZED_MESSAGES_BEFORE = 'b20d1be827f665311aef26d72e98e1e1240821b0'

CATEGORIZED_MESSAGES_REVIEWED = 'f5df9d6203a41569fba05645ef2b26d4d116f41f'

# Owner requested main integration and activation of 898865f on 22/10/2026.
# Exact selected-conversation read only; all SQL, writes and runtime stay fixed.
PEER_WINDOW_BEFORE = '60eada368f929361a68e4a0599cd4198228aad9a'

PEER_WINDOW_REVIEWED = '898865f55a3bc68552aabd784f0d264cfe6bf228'

PEER_WINDOW_MODULES = frozenset({'message-index.ts', 'messages.ts'})

# Owner chose option 2 for group member identity and requested activation on
# 23/10/2026: co-member wallets only for wallet discovery, never across a block.
# Exact read-only addition in two modules; all SQL migrations and runtime fixed.
GROUP_MEMBER_WALLETS_BEFORE = '090d92f0326c1dcba8996d3afa63686515d0fc9c'

GROUP_MEMBER_WALLETS_REVIEWED = '699e0f2c8e9e576b3f2a63841379288a2605f0da'

GROUP_MEMBER_WALLETS_MODULES = frozenset({'contacts.ts', 'groups.ts'})

# Owner asked on 23/10/2026 for a group check that turns green only when every
# member read. Exact receipt query only; all migrations and runtime stay fixed.
GROUP_READ_ALL_BEFORE = '87f0209de967ec7b678fc27ceb91c9a461899662'

GROUP_READ_ALL_REVIEWED = 'aa61ed9ae58b06c872e55b3d65adae31bc78f4fd'

GROUP_READ_ALL_MODULES = frozenset({'group-daily.ts'})

# Owner asked on 23/10/2026 for fewer requests per group message: one delta
# request composes the existing cut, change page and packet queries. Exact
# query reuse only; all migrations and runtime stay fixed.
GROUP_DELTA_BEFORE = '465e2df87a63f4fb3bb49e29a21b48f271b9b6a0'

GROUP_DELTA_REVIEWED = '28cf2122fb0ba9bb8147a01f57a1b46b46f983aa'

GROUP_DELTA_MODULES = frozenset({'group-message-updates.ts', 'group-messages.ts'})

# Owner asked on 25/10/2026 for a "Created by you" sidebar section and its
# activation. Exact read-only list filter (c.owner) only; all migrations and
# runtime stay fixed.
CREATED_COMMUNITIES_BEFORE = '7bfe75bdaa95b12d9630f84950525d57b79dca04'

CREATED_COMMUNITIES_REVIEWED = 'b32bdf02667e8c987811dacacd8f5e3c5be341d3'

CREATED_COMMUNITIES_MODULES = frozenset({'communities.ts'})

# Owner asked on 25/10/2026 for more default post tags, in English, for new
# communities. Exact seed-list change only; all migrations and runtime fixed.
DEFAULT_POST_TAGS_BEFORE = 'e86c3da6e08320698b43d63c69732dec0414a591'

DEFAULT_POST_TAGS_REVIEWED = 'f14ffa8b3cb2a6daab9200d0342de61d20216cee'

DEFAULT_POST_TAGS_MODULES = frozenset({'community-post-tags.ts'})

CATEGORIZED_MESSAGES_MODULES = frozenset({
    'backups.ts',
    'changes.ts',
    'contacts.ts',
    'daily.ts',
    'group-daily.ts',
    'group-message-updates.ts',
    'group-messages.ts',
    'group-retention.ts',
    'groups.ts',
    'matrix.ts',
    'messages.ts',
    'public-notice-wake.ts',
    'social-dm.ts',
    'social-read-receipts.ts',
    'status.ts',
    'transaction-changes.ts',
    'work-signals.ts',
})


def reviewed_lockfile_change(before, after):
    if frozenset([digest(before), digest(after)]) != PHANTOM_PROBE_LOCKFILES:
        return False
    # Recheck the runtime closure even for the exact reviewed hash pair.
    def runtime_entries(path):
        packages = json.loads(path.read_text())['packages']
        return {name: value for name, value in packages.items()
                if name and value.get('dev') is not True}
    return runtime_entries(before) == runtime_entries(after)


def database_files(root):
    directory = root / 'src/server/database'
    return {str(p.relative_to(directory)): digest(p) for p in directory.rglob('*') if p.is_file()}


def database_code_reviewed(candidate, live):
    """Exact reviewed code-only transitions; retain every migration guard."""
    import deploy_blocks45 as backups
    before, after = database_files(live), database_files(candidate)
    changed = {name for name in set(before) | set(after) if before.get(name) != after.get(name)}
    # The first review with the same changed-module set is selected, so the
    # newest transition for a module set must precede older ones.
    reviews = [
        (set(CREATED_COMMUNITIES_MODULES), CREATED_COMMUNITIES_BEFORE,
         CREATED_COMMUNITIES_REVIEWED),
        (set(DEFAULT_POST_TAGS_MODULES), DEFAULT_POST_TAGS_BEFORE, DEFAULT_POST_TAGS_REVIEWED),
        (set(TOP_REPLY_PREVIEW_MODULES), TOP_REPLY_PREVIEW_BEFORE, TOP_REPLY_PREVIEW_REVIEWED),
        (set(HOTSPOT_ADMISSION_MODULES), HOTSPOT_ADMISSION_BEFORE, HOTSPOT_ADMISSION_REVIEWED),
        (set(GROUP_DELTA_MODULES), GROUP_DELTA_BEFORE, GROUP_DELTA_REVIEWED),
        (set(GROUP_READ_ALL_MODULES), GROUP_READ_ALL_BEFORE, GROUP_READ_ALL_REVIEWED),
        (set(GROUP_MEMBER_WALLETS_MODULES), GROUP_MEMBER_WALLETS_BEFORE,
         GROUP_MEMBER_WALLETS_REVIEWED),
        (set(PEER_WINDOW_MODULES), PEER_WINDOW_BEFORE, PEER_WINDOW_REVIEWED),
        (set(CATEGORIZED_MESSAGES_MODULES), CATEGORIZED_MESSAGES_BEFORE, CATEGORIZED_MESSAGES_REVIEWED),
        ({'daily.ts', 'public-notification-preview.ts', 'push-private-activity.ts'},
         PREVIEW_NOTIFICATIONS_BEFORE, PREVIEW_NOTIFICATIONS_REVIEWED),
        ({'social-read-receipts.ts', 'social-unread.ts'}, CONVERSATION_FLOW_BEFORE, CONVERSATION_FLOW_REVIEWED),
        ({'communities.ts'}, COMMUNITY_READER_BEFORE, COMMUNITY_READER_REVIEWED),
        ({'community-interactions.ts', 'community-posts.ts', 'profile-notifications.ts', 'public-notice-wake.ts'},
         AUTOMATIC_ACTIVITY_BEFORE, AUTOMATIC_ACTIVITY_REVIEWED),
        ({'community-classification.ts'}, REQUIRED_COMMUNITY_TOPICS_BEFORE, REQUIRED_COMMUNITY_TOPICS_REVIEWED),
        ({'public-profile.ts', 'public-moderation.ts'}, OWNER_REVIEW_MEDIA_BEFORE, OWNER_REVIEW_MEDIA_REVIEWED),
        ({'community-media.ts'}, MEDIA_OUTPUT_BEFORE, MEDIA_OUTPUT_REVIEWED),
        ({'communities.ts', 'community-discovery.ts'}, COMMUNITY_FEED_BEFORE, COMMUNITY_FEED_REVIEWED),
        ({'authentication.ts'}, MOBILE_OPENING_BEFORE, MOBILE_OPENING_REVIEWED),
        ({'community-ranking-metrics.ts'}, RANKING_METRICS_BEFORE, RANKING_METRICS_REVIEWED),
        ({'backups.ts', 'changes.ts', 'contacts.ts', 'messages.ts'},
         MESSAGE_REMOVAL_BEFORE, MESSAGE_REMOVAL_REVIEWED),
        ({'index.ts'}, POOL_SIZE_BEFORE, POOL_SIZE_REVIEWED),
        ({'community-interactions.ts', 'community-posts.ts'},
         ACTIVITY_PREVIEW_BEFORE, ACTIVITY_PREVIEW_REVIEWED),
        ({'community-media.ts', 'public-moderation.ts', 'vault-quota.ts'},
         POSE_MODERATION_BEFORE, POSE_MODERATION_REVIEWED),
        ({'community-discovery.ts', 'community-interaction-view.ts', 'community-preferences.ts'},
         SAVED_BOOKMARK_BEFORE, SAVED_BOOKMARK_REVIEWED),
        ({'message-index.ts', 'messages.ts', 'social-actions.ts', 'social-crypto.ts',
          'social-history.ts', 'social-reactions.ts', 'social-read-receipts.ts'},
         CHAT_PARITY_BEFORE, CHAT_PARITY_REVIEWED),
        ({'social-conversations.ts', 'social-crypto.ts', 'social-dm.ts',
          'social-matrix.ts', 'social-media.ts', 'social-read-receipts.ts'},
         PUBLIC_DM_OPENING_BEFORE, PUBLIC_DM_OPENING_REVIEWED),
        ({'daily.ts', 'index.ts', 'public-notification-preview.ts'},
         FOLLOWED_ALERTS_BEFORE, FOLLOWED_ALERTS_REVIEWED),
        ({'groups.ts', 'social-dm.ts', 'social-history.ts'},
         SCOPED_SNAPSHOT_BEFORE, SCOPED_SNAPSHOT_REVIEWED),
        ({'attachments.ts', 'group-media.ts', 'social-media.ts', 'status-media.ts', 'upload-recovery.ts'},
         UPLOAD_LIFECYCLE_BEFORE, UPLOAD_LIFECYCLE_REVIEWED),
        ({'community-ranking.ts', 'post-ranking-signals.ts', 'post-share-clicks.ts',
          'profile-follower-counts.ts', 'profile-ranking.ts'},
         ACCOUNT_RANKING_GROWTH_BEFORE, ACCOUNT_RANKING_GROWTH_REVIEWED),
        (set(SOURCE_TEXT_MODULES), SOURCE_TEXT_BEFORE, SOURCE_TEXT_REVIEWED),
        (set(RUNTIME_DIAGNOSTICS_MODULES), RUNTIME_DIAGNOSTICS_BEFORE, RUNTIME_DIAGNOSTICS_REVIEWED),
    ]
    selected = next((review for review in reviews if changed == review[0]), None)
    if selected is None:
        return False
    prefix = 'src/server/database/'
    def projection(revision):
        return {name[len(prefix):]: hashlib.sha256(value).hexdigest()
                for name, value in backups.git_export(revision).items()
                if name.startswith(prefix)}
    return before == projection(selected[1]) and after == projection(selected[2])
