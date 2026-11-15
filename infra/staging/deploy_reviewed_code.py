"""Runtime compatibility and exact database-file fingerprints."""
import json
from deploy_archive import digest

# Owner-reviewed dev-only NaCl transition, including rollback. Never a general
# allowance for dev dependencies; every other changed lock remains blocked.
PHANTOM_PROBE_LOCKFILES = frozenset([
    '4db68588987a5b5a1a3afedd09a6096a2c5ab51c37ac9f334af2cc06b8125092',
    'fac024d2596d80a4450f9ad46cc212e6b51e536f02062f630fd8c8c1adcc0be5',
])

# Installed-app tooling changed the development lock and removed probe-only
# overrides. The release keeps all 52 runtime lock entries byte-for-byte equal.
MOBILE_TOOLING_PACKAGES = frozenset({
    ('5273e4c87b2eadb0b545982c2401d54fb1e0fe3e116d28794c46b91daca07647',
     'a94082f173b3d553c15ea1c8b0db29452b7b79c41615c30478f0a924a12937db'),
    ('9ac5ac1bc308069462b1b055305653dd04b24270a0bce9b66627ee686d247150',
     '30939a5bb38c0b5f4a3c03f10a48e556c6b9d669c17e25332d18ab5ad657b8f5'),
})


def reviewed_lockfile_change(before, after):
    if frozenset([digest(before), digest(after)]) != PHANTOM_PROBE_LOCKFILES:
        return False
    return runtime_entries(before) == runtime_entries(after)


def runtime_entries(path):
    packages = json.loads(path.read_text())['packages']
    return {name: value for name, value in packages.items()
            if name and value.get('dev') is not True}


def reviewed_mobile_tooling(candidate, live):
    roots = (candidate, live)
    packages = frozenset((digest(root / 'package.json'), digest(root / 'package-lock.json'))
                         for root in roots)
    return packages == MOBILE_TOOLING_PACKAGES and (
        runtime_entries(candidate / 'package-lock.json') ==
        runtime_entries(live / 'package-lock.json'))


def database_files(root):
    directory = root / 'src/server/database'
    return {str(p.relative_to(directory)): digest(p) for p in directory.rglob('*') if p.is_file()}
