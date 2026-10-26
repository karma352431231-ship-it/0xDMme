"""Exact read-contract code review; preserve full database/schema/runtime guards."""
import deploy_pipeline_test as fixtures
import deploy_upload_lifecycle_test as lifecycle
import deploy_reviewed_code as reviewed_code
import deploy_source_text_test as contracts

remote = fixtures.remote


class CommunityReaderReviewTests(lifecycle.UploadLifecycleReviewTests):
    def setUp(self):
        fixture = fixtures.CommunityFeedCodeTests()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        self.live, self.candidate = fixture.live, fixture.candidate
        (self.candidate / 'src/server/database/community-discovery.ts').write_bytes(
            (self.live / 'src/server/database/community-discovery.ts').read_bytes())
        self.modules = ['communities.ts']
        # The created-communities release also reviews communities.ts alone.
        self.exports = contracts.CommitExports({
            reviewed_code.COMMUNITY_READER_BEFORE: fixture.export(self.live),
            reviewed_code.COMMUNITY_READER_REVIEWED: fixture.export(self.candidate)})
