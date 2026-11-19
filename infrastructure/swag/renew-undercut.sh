#!/bin/sh

set -eu

exec certbot renew --non-interactive --config /dev/null \
  --config-dir /config/undercut-acme/letsencrypt \
  --work-dir /tmp/undercut-acme \
  --logs-dir /config/undercut-acme/logs \
  --no-directory-hooks --deploy-hook 'nginx -s reload' "$@"
