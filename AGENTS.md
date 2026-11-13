# Project guidance

This is an Arabic, right-to-left operations application: Next.js in `client/`,
NestJS/Prisma in `server/`, and an Android app using the same frontend through
Capacitor. Preserve the existing branding, Arabic content, reporting/printing,
API contracts, and native notification behavior.

## Modern web development

Use the repository's [Modern Web Guidance skill](.agents/skills/modern-web-guidance/SKILL.md)
before changing web UI or browser behavior. Retrieve the relevant guides, inspect
the surrounding code, and verify the resulting behavior; a scanner match alone
is not sufficient evidence of a defect.

**Browser support:** Baseline Widely available. Support the Capacitor Android
WebView too. Newer features may be progressive enhancements only, with a usable
fallback. Do not enable experimental features or origin trials by default.

- Prefer semantic HTML and native browser interactions. Keep all interactive
  controls keyboard accessible and give inputs persistent, associated labels.
- Respect reduced motion and browser zoom. Keep focus visible and preserve RTL.
- Use `NativeModal` for compatible modal content. Components that portal popups
  to `document.body` need their portal targets adapted before moving inside a
  native dialog. Native modals must keep their name and safe initial focus.
- The Tailwind animation utility plugin only enables animation when the user
  has no reduced-motion preference. Keep static states visible and usable.

## Verification

Run commands from their respective package directories:

- Frontend: `npm ci`, `npm run build`, and `npm run test:e2e` for browser behavior.
  The browser tests mock API responses; they do not need production credentials.
- Android frontend: `NEXT_EXPORT=true npm run build` (set the environment
  variable using the current shell's syntax).
- Backend changes: `npm test` and `npm run build` in `server/`. Database
  integration tests require the dedicated test database described in CI.
- Modernization scan, from the repository root:
  `npx --yes modern-web-guidance@1.0.0 legacy-scan client/src --json`.
  This covers a subset of guides; manually verify findings and retain intentional
  fallbacks. Never remove correct code just to make the scan empty.

See [MODERN_WEB_GUIDANCE.md](MODERN_WEB_GUIDANCE.md) for installation and upkeep.
