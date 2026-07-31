# Security policy

## Scope

OpenSurveillanceDB is an open, non-commercial civic database of visible public
surveillance infrastructure. This policy covers vulnerabilities that could:

- expose contributor identities, pending submissions, evidence, or moderation data;
- expose database credentials or hosting secrets;
- permit unauthorized changes to published records or to the moderation queue;
- break the fail-closed behaviour of the moderation endpoints;
- break the public-data boundary (private fields such as `notes`, pending
  records, or reviewer attributes leaking through the API, exports, or UI).

The project is **privacy and safety by design**: if a finding touches personal
data (pending submissions, evidence, correction requests, moderator identity
attributes), it is also a personal-data incident and is handled under
[docs/legal/BREACH_PROCEDURE.md](docs/legal/BREACH_PROCEDURE.md).

## Reporting a vulnerability

### Private route (security reports) — preferred

Use the GitHub **Private Vulnerability Reporting** flow, which creates a
confidential advisory only the maintainers can see:

https://github.com/Syax89/open-surveillance-db/security/advisories/new

Do **not** open a public issue for a vulnerability. Public issues are for
feature discussion and non-sensitive bug reports only.

For payloads that contain personal data, evidence, or operational details,
**encrypt them with the project PGP key below** and include the ciphertext in
the advisory. Do not send raw sensitive data through unencrypted channels.

### PGP key

```
-----BEGIN PGP PUBLIC KEY BLOCK-----

mQINBGoTEJUBEADhABBSXdiD9L0umKAoJIzTfmULYsplwJICW9R/TAF6vu8BHmyI
4ZnjmbXsmQOnAaJiqt/E6wsF0i82NcO2djKmJc5eHj1ucwfB2GB1GvDAQcCwpWRl
jLSywqe4zOx/1Vgwo/t8JoBsDgR0+U7ShXYL3p2RpUfL+gzgZhyj2xQwWsooh/lv
Bx2nb9b/CxYWZc/hQziAsiX2vHcDXEzo538qWMf2pnQXEBmA/E/RAEPuIdi5rmQu
rBUGXd6lRLpVLe6FF9s8W0R65wT0mJUUwR0nP/ttF8lec19t6QnkcMMpFTRL7bwk
JHXP/bJTabOxP3GXv43GHvJcyHpt0g0ij43WUtJsBSdLEu5f8inH3x9+pvDhagff
h5ML3qww/bSlW/Wxru9c4CbmfLYRKX0prwNcx/UyRrgS0JhUPqqVecHhabpdK7YQ
neThhvCy+WkZnmXLN3UuOyVyILaXzHc+CevFBcKAVTRC0ICSozUyQkRsSm91VLla
GLv4ExtSXucOR/No6gq3jPnpB/PIPLa5XooVC50cfPHEECRgoS/HdjWLPwSq51p5
Hlk2nGNXsVwRQnkUhUiD1/BG6v0GmAO2dSDGUBnwGpmSZ/Zz2Ku1bF3CwXgsxueP
24A8MxnRKQXqXiF8MyLCKMq+4MDMC49OY4rmfMRns+mOnrtlWXedyIpFkQARAQAB
tCJIZXJtZXMgQWdlbnQgPGhlcm1lc0BzaW1vbmUubG9jYWw+iQJPBBMBCgA5FiEE
mTwQX2VO+K4P9VC5Qj/0G/8BffUFAmoTEJUDGy8EBQsJCAcCBhUKCQgLAgQWAgMB
Ah4BAheAAAoJEEI/9Bv/AX3157cQANymlEzYK3yugZ1gqvKRzOiNA8ssO0IgILxc
ZLnI/E0J9abQR1fw+DWAUt/nUpQc5CvLqIqLqJCE5r+2KHJ/XneW/wVZBLanHOr7
rWoDS+v3aRdvxtf+r8hOe08Kpd+V4+ko2TMxY5w+Twpi+s1QncKk1isIE14Nuyvv
YTuwA9SyVBmrqStC9kxFLdAk82DMwG7DgDKjx4jMtJGpQMZ7NZTxrOJRz8Q6Y3EQ
1668b5oU3FVC93NcjdkZPCg10+UwBV5jrHJwEWMbuKo9r2B7XBusX0aCAhxc5v8b
Ux42hLBWV0VxlBUOBtG3n8tzf2OmIsGBDr0N29ZYKEVEqS6NbwOUTIWBSuK96Jnd
x8kh5YqamW4a5VsuQ8pAvAtZPqiBLvjkOZMw28LEvOqteeuKOfaSyC8SHRxw0X7q
HOPUOfRONjjENjaN0FNcclRpO4zighmu+TciOamgxSJm9ax6aNMz/j8a6LiKlSCq
qbbfCiUmxt2r4gLX4j0ZmOoc2H+iyoxqel6NcBniNg8rTo4z2g1iX81cpW+w6pX9
wm/lELQMLwB1gsmjGwzDIQyZLuQ9vyq8IyOCWFfb/VtjZlKqOyWhroKUEvHztNs/
nvbM0c26BmooAwUlK+cBzqMeaAY1VVRmuVRNZlgbPcJenokeUCDFPjZrb2HSkDY7
Vgkp5jl7uQINBGoTEJUBEADNaRQYm30QENIYTk040+zweE8bI31RMhRyq3E4EZR/
B4YZQbW4J6GAx3UENF7AE2qzFeT11bKafC6yNhU6j7oYhVAUAkfsUIjhwGSS/hcS
q3khR72yRE20XLCnWOEGv1GzGikC1FOlQD69+m02x9wXcNGje+xmb8x9F79tk+gr
EC4VmxN6RSdFoiP52EYACAErldcVJZzGuuj8xChvxwFML74+PsQvkaH932nxSKO7
dubu/a2NT4UV/yPZYwXakMJrZyJzJ15z+UDBJ3yWGY8LYqVbaITjzdfxTl4CmGFy
Ckt/uuCt/ikXSOJfb+jCOlUDOhecUZrCWzvAcIzTDbKkiQBpTJvKYAK9QXInkqy0
rEdl8Nblb2JqAgIQVyixt74AseS8vf8FCmOBebym0xHopErKh7IzD8lSy10fZfXw
3FMJ3DEIhgCi31Qmo5hQ58Mwv0OLlGdzh+wA+pdiCMiB+xs6+ZxNba4w9IiRDFZC
275oud8GX4qBHVx6HFwg6Xcv2lrk//lXUd56KwBzOzGlNY0Y9TEKShrxBUaknVbh
x+w88wVykE9uUiGQPZaIW2D8zkmcKtPaEYve0RodTqRewRnVnaNSMddfqlyyKfNU
TlVjh+i+XOHYfBioxsfpPl/z9JxosK49o8aG/2vtLP5ZBvhrzZMFQH/5VYjblJQj
aQARAQABiQRsBBgBCgAgFiEEmTwQX2VO+K4P9VC5Qj/0G/8BffUFAmoTEJUCGy4C
QAkQQj/0G/8BffXBdCAEGQEKAB0WIQRF92v1jzghrhdKgssuWW0tqTBjZQUCahMQ
lQAKCRAuWW0tqTBjZU2PEAC0vOVp5K34u6gZTpGuCRx/88WNeUzABYWkkJddLF44
o0y2wQKbhOIdBSDA/dcSFi4pR0/19xfTaG24r/VzhIL2NYPDuKJBwyNTFl/znpBO
XQUwCTUK0i7vfD9h7e4PD8D1icTXI3q1oCFeO1NeW1OaxvhLr8X6ug8hZ5n/yr4O
Neo85mU7fOHSKtvH52Yq8I4YgMzENtj5O96RxR9jh9qXG2PLlg+dME1G3iMu6fBA
aCWCL6ydfAs/X7lupVBsn199+2I2oV174/Sv86Xapk5wzh3+zmoV3ikAi77af7B7
+J3oa5mHps8BTJRwPXI6oXn60gDl8iRjqHjTSsN7WXuGsBa6xcPAIMW60ap+eLi/
DGenHXU5hTuIBgeQLVp2UfdogoyT+bf/UGWWRwGrWx8wwCrWLV/pIZUzcRoTtwgb
FtmX6gHtTGoqLHqR4VQhulHtB/+davjnuTxtZBZx40chG/VqbB7NnQQpavcj8I/E
aRLxS//S+iXlWFLPmMdcKS+Kg32tuvtbRxxd58UbeaD116dT+iqxj0McynJZJe2x
BIVD/faKwhgAQSwkkq2JwL+n5XWdFMylLg3kgVOGScmct/z9RGNRdjnpRhI9KkEo
AtXeA8fiivB/HirXjSK4MPk8Exd/twozpd6pcSUFytnrtlgt+pu91Hq3KITduit/
crc9EACOMUbyGj+U1NA48NF2rJ8EmLUdbwOBz8aM+q7OVrqoLIEhAKHz/eDfJPKJ
WB2JMHpfBe3OZrildU/FiT6Rt00AzkUlZAYvslutjVzvaZygQuRbnUm5XRuxPzvL
rkVWBw+vTOKe/bXIeukhPTixjHuhh26bXufGPoSVE7Qg8Zic4UzedNI5J3NulVZ2
+P2yMWOkYJJNOHRKYLvyqDz5nKacydYJWAqFkOpPR9lWPiEl1eX5/PIBeahbnieT
fs0reE+0coQRSQlE9ulWCKDcoihGqhhUTWAoSiDD9Ih5gMZxiO2dE9V+qiws4Mck
gEipQLuvG6t7CjvFUfqdcfMhzGyBWUwSaj9/cZBtJR51GNgSLuYal/XqR3pHUFYl
Zef3ZFkhshs+9bnyXOcPi04gpBC2E9ELokE4S6CiO2kafgcgo7669XOs/og0OmdT
b45OTFls15qqvD2g8z0DVHz+IY5GFcJxld8wuL7O+aA9nH1WatngxcYmvUkJ23tZ
poNVmo2tlpZNpV0PqZcvz3N1SaUWq0m1qm0ynbGbXRkd2OSOgJ+azpDYt6uYkqBm
gkrJrOmgzOVEcuDlVXV1NMMoOEYoSdsbLed1M0MYB5cgZ1JaoSqdYpOOW6lyO3/Z
3hENAu4urGmg+9b1tc+RZTiR8BWvsXOqZ4FzG1zPXJDcOTSqpA==
=iPK7
-----END PGP PUBLIC KEY BLOCK-----
```

- Fingerprint: `993C 105F 654E F8AE 0FF5 50B9 423F F41B FF01 7DF5`
- Key id: `423FF41BFF017DF5` (RSA 4096, created 2026-05-24)
- The private key never leaves the maintainers' local GPG vault; the public
  key above is the only published form.

### What to include in a report

- Description of the vulnerability and its impact (what an attacker could do).
- Steps to reproduce, or a proof of concept, kept as small as possible.
- Which component (API, UI, worker, db, deployment) is affected.
- Any personal-data exposure — **encrypt it with the PGP key above** and do
  not include raw identities, evidence, or credentials in the advisory body.

### Response commitment

Targets (aligned with [docs/legal/MODERATION_SLA.md](docs/legal/MODERATION_SLA.md)):

| Event | Target |
|-------|--------|
| First response (acknowledgement + next step) | within 48 h |
| Substantive response / decision | within 14 days |
| Emergency: hide affected content | within 24 h |

If the report involves personal data, the incident handling in
[docs/legal/BREACH_PROCEDURE.md](docs/legal/BREACH_PROCEDURE.md) applies from
confirmation onward (Garante notification within 72 h for high-risk breaches).

## Public route (privacy requests)

The **correction / request-for-review form** on the site (correction form on
the home page, `app/api/corrections/route.ts`) remains the public route for:

- requests to correct, review, or remove a published record;
- privacy-related requests from data subjects (rights under the privacy
  notice, [docs/legal/PRIVACY_NOTICE.md](docs/legal/PRIVACY_NOTICE.md)).

These requests are non-public moderation requests and never contain security
exploit details.

## Current deployment status

The repository is public with CI (lint, type-check, tests, build, gitleaks,
npm audit). The always-on test site runs on a LAN-only container
(`osdb-test`, LXC 114, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)) and is
**not** exposed to the public internet. Do not treat it as a production
service, and do not load real reports into it.
