# Third-party notices — linknred-payments-sdk

`@linknred/payments` is distributed under the MIT license (see `LICENSE`). This file
covers **only what this repository publishes and depends on**. It is generated from this
repository's `package.json`, not from the LinknRed web application (Tier C), so it does not
list runtime components that are never shipped here.

## Runtime

The published bundle has **no bundled dependency**. `ethers` is an optional peer
dependency, resolved by the integrator:

| Component | Range | License | Notice |
| --- | --- | --- | --- |
| ethers | ^6.13.0 (peer, optional) | MIT | Copyright (c) 2016-2024 Richard Moore |

## Development and build

| Component | Range | License |
| --- | --- | --- |
| ethers | ^6.17.0 | MIT |
| tsup | 8 | MIT |
| typescript | ^5.4.0 | Apache-2.0 |
| vitest | ^1.6.0 | MIT |

TypeScript is Apache-2.0; the obligation is attribution and change notice, satisfied by
this file. No dependency in this repository is under a copyleft license (no GPL, LGPL,
AGPL, MPL or SSPL).

## Not present in this repository

Fonts (Sora, Manrope — SIL OFL 1.1), React, Tailwind, Radix UI and Supabase client
libraries belong to the LinknRed web application, which is not published. They are
therefore intentionally absent from this notice.

Full license texts are available in each package directory of the installed dependency
tree, or on request at `factory@linknred.com`.
