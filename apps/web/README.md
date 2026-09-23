# Flurbo consumer website

Faithful implementation of the user-approved Manus design, from the supplied
`Design Flurbo editorial website and authentication previews.zip`. The original
React pages and styles provide the visual foundation: Space Grotesk, Cormorant
Garamond, warm ivory, forest green, lime, mint/lilac event cards and editorial
sections. This app runs independently of Manus hosting; it includes no Manus
badge, platform runtime, analytics script or account dependency.

## Run locally

From the repository root (PowerShell or Git Bash):

```sh
cd apps/web
npm ci
npm run dev
```

Open http://127.0.0.1:18767. The server binds only to loopback and requires that
port to be free. The existing trading dashboard (18765) and learning lab (18766)
keep their own servers and wallet/API boundaries.

```sh
npm run build
npm run preview
```

Stop the dev server before starting the build preview, since both use 18767.
The production output is `dist/`. Fonts and dependencies are bundled locally;
the consumer page does not require a third-party CDN.

## Scope

- `/`: landing page, selectable event cards, shared-pool explanation and FAQ.
- `/login` and `/signup`: clearly labelled account previews. No credentials,
  passkeys or wallet signatures are requested and no account is created.
- Unknown routes render a recovery page with a working home link.
- GSAP owns section entrance animations. Framer Motion owns selection feedback,
  result changes and FAQ expansion. Both respect reduced motion.
- Mobile navigation supports keyboard focus, Escape, link selection and outside
  clicks. The layout supports browser zoom; fonts ship with their licenses in
  `public/licenses/`.
- Consumer copy must not use em dashes or emoji. Use vector icons where useful.
- Both illustrative events start selected. The result label and selection count
  distinguish combined, single-event and empty states. Orbit markers share SVG
  coordinates with their rings so their centers stay on the lines when resized.

This consumer shell does not establish public trading, Mera authentication,
conditional-claim trading or completed partner integrations. Existing chain
clients and signing controls remain in `apps/dashboard` and `apps/mobile`.

## Hosting later

Build with `apps/web` as the project root and publish `dist/` on a static host.
Configure an SPA fallback to `index.html` for `/login`, `/signup` and other
non-asset routes. Confirm deep-link refreshes after deployment. No domain or
hosting changes are made by the build. Mera passkey setup for
`flurbo.singu.online` remains a separate integration milestone.

## Validation

`npm run build` runs strict TypeScript checking and the production build.
Browser review should cover desktop and mobile layouts, both event toggles,
FAQ expansion, keyboard navigation/Escape, direct account routes and their
back links, the not-found route, and reduced motion. All interaction prices
and outcomes remain illustrative; this page does not submit trades.
