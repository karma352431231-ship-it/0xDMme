"""Exact own-site capacity proxy change inside the existing deploy transaction."""

import hashlib
import os

import deploy_remote as base
import deploy_request_limit as requests

PROXY = requests.PROXY
TEMPLATE = 'infra/staging/nginx-https.conf'
MAX_CONFIG = requests.MAX_CONFIG
REMOVALS = (
    'limit_conn_zone $server_name zone=xdmme_connections:32k;\n',
    '    limit_conn xdmme_connections 16;\n',
    '    limit_conn_status 429;\n',
    '    limit_rate 256k;\n',
)
HOST = '        proxy_set_header Host 0xdmme.app;\n'
TRUSTED = (HOST + '        # Overwrite client input; the app trusts this only on its private Unix socket.\n'
           '        proxy_set_header X-0xdmme-Client-Address $remote_addr;\n')


def validate(config):
    proposal = config.get('capacity')
    if not isinstance(proposal, dict) or set(proposal) != {
            'path', 'old_content', 'new_content', 'old_sha256', 'new_sha256'}:
        raise RuntimeError('Exact private capacity proxy review required.')
    if proposal['path'] != str(PROXY):
        raise RuntimeError('Capacity proxy review targets another site.')
    for name in ['old', 'new']:
        content = proposal[name + '_content']
        if (not isinstance(content, str) or len(content.encode()) > MAX_CONFIG
                or hashlib.sha256(content.encode()).hexdigest() != proposal[name + '_sha256']):
            raise RuntimeError('Capacity proxy review size/hash differs.')
    expected = proposal['old_content']
    for line in REMOVALS:
        if expected.count(line) != 1:
            raise RuntimeError('Capacity proxy predecessor differs from review.')
        expected = expected.replace(line, '')
    if expected.count(HOST) != 1:
        raise RuntimeError('Capacity proxy host contract differs.')
    expected = expected.replace(HOST, TRUSTED)
    if (proposal['new_content'] != expected
            or proposal['new_sha256'] != config['files'].get(TEMPLATE)):
        raise RuntimeError('Capacity proxy change exceeds the reviewed template.')
    return proposal


def current(allowed):
    if (PROXY.is_symlink() or not PROXY.is_file() or PROXY.stat().st_nlink != 1
            or PROXY.stat().st_size > MAX_CONFIG or base.digest(PROXY) not in allowed):
        raise RuntimeError('Own capacity proxy changed since review.')


def review(config):
    proposal = validate(config)
    current([proposal['old_sha256']])
    return proposal


def expected_state(config, before):
    proposal = validate(config)
    return dict(before, files=dict(before['files'], **{str(PROXY): proposal['new_sha256']}))


def install(config, work, before):
    proposal = review(config)
    backup = work / 'capacity-proxy-before.conf'
    with backup.open('xb') as handle:
        handle.write(proposal['old_content'].encode())
        handle.flush()
        os.fsync(handle.fileno())
    backup.chmod(0o600)
    requests.write_config(proposal['new_content'].encode())
    base.run(['nginx', '-t'])
    base.run(['systemctl', 'reload', 'nginx'])
    expected = expected_state(config, before)
    base.preservation(config['baseline'])
    if base.own_state() != expected:
        raise RuntimeError('Capacity proxy installation changed unrelated own configuration.')
    return expected


def restore(config, before):
    proposal = validate(config)
    current([proposal['old_sha256'], proposal['new_sha256']])
    requests.write_config(proposal['old_content'].encode())
    base.run(['nginx', '-t'])
    base.run(['systemctl', 'reload', 'nginx'])
    base.preservation(config['baseline'])
    if base.own_state() != before:
        raise RuntimeError('Capacity proxy return could not be verified.')
