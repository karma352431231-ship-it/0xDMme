"""Exact read-contract code review; preserve full database/schema/runtime guards."""
import deploy_pipeline_test as fixtures
import deploy_upload_lifecycle_test as lifecycle

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
        self.exports = {remote.COMMUNITY_READER_BEFORE: fixture.export(self.live),
                        remote.COMMUNITY_READER_REVIEWED: fixture.export(self.candidate)}
