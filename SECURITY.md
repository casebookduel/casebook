# Security

Found a security problem? Tell us privately through GitHub's vulnerability reporting (the Security tab of this
repository). Public issues are for everything else.

In scope: the site and its API (`site/`), the runners (`m0/`, `m1/`), the seal contract (`chain/`) and the memory
engine (`engine/`).

The agents use read-only chain tools and hold no keys. The sealer's key can only write a root for an hour that has
none; a written root can never be changed.
