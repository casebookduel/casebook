#!/bin/sh
# Launch day, on the server, as root: check the $CASE address on chain, put it on the site (hero, footer, FAQ),
# rebuild, restart, and prove the live page shows it.
#   sh /opt/casebook/ops/set-ca.sh 0x<address>
set -eu
CA="${1:-}"
ROOT=/opt/casebook
ENV=/etc/casebook/site.env

python3 "$ROOT/ops/check_ca.py" "$CA"

grep -v '^NEXT_PUBLIC_TOKEN_CA=' "$ENV" > "$ENV.new" || true
echo "NEXT_PUBLIC_TOKEN_CA=$CA" >> "$ENV.new"
mv "$ENV.new" "$ENV" && chmod 644 "$ENV"

cd "$ROOT/site"
runuser -u casebook -- sh -c 'set -a; . /etc/casebook/site.env; set +a; node node_modules/next/dist/bin/next build' > /tmp/casebook-build.log 2>&1 \
  || { tail -n 30 /tmp/casebook-build.log; exit 1; }
systemctl restart casebook-site
for i in 1 2 3 4 5 6 7 8 9 10; do curl -fs -o /dev/null http://localhost:3000/ && break; sleep 2; done
if curl -fs http://localhost:3000/ | grep -qi "$CA"; then echo "live: the site shows $CA"; else echo "the site does not show $CA yet"; exit 1; fi
