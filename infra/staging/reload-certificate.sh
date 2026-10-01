#!/bin/sh
set -eu
# This hook belongs to our separate Certbot config, never shared renewals.
test "${RENEWED_LINEAGE:-}" = /var/lib/0xdmme/data/certificates/live/0xdmme.app
test -f /etc/nginx/sites-enabled/0xdmme-test.conf
/usr/sbin/nginx -t
/bin/systemctl reload nginx
