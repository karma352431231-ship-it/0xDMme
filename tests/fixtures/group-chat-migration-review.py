import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'infra/staging'))
import deploy_group_chat as group
import deploy_public_stickers as latest
# The test checks the group-chat schema after migrating to the latest version,
# whose capacity sources are those of the latest reviewed transition (115).
print(json.dumps({'schema': group.SCHEMA_CHECK, 'counters': latest.COUNTER_CHECKS, 'global': latest.GLOBAL_CHECK}))
