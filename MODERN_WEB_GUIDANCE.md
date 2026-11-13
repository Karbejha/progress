# Modern Web Guidance

Installed from Google's official Modern Web Guidance 1.0 release using
`npx --yes modern-web-guidance@latest install`. The project-local skill and its
guides live in `.agents/skills/modern-web-guidance/`; `skills-lock.json` records
their upstream source and content hash. This is development guidance, not a
runtime dependency of the application.

The upstream Apache 2.0 license and third-party notices are preserved in
[`third_party/modern-web-guidance/`](third_party/modern-web-guidance/).

Official references:

- [Release announcement](https://developer.chrome.com/blog/modern-web-guidance-v1)
- [Installation and browser support](https://developer.chrome.com/docs/modern-web-guidance/get-started)
- [Modernization workflow](https://developer.chrome.com/docs/modern-web-guidance/modernization-workflow)

## Use and maintenance

The skill is available to compatible coding agents on their next turn. Ask, for
example: `Use Modern Web Guidance to modernize the frontend, verify scanner
findings, and preserve the project's Baseline Widely available target.`

From the repository root (PowerShell users can use `npx.cmd`):

```sh
# Reproduce this modernization's deterministic scan.
npx --yes modern-web-guidance@1.0.0 legacy-scan client/src --json

# Look up guidance before changing a UI pattern.
npx --yes modern-web-guidance@latest search "confirmation modal dialog"
npx --yes modern-web-guidance@latest retrieve dialog

# Refresh the installed guidance, then review the resulting changes.
npx --yes modern-web-guidance@latest update
```

The scanner checks about 20% of the guide catalog. It is an audit aid, not a
substitute for keyboard, touch, accessibility, or performance testing. Review its
`keepWhen`/`dropWhen` rubrics before changing a match. For example, a new-password
field must not be converted to `current-password` merely because a sign-in rule
matched it.

The CLI supports opting out of anonymous usage telemetry with
`DISABLE_TELEMETRY=1` in the shell environment.

## Applied improvements

- Explicit labels, field names, password-manager tokens, keyboard-operable
  password visibility controls, and accessible account-form messages.
- Shared native dialogs for confirmation and compatible detail views, with
  browser-managed focus containment and inert background content.
- Keyboard focus indicators, usable browser zoom, and animations enabled only
  for users without a reduced-motion preference. Color feedback remains active.
- Browser regression checks alongside the normal frontend production build.

### Guide-backed implementation choices

- `forms`: I kept native form constraints and made password visibility controls
  reachable by keyboard ("provide an accessible toggle").
- `autofill-sign-in-form`: I gave credentials explicit field associations and
  kept existing-password autofill ("stable `name` or `id` value").
- `autofill-sign-up-form`: I marked newly assigned passwords with `new-password`
  ("new-password prevents password managers from auto-filling an existing password into this field").
- `accessibility`: I connected labels and icon actions explicitly, and used
  `aria-labelledby` for modal titles ("This avoids duplication, improves maintainability, and translates better.").
- `dialog`: I focus Cancel first in destructive confirmations and use native
  modality ("safe action (such as Cancel or Keep)").
- `light-dismiss-a-dialog`: I preserve explicit close actions and include a
  drag-safe pointer fallback for browsers without `closedBy`
  ("Ensure that there is always a close button visible").
- `prevent-page-scroll-under-modal-dialog`: I use CSS containment without
  overwriting legacy parent scroll state; it remains a progressive enhancement
  on older browsers ("treat scroll containment on non-scrollable scroll containers as a progressive enhancement").
- `motion`: I enable persistent animation only inside `no-preference`, preserve
  color feedback, and keep the visible static state ("Keep the final state").

Complex overlays with body-level popup portals still need coordinated migration;
moving those containers alone would put their popups behind the browser's top
layer. Strict CSP, passkeys, and other architectural changes require their own
implementation and deployment validation; installing guidance does not enable
them automatically.

## Verification commands

In `client/`, run `npm ci` and `npm run test:e2e`. The configuration uses installed
Chrome on Windows, and Playwright Chromium on other platforms. To install the
browser used by Linux CI, run `npx playwright install --with-deps chromium`.
`PLAYWRIGHT_CHANNEL` can select an alternative installed browser channel.

The browser checks use mocked API responses and include desktop and Pixel 7
viewport/touch emulation. This does not replace testing an Android APK on a real
device or testing other browser engines. CI repeats these tests and retains
traces if a check fails.

Production checks: `npm run build` for standalone web output, and
`$env:NEXT_EXPORT='true'; npm.cmd run build` in a fresh PowerShell process for
the Capacitor static export. Do not run those two builds against the same
output directory concurrently.

Verified on Windows during this change:

- Standalone production build and TypeScript: passed.
- Capacitor static export build: passed.
- Browser tests: 16 passed across desktop Chrome and Pixel 7 emulation; the
  command starts and stops its own local server successfully.
- Existing server tests: 156 passed, 9 database-dependent checks skipped because
  no dedicated integration database was configured, 0 failures.
- Deterministic MWG scan: 0 findings across its 33 supported guides / 35 rules.
- Mobile confirmation and long announcement layouts: screenshots inspected.
