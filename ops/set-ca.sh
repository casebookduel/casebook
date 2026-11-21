#!/bin/sh
# Launch day, on the server, as root: check the $CASE address on chain, put it on the site (hero, footer, FAQ),
# rebuild without serving a half-written build, and prove the live page shows it.
#   sh /opt/casebook/ops/set-ca.sh 0x<address>
set -eu
umask 077
CA="${1:-}"
ROOT=/opt/casebook
ENV=/etc/casebook/site.env
DEV=${DEV:-0x473292b66bDd478e8Cc5c7E902de06b39c8C4919}   # the launch wallet: the address must be its token

python3 "$ROOT/ops/check_ca.py" "$CA" --creator "$DEV"

grep -v '^NEXT_PUBLIC_TOKEN_CA=' "$ENV" > "$ENV.new" || true
echo "NEXT_PUBLIC_TOKEN_CA=$CA" >> "$ENV.new"
# written in place, so site.env keeps its mode (640) and group: it holds the case model key
cat "$ENV.new" > "$ENV" && rm -f "$ENV.new"

sh "$ROOT/ops/rebuild-site.sh"
if curl -fs http://localhost:3000/ | grep -qi "$CA"; then echo "live: the site shows $CA"; else echo "the site does not show $CA yet"; exit 1; fi
