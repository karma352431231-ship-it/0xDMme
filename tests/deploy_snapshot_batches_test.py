"""Paged preservation fingerprints keep complete data and refuse excess work."""
from pathlib import Path
import json
import shutil
import subprocess
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy_snapshot_batches as batches


class SnapshotBatchTests(unittest.TestCase):
    def test_keyset_boundaries_preserve_large_revisions_and_detect_changed_rows(self):
        script = """
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
""" + batches.SCRIPT + """
const keys=[['account_id','uuid'],['revision','bigint']],base=9007199254700000n;
function fake(count,changed=-1) {
 let calls=0;
 return {get calls(){return calls;},async query(sql,values){
  calls++;const limit=values.at(-1);assert.ok(limit<=1000);
  const start=values.length===1?0:Number(BigInt(values[1])-base+1n);
  if(start)assert.ok(sql.includes('$2::bigint'));
  return {rows:Array.from({length:Math.min(limit,Math.max(0,count-start))},(_,offset)=>{
   const index=start+offset;return {digest:createHash('sha256').update('row-'+index+(changed===index?' changed':'')).digest('hex'),
    bytes:100,key:['00000000-0000-0000-0000-000000000001',String(base+BigInt(index))]};
  })};
 }};
}
const client=fake(1001),budget=()=>({rows:100000,bytes:128*1024*1024});
const result=await fingerprintTable(client,'message_changes',keys,budget());
assert.equal(result.count,1001);assert.equal(client.calls,2);
const changed=await fingerprintTable(fake(1001,1000),'message_changes',keys,budget());
assert.notEqual(changed.hash,result.hash);
await assert.rejects(fingerprintTable(fake(11),'message_changes',keys,{rows:10,bytes:10000}),/resource budget exceeded/);
await assert.rejects(fingerprintTable(fake(3),'message_changes',keys,{rows:100,bytes:200}),/resource budget exceeded/);
await assert.rejects(fingerprintTable({query(){throw new Error('Synthetic read failure');}},'message_changes',keys,budget()),/Synthetic read failure/);
console.log(JSON.stringify({passed:true}));
"""
        result = subprocess.run([shutil.which('node'), '--input-type=module', '-e', script],
            capture_output=True, check=True, timeout=15)
        self.assertEqual(json.loads(result.stdout), {'passed': True})

    def test_snapshot_returns_digests_only_with_fixed_limits_and_read_only_transaction(self):
        recorded = []
        result = batches.snapshot(lambda source: recorded.append(source) or b'{}', 'const url=new URL("postgresql://synthetic");')
        self.assertEqual(result, {})
        self.assertIn('REPEATABLE READ READ ONLY', recorded[0])
        self.assertIn('rows:100000,bytes:128*1024*1024', recorded[0])
        self.assertIn('query_timeout:15000,statement_timeout:12000', recorded[0])
