#!/bin/sh
# Rebuild the site without serving a half-written build. The new build is made in a copy (site-next) while the old
# one keeps serving; then the two folders are swapped and the site restarts (about a second). If the new build does
# not answer, the old one goes back. As root on the server:
#   sh /opt/casebook/ops/rebuild-site.sh
set -eu
ROOT=/opt/casebook
cd "$ROOT"
# reuse the previous build's folder, so rsync only copies what changed and the build keeps its cache
[ -d site-next ] || { [ -d site-old ] && mv site-old site-next || true; }
rsync -a --delete --exclude .next site/ site-next/
chown -R casebook:casebook site-next
if ! (cd site-next && runuser -u casebook -- sh -c 'set -a; . /etc/casebook/site.env; set +a; node node_modules/next/dist/bin/next build') > /tmp/casebook-build.log 2>&1; then
  tail -n 30 /tmp/casebook-build.log
  echo "rebuild-site: the build failed; the live site was not touched" >&2
  exit 1
fi
rm -rf site-old site-broken
mv site site-old && mv site-next site
systemctl restart casebook-site
ok=0
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do curl -fs -o /dev/null http://localhost:3000/ && { ok=1; break; }; sleep 2; done
if [ "$ok" = 0 ]; then
  echo "rebuild-site: the new build does not answer; putting the old one back" >&2
  mv site site-broken && mv site-old site && systemctl restart casebook-site
  exit 1
fi
echo "rebuild-site: live"
