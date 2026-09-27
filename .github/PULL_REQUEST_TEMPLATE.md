## What and why

<!-- One or two sentences. Link the issue if there is one. -->

## Checklist

- [ ] The SOS path stays free and ungated (no paywall, login wall or flag).
- [ ] Every ladder rung still reports whether it actually delivered; no stub returns success.
- [ ] Anything touching the state machine, ladder, queue or permissions ships in a store build, not OTA.
- [ ] `mobile/lib/sos-machine.ts` changes have a new case in `sos-machine.test.ts`.
- [ ] No secrets; `SUPABASE_SERVICE_ROLE_KEY` never reaches a `NEXT_PUBLIC_` variable or the app bundle.
- [ ] New user-facing text is in `web/lib/i18n.ts` / `mobile/lib/i18n.ts` for en, te and hi.
- [ ] Red is used only for the live SOS state, and never as the only signal.

## Verified with

<!-- Paste what you ran: tsc, lint, npm run check, npm test, a device or emulator run. -->
