"""Run the real release verifier against an isolated local migration fixture."""
from pathlib import Path
import json
import os
import subprocess
import shutil
import sys
import tempfile
import urllib.parse

root, phase, record = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
url = urllib.parse.urlparse(os.environ['HASH_TALK_DATABASE_URL'])
if url.hostname not in ['127.0.0.1', 'localhost'] or not url.path.startswith('/hash_talk_test_profile_directory_'):
    raise RuntimeError('Exclusive disposable test database required.')
sys.path.insert(0, str(root / 'infra/staging'))
import deploy_profile_directory as directory
import deploy_blocks45 as backups


def node(code):
    code = code.replace("createRequire('/var/lib/0xdmme/data/release/package.json')",
                        'createRequire(' + json.dumps(str(root / 'package.json')) + ')')
    return subprocess.run([os.environ['DIRECTORY_TEST_NODE'], '--input-type=module', '-e', code],
                          check=True, capture_output=True, timeout=30).stdout


def pg(args, **_options):
    env = dict(os.environ, PGHOST=url.hostname, PGPORT=str(url.port or 5432),
               PGUSER=urllib.parse.unquote(url.username or ''), PGDATABASE=url.path[1:],
               PGPASSWORD=urllib.parse.unquote(url.password or ''))
    return subprocess.run(args, env=env, check=True, capture_output=True, timeout=30).stdout


backups.node = node
backups.pg = pg
backups.URL_CHECK = 'const url = new URL(process.env.HASH_TALK_DATABASE_URL);'
if phase == 'before':
    record.write_text(json.dumps(directory.snapshot()))
    record.chmod(0o600)
elif phase == 'after':
    # This historical rehearsal ends at 093, even after newer migrations are
    # added. Supply that exact source sequence to the unchanged release guard.
    with tempfile.TemporaryDirectory(prefix='0xdmme-directory-sources-') as temporary:
        candidate = Path(temporary)
        migrations = candidate / 'src/server/database/migrations'
        migrations.mkdir(parents=True)
        for path in (root / 'src/server/database/migrations').glob('*.sql'):
            if int(path.name[:3]) <= 93:
                shutil.copyfile(path, migrations / path.name)
        directory.verify_migration(candidate, json.loads(record.read_text()))
else:
    raise RuntimeError('Unknown test phase.')
print(json.dumps({'phase': phase, 'verified': True}))
