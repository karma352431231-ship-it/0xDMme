"""Run the real preservation SQL only against an explicitly isolated local test DB."""
from pathlib import Path
import json,os,shutil,subprocess,sys,tempfile,urllib.parse

root=Path(sys.argv[1]);phase=sys.argv[2];record=Path(sys.argv[3])
url=urllib.parse.urlparse(os.environ['HASH_TALK_DATABASE_URL'])
if url.hostname not in ['127.0.0.1','localhost'] or not url.path.startswith('/hash_talk_test_discussion_migration_'):
    raise RuntimeError('Exclusive disposable test database required')
sys.path.insert(0,str(root/'infra/staging'))
import deploy_discussion as social
import deploy_blocks45 as backups

def node(code):
    code=code.replace("createRequire('/var/lib/0xdmme/data/release/package.json')",'createRequire('+json.dumps(str(root/'package.json'))+')')
    return subprocess.run([os.environ['SOCIAL_TEST_NODE'],'--input-type=module','-e',code],check=True,capture_output=True,timeout=30).stdout

def pg(args,**_options):
    env=dict(os.environ,PGHOST=url.hostname,PGPORT=str(url.port or 5432),PGUSER=urllib.parse.unquote(url.username or ''),
             PGDATABASE=url.path[1:],PGPASSWORD=urllib.parse.unquote(url.password or ''))
    return subprocess.run(args,env=env,check=True,capture_output=True,timeout=30).stdout

backups.node=node
backups.pg=pg
backups.URL_CHECK="const url = new URL(process.env.HASH_TALK_DATABASE_URL);"
if phase=='before':
    record.write_text(json.dumps(social.snapshot()));record.chmod(0o600)
elif phase=='after':
    # This test applies only 061→062; later repository migrations are separate transitions.
    with tempfile.TemporaryDirectory() as directory:
        candidate=Path(directory); target=candidate/'src/server/database/migrations'; target.mkdir(parents=True)
        for path in sorted((root/'src/server/database/migrations').glob('*.sql'))[:62]:
            shutil.copyfile(path,target/path.name)
        social.verify_migration(candidate,json.loads(record.read_text()))
else: raise RuntimeError('Unknown test phase')
print(json.dumps({'phase':phase,'verified':True}))
