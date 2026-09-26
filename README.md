# Todu

[![CI](https://github.com/kandulanikhilvarma/to-du/actions/workflows/ci.yml/badge.svg)](https://github.com/kandulanikhilvarma/to-du/actions/workflows/ci.yml)
[![Licence: Apache-2.0](https://img.shields.io/badge/licence-Apache--2.0-blue.svg)](LICENSE)
[![Live site](https://img.shields.io/badge/site-todu--kandula.vercel.app-0f766e.svg)](https://todu-kandula.vercel.app)

**Help is one tap away.** A personal emergency SOS and safety app for India,
plus its companion website and responder console.

> Todu is not a substitute for emergency services. In an emergency, call 112.
> Offline features are best effort and depend on your device, your network and
> nearby users.

Live preview: https://todu-kandula.vercel.app

## What is here

| Path | What it is | Verified by |
|---|---|---|
| `web/` | Next.js site in English, Telugu and Hindi, light and dark, plus the responder console (phone sign-in, live pings, ETA sharing, evidence photos). Deployed to Vercel. | `tsc`, `eslint`, `next build` |
| `mobile/` | Expo SDK 57 app: SOS state machine, cancel and duress PINs, offline queue, fallback ladder, siren and torch, live trail, Bluetooth relay, invites, push, who-is-coming, check-in timer, shake and fall trigger, fake call, Quick Settings tile and home widget, evidence photo, shareable incident timeline, light and dark themes, three languages. | `tsc`, `expo lint`, `expo-doctor`, 46 unit tests, release build run on an Android emulator |
| `supabase/` | Postgres + PostGIS schema and RLS, invites, missed check-in alerts (pg_cron), private evidence storage, `sos-fanout` (push + SMS) and `sos-relay` Edge Functions. | 26 RLS and grant tests on real Postgres, 16 fan-out and relay tests, `deno check` |
| `docs/` | Architecture, offline ladder, permissions, threat model, source spec. | |

## Architecture

```mermaid
flowchart LR
    subgraph Phone["mobile/ (Expo)"]
      SM["sos-machine.ts"] --> Q["queue (MMKV)"]
      SM --> L["ladder: SMS composer, 112, siren, torch"]
      SM --> R["Bluetooth relay"]
    end
    subgraph Supabase
      DB[("Postgres + PostGIS, RLS")]
      RT["Realtime broadcast sos:id"]
      FO["sos-fanout: push + SMS"]
      RL["sos-relay: signed intake"]
    end
    Q --> DB
    Q --> RT
    R --> RL
    RL --> DB
    DB --> FO
    RT --> C["web/ responder console (Vercel)"]
    FO --> C
```

Full component map, state machine and data model: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Run it

```bash
git clone https://github.com/kandulanikhilvarma/to-du.git && cd to-du
cd web      && npm install && npm run dev     # http://localhost:3000
cd mobile   && npm install && npx expo start  # needs a development build
cd mobile   && npm run check                  # state machine, PINs, phone, queue
cd supabase && npm install && npm test        # RLS as owner, responder, stranger
```

Neither app needs credentials to run. Without Supabase the console shows
labelled demo data, and the phone still runs every offline rung: SMS composer,
112 and the siren. Copy `web/.env.example` and `mobile/.env.example` to connect
a real project, then apply `supabase/migrations/` in order.

The mobile app uses native modules (MMKV, background location, secure store),
so it runs in a development build, not Expo Go: `npx eas-cli build --profile development`.

## The ethical constraint

The SOS path -- trigger, location broadcast, contact alert, 112 dial, beacon --
is free forever for everyone. Paid tiers cover convenience and depth only.

## Server setup

Everything below is optional; the phone runs every offline rung without it.

```bash
supabase link --project-ref <ref>
supabase db push                                  # migrations 0001-0009
supabase functions deploy sos-fanout sos-relay
supabase secrets set TODU_CONSOLE_URL=https://todu-kandula.vercel.app/dashboard   MSG91_AUTH_KEY=... MSG91_SOS_TEMPLATE_ID=... MSG91_SAFE_TEMPLATE_ID=...   MSG91_NAME_VAR=name MSG91_LINK_VAR=link          # names as in your DLT templates
```

For the database to request fan-out on its own, store `project_url` and
`service_role_key` in Vault (Dashboard > Vault). Without them the trigger is a
no-op and the app requests fan-out itself; either way it sends once.

Push needs an EAS project id (`npx eas-cli init`) so phones can get Expo push
tokens. Bluetooth relay needs a Bridgefy licence key in
`EXPO_PUBLIC_BRIDGEFY_API_KEY`. MSG91 SMS needs TRAI DLT registration of the
sender and both templates; until then SMS is logged as skipped, never as sent.

## Known gaps

Stated plainly, because a safety app that oversells itself gets someone hurt:

- **No voice calls.** MSG91 does not publish its voice API, and a guessed
  request would fail silently in an emergency. Push and SMS are built.
- **Run on an emulator, not a phone.** A release build (x86_64) installs and
  launches on an Android 16 Pixel 6 emulator with no crash or JS error. It has
  not run on a physical device, so GPS, SMS, calls, torch and Bluetooth are
  untested on hardware. The Stage 0 gate in `docs/PERMISSIONS.md` (24 hours of
  background location on MIUI and ColorOS) is still open. Building on Windows
  needs `plugins/with-short-object-paths.js`: gesture-handler's codegen
  otherwise produces a C++ object path over the 260-character limit.
- **Bluetooth relay and torch are built, not field tested.** The relay needs a
  Bridgefy licence and a second Todu phone within about 100 m; the torch relies
  on a hidden camera view and reports itself only once the camera is ready.
- **Edge Functions are deployed but have not sent a real alert yet.** Both
  run on the live Supabase project (Mumbai) and their cores are unit tested
  against the documented Expo and MSG91 formats. Push waits on an EAS project
  id, SMS on DLT registration, and phone sign-in on an SMS provider in
  Supabase Auth.
- **Some triggers work only while Todu is open.** Shake, fall detection and
  the fake call run in the foreground: an all-day background accelerometer
  needs a foreground service that Play penalises. The Quick Settings tile
  unlocks the phone first, so the medical profile is never shown to whoever
  holds it. Power-button presses belong to Android's own Emergency SOS, and no
  app can write to the lock-screen medical ID.
- **Check-in reminders can be late.** Local notifications are subject to
  Android Doze. The server copy (signed in, checked every minute by pg_cron)
  is what alerts the circle when the phone is off.
- **Evidence photos upload only when online and signed in.** Otherwise the
  incident timeline says so; there is no offline photo queue yet.
- **Legal pages are drafts,** English only, and say so on the page.
- **Satellite SOS and silent SMS** are not buildable by any third party. See
  `docs/OFFLINE.md`.

## Deviations from the source specification

- The spec targets **Expo SDK 54**; `mobile/` uses the current **SDK 57**.
- Styling uses plain `StyleSheet` with shared tokens in `mobile/lib/theme.ts`
  rather than Unistyles or NativeWind.
- `nearby_responders()` was removed: it could not work under RLS. Nearby
  dispatch (Stage 3) needs an explicit, opt-in presence table.
- Appearance follows the phone (light or dark) by default, where the spec
  says dark by default; dark stays the fallback, and both are in Settings.
- Crash detection is fall detection (free fall then impact) while Todu is
  open, and it only starts the countdown.

## Licence

Apache-2.0. Chosen over MIT for its explicit patent grant and its warranty and
liability disclaimers, which matter for a safety application.

---

[LinkedIn](https://www.linkedin.com/in/nikhilvarmakandula) · [Email](mailto:kandulanikhilvarma@gmail.com) · [Portfolio](https://kandula.studio)
