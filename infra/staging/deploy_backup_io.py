"""File-backed restore input: complete SQL without a size ceiling or RAM copy."""

import os
import tempfile


def restore_transaction(work, dump, execute, *, rollback):
    # NamedTemporaryFile creates a private 0600 file inside the own deployment.
    # A failed decode never reaches psql; its transaction has no commit marker.
    with tempfile.NamedTemporaryFile(prefix='restore-', suffix='.sql', dir=work) as sql:
        sql.write(b'BEGIN; DROP SCHEMA hash_talk CASCADE;\n')
        sql.flush()
        execute(['pg_restore', '--no-owner', '--no-acl', '--file=-', str(dump)], output=sql)
        sql.write(b'\nROLLBACK;\n' if rollback else b'\nCOMMIT;\n')
        sql.flush()
        os.fsync(sql.fileno())
        sql.seek(0)
        execute(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--quiet'], input_file=sql)
