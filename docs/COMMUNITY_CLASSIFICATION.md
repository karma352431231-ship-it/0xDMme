# Community classification and temporary moderation pause — 14/10/2026

The owner requested NSFW classification for sexual explicit communities, fixed
community topics and ranking filters, and explicitly chose to apply classification
only to newly created communities. Existing communities receive no backfill.

New communities may select zero, one or two topics: AI, Cat, Dog, Meme, Tech,
Stock, Chinese, BrainRot, Celebrity, NFT and TikTok. Topic identifiers are stable
protocol data. Labels are available in English and Simplified Chinese, with a
specific emoji for each topic. Topics are fixed at creation, including ownership
transfers, and cannot be edited through presentation or management operations.
The owner may change the NSFW designation on a newly classified community;
moderators and participants cannot. AI alone does not imply sexual content.

Display the classifications at the right of the community profile header, on its
hover card and in ranking rows. Only the topics selected by the owner appear
on those community surfaces. In the creation form, the topic selector starts
collapsed; its toggle shows the selected count and opens the choices on demand. Multiple ranking selections match any selected
topic. Empty selection includes all communities; filtered pagination uses the
same canonical selection in its cursor and filters before limiting the SQL page.

The owner now permits adult sexual explicit content in communities designated
NSFW and handles violations in unmarked communities manually. This supersedes
the previous universal sexual-content prohibition and automated prepublication
gate for the temporary pause. Private/E2EE conversations remain outside analysis.
Existing local governance, access checks, upload validation, preparation, hashes,
quotas, deletion and retention of already published content remain in force.
No new service, inference provider, dependency or model training is approved.

New public uploads are released with `publication_mode=unreviewed`, without an
automatic verdict, model identity, scanned frame count or invented operator review.
The existing internal approved state records publication availability; the UI
explicitly says that automatic analysis is paused. Historical reviews and their
original deadlines/verdicts are not rewritten or released in bulk. The byte owner
still verifies the exact target, hash and current visibility before delivery.
The scanner is not started; cleanup remains active for historical candidates and
unattached temporary uploads. Re-enabling analysis requires a separate decision
about the unreviewed uploads, model acceptance and publication policy.

Migration 067 adds an initially empty classification table and an audit column
(default `analysis`) for existing moderation rows. Existing data, usage balances,
checksums and services must be preserved during the reviewed VPS transition.
The owner explicitly requested this feature on the VPS. Migration 067 supplies
the metadata required by that request; it does not backfill communities, release
historical candidates or change dependencies/shared infrastructure. Bind the
exact reviewed sources and validate the existing maintenance/rollback path before
activation. Implementation or push alone does not establish publication.

**Ponto importante:** NSFW is an owner declaration, not a detector or proof of
compliance. Current community sanctions/reports are local governance; this change
does not introduce an operator dashboard for globally banning communities.

## Verification and responsibility review

Local tests cover unique/max-two creation topics, canonical multi-topic cursors,
immutable storage, owner-only NSFW changes (including moderator denial), legacy
communities, signed creation retries, filtering before pagination, truthful
unreviewed evidence, historical-state preservation, removal and exact-byte
publication. The existing automatic-analysis tests still exercise their original
lifecycle; actual process bootstrap explicitly selects the temporary pause.

Browser checks use synthetic data and the real creation, topic selector, badge
and hover components, with existing app styles/fonts. Both official languages
were checked at 320, 390 and 1280 CSS pixels without horizontal overflow. This
does not establish physical-device or signed-in production acceptance.

The existing `startCommunities()` and `startCommunityDiscovery()` closures remain
hotspots. This feature keeps classification rendering in its own module and
connects it through small calls. A separate reviewed split should first extract
community profile presentation, then management mounting, then discovery filter
state, leaving route/session lifecycle orchestration in the controllers. Main
risks are stale asynchronous responses, lost drafts and incorrect permission
refresh. Preserve the existing creation/session/navigation regressions and repeat
profile, hover, ranking and management browser checks after each extraction.
