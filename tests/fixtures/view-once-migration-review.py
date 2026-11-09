import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'infra/staging'))
import deploy_view_once as once
print(json.dumps({'schema': once.SCHEMA_CHECK, 'counters': once.COUNTER_CHECKS, 'global': once.GLOBAL_CHECK}))
