import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'infra/staging'))
import deploy_group_chat as group
print(json.dumps({'schema': group.SCHEMA_CHECK, 'counters': group.COUNTER_CHECKS, 'global': group.GLOBAL_CHECK}))
