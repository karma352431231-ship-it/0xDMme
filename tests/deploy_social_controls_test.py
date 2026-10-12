"""Social migration review and preservation guards; no SSH or live writes."""
from pathlib import Path
import sys,tempfile,unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'infra/staging'))
import deploy_social_controls as social
import deploy_remote as base
import deploy_blocks45 as backups


class SocialControlsMigrationTests(unittest.TestCase):
    def test_missing_exact_review_refuses_before_database_access(self):
        with (patch.object(social,'REVIEWED','UNREVIEWED'),
              patch.object(backups,'pg') as pg,
              patch.object(base,'reviewed_database') as review,
              self.assertRaisesRegex(RuntimeError,'exact source review')):
            social.review(Path('candidate'),Path('live'))
        pg.assert_not_called();review.assert_not_called()

    def test_review_preserves_previous_migrations_and_worker_units(self):
        with tempfile.TemporaryDirectory() as directory:
            old,new=Path(directory)/'old',Path(directory)/'new'
            previous={'src/main.ts':b'old','package.json':b'{}','package-lock.json':b'lock','.nvmrc':b'24.14.0'}
            approved=dict(previous,**{'src/main.ts':b'social'})
            for version in range(1,59):
                name='src/server/database/migrations/%03d.sql'%version
                approved[name]=str(version).encode()
                if version<=55: previous[name]=approved[name]
            for root,files in [(old,previous),(new,approved)]:
                for name,value in files.items():
                    path=root/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(value)
                for name in social.background.UNITS:
                    path=root/'infra/staging'/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(b'worker')
            revision='c'*40;exports={social.BEFORE:previous,revision:approved}
            with (patch.object(social,'REVIEWED',revision),patch.object(backups,'git_export',side_effect=lambda sha:exports[sha]),
                  patch.object(base,'verify_community_tables'),patch.object(backups,'pg',return_value=b't')):
                social.review(new,old)
                for name in ['src/server/database/migrations/055.sql','src/main.ts','infra/staging/'+social.background.UNITS[0]]:
                    path=new/name;original=path.read_bytes();path.write_bytes(b'unreviewed')
                    with self.assertRaises(RuntimeError): social.review(new,old)
                    path.write_bytes(original)

    def test_verification_accepts_only_expected_owner_follow_and_ledger_changes(self):
        versions=[{'version':n,'checksum':str(n)} for n in range(1,59)]
        before={'versions':versions[:55],'tables':{'existing':'same','community_follows':'old','community_ranking_state':'old'},
                'expected_follows':'new-follow','expected_ranking':'new-revision','used_bytes':1000,'expected_used_bytes':1128}
        after={'versions':versions,'tables':dict(before['tables'],community_follows='new-follow',community_ranking_state='new-revision'),
               'used_bytes':1128}
        with (patch.object(base,'attachment_versions',return_value=versions),patch.object(base,'verify_community_tables'),
              patch.object(backups,'pg',return_value=b't'),patch.object(social,'snapshot',return_value=after)):
            social.verify_migration(Path('candidate'),before)
        for invalid in [dict(after,used_bytes=1129),dict(after,tables={}),dict(after,versions=versions[:55])]:
            with (patch.object(base,'attachment_versions',return_value=versions),patch.object(social,'snapshot',return_value=invalid),
                  self.assertRaisesRegex(RuntimeError,'records, checksums')):
                social.verify_migration(Path('candidate'),before)
        with (patch.object(base,'attachment_versions',return_value=versions),patch.object(base,'verify_community_tables'),
              patch.object(backups,'pg',return_value=b'f'),patch.object(social,'snapshot',return_value=after),
              self.assertRaisesRegex(RuntimeError,'defaults, owner follows')):
            social.verify_migration(Path('candidate'),before)

    def test_dispatch_selects_58_only_and_keeps_existing_activation_lifecycle(self):
        with tempfile.TemporaryDirectory() as directory:
            candidate=Path(directory);migrations=candidate/'src/server/database/migrations';migrations.mkdir(parents=True)
            for n in range(1,59): (migrations/('%03d.sql'%n)).write_text('-- fixture')
            with patch.object(social,'review') as review:
                base.database_review(candidate,Path('live'))
            review.assert_called_once_with(candidate,Path('live'))
        with (patch.object(social.background,'verify_current'),patch.object(base,'activate_database',return_value={'published':True}) as activate):
            self.assertEqual(social.activate({},Path('work'),Path('candidate'),{}),{'published':True})
            transition=activate.call_args.args[3]
            self.assertEqual(transition['versions'],55)
            self.assertIs(transition['snapshot'],social.snapshot)
            self.assertIs(transition['stop_existing'],social.background.stop)
            self.assertIs(transition['resume_existing'],social.background.start)

if __name__=='__main__': unittest.main()
