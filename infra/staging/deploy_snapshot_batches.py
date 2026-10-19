"""Bounded keyset fingerprints for the three reviewed large predecessor tables."""
import json

KEYS = {
    'message_references': [('message_id', 'uuid'), ('account_id', 'uuid'), ('device_id', 'uuid')],
    'matrix_one_time_keys': [('account_id', 'uuid'), ('device_id', 'uuid'), ('id', 'text')],
    'message_changes': [('account_id', 'uuid'), ('revision', 'bigint')],
}

# Only digests, byte lengths and pagination keys enter this process. Private
# record values stay in PostgreSQL. A fixed-width digest stream avoids a large
# string_agg; the original node/SQL deadlines and 64 MiB Node heap still apply.
SCRIPT = """
async function fingerprintTable(client,name,keys,budget) {
 const hash=createHash('sha256'),columns=keys.map(([key])=>'t.'+key);
 let cursor=null,count=0;
 while(true) {
  const values=cursor?[...cursor]:[];
  const where=cursor?' WHERE ('+columns.join(',')+')>('+keys.map(([,type],i)=>'$'+(i+1)+'::'+type).join(',')+')':'';
  const limit=Math.min(1000,budget.rows-count+1);values.push(limit);
  const query="SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS digest,"+
   'octet_length(to_jsonb(t)::text) AS bytes,jsonb_build_array('+columns.map(key=>key+'::text').join(',')+') AS key'+
   ' FROM hash_talk.'+name+' t'+where+' ORDER BY '+columns.join(',')+' LIMIT $'+values.length;
  const page=(await client.query(query,values)).rows;
  for(const row of page) {
   count++;budget.bytes-=Number(row.bytes);
   if(count>budget.rows || budget.bytes<0)throw new Error('Paged snapshot resource budget exceeded.');
   hash.update(row.digest,'ascii');cursor=row.key;
  }
  if(page.length<limit)return {count,hash:hash.digest('hex')};
 }
}
"""


def snapshot(node, preamble):
    script = """
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const pg=createRequire('/var/lib/0xdmme/data/release/package.json')('pg');
""" + preamble + SCRIPT + """
const client=new pg.Client({connectionString:url.href,connectionTimeoutMillis:3000,query_timeout:15000,statement_timeout:12000});
try {
 await client.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const result={},budget={rows:100000,bytes:128*1024*1024};
 for(const [name,keys] of Object.entries(""" + json.dumps(KEYS) + """))
  result[name]=await fingerprintTable(client,name,keys,budget);
 await client.query('ROLLBACK');console.log(JSON.stringify(result));
}finally{await client.end();}
"""
    return json.loads(node(script))
