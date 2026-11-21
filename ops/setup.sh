#!/bin/sh
# One-time setup on a fresh Ubuntu 24.04 server, as root, after the project is copied to /opt/casebook:
#   sh /opt/casebook/ops/setup.sh
# Run it again after filling in /etc/casebook/runner.env; it is safe to repeat.
set -eu
ROOT=/opt/casebook

id casebook > /dev/null 2>&1 || useradd --system --home-dir "$ROOT" --shell /usr/sbin/nologin casebook
id casebook-seal > /dev/null 2>&1 || useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin casebook-seal
apt-get update -q
apt-get install -y -q ca-certificates curl python3 python3-pycryptodome rsync
if ! node -v 2> /dev/null | grep -Eq '^v(2[2-9]|[3-9][0-9])'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sh -
  apt-get install -y -q nodejs
fi

mkdir -p /etc/casebook
# site.env can hold the case model key, so only root and the casebook user can read it
[ -f /etc/casebook/site.env ] || install -m 640 -g casebook "$ROOT/ops/site.env.example" /etc/casebook/site.env
if [ ! -f /etc/casebook/runner.env ]; then
  install -m 600 "$ROOT/ops/runner.env.example" /etc/casebook/runner.env
  echo "Now put the OpenRouter key in /etc/casebook/runner.env (nano /etc/casebook/runner.env) and run this script again."
  exit 0
fi

mkdir -p "$ROOT/m1/out"
chown -R casebook:casebook "$ROOT"
cd "$ROOT/site"
runuser -u casebook -- npm ci --no-audit --no-fund

# the sealer: a root-owned copy with its own viem, run as its own user, so the site's user cannot change it
install -d -m 755 /opt/casebook-seal
install -m 644 "$ROOT/site/scripts/seal.mjs" "$ROOT/site/scripts/seals-artifact.json" /opt/casebook-seal/
if [ ! -d /opt/casebook-seal/node_modules/viem ]; then
  (cd /opt/casebook-seal && npm install --omit=dev --no-audit --no-fund --ignore-scripts --save-exact viem@2.57.16)
fi
# its key: made once, here, so it never leaves the server (mode 600, root only; only the address is printed)
if [ ! -f /etc/casebook/seal.env ]; then
  echo "Sealer address (fund it with about 0.002 ETH on Robinhood Chain, then see ops/README.md, Seals):"
  node /opt/casebook-seal/seal.mjs key /etc/casebook/seal.env
fi
runuser -u casebook -- sh -c 'set -a; . /etc/casebook/site.env; set +a; node node_modules/next/dist/bin/next build'

install -m 644 "$ROOT/ops/casebook-runner.service" "$ROOT/ops/casebook-site.service" "$ROOT/ops/casebook-seal.service" "$ROOT/ops/casebook-seal.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now casebook-site
# RUNNER=0 when the duel moves here from another machine: start it only after its latest results are copied
[ "${RUNNER:-1}" = 0 ] || systemctl enable --now casebook-runner
# sealing starts once the contract is deployed and its address is in seal.env
if grep -q '^SEAL_CONTRACT=0x' /etc/casebook/seal.env; then systemctl enable --now casebook-seal.timer; fi
systemctl --no-pager --lines=0 status casebook-site
echo "Site on http://localhost:3000; the Cloudflare tunnel points at it (ops/README.md)."
