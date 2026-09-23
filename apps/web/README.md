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

Open http://localhost:18767. Passkey testing requires `localhost`, not the numeric
IP address. The server binds only to loopback and requires that
port to be free. The existing trading dashboard (18765) and learning lab (18766)
keep their servers. The consumer workspace reads the existing dashboard API through
its loopback-only middleware; keep the local Anvil and block helper running.

```sh
npm run build
npm run preview
```

Stop the dev server before starting the build preview, since both use 18767.
The production output is `dist/`. Fonts and dependencies are bundled locally;
the consumer page does not require a third-party CDN.

## Scope

- `/`: landing page, selectable event cards, shared-pool explanation and FAQ.
- `/login` and `/signup`: Mera passkey account creation and returning sign-in.
- `/account`: the integrated market workspace, positions and activity. Seven-day
  verified account login survives refresh. Signing access stays in memory for one
  hour and can be reopened with a passkey after refresh.
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

The user verified passkey signup and returning login on their device. This phase
adds server-verified cookie sessions and connects the existing local execution
engine to both Mera and browser wallets. The new Mera trading path still needs a
manual device round trip. Public trading, tradable conditionals and partner
completion remain pending. See [workspace guide](../../docs/CONSUMER_WORKSPACE.md) and
[Mera web authentication](../../docs/MERA_WEB_AUTH.md) for the identity contract,
session boundaries and manual device checks.

## Hosting later

Build with `apps/web` as the project root. `dist/` contains the frontend only.
Account persistence and the MVP need a backend; uploading static files alone is
not sufficient. The current API middleware deliberately works only in local
development. See the workspace guide before public deployment.
Configure an SPA fallback to `index.html` for `/login`, `/signup` and other
non-asset routes. Confirm deep-link refreshes after deployment. No domain or
hosting changes are made by the build. Production passkeys are restricted to
`https://flurbo.singu.online`. DNS and HTTPS hosting remain pending. Local test
passkeys are separate identities and only enabled by the development server;
`npm run preview` does not enable local account creation.

## Validation

`npm test` exercises the real Mera SDK and key derivation with mocked WebAuthn
responses. It does not replace testing on a real authenticator.
`npm run build` runs strict TypeScript checking and the production build.
Browser review should cover desktop and mobile layouts, both event toggles,
FAQ expansion, keyboard navigation/Escape, direct account routes and their
back links, the not-found route, and reduced motion. All interaction prices
on the landing page remain illustrative. The account workspace reads real local
contract quotes and can submit explicitly reviewed local test transactions.
# Public Monad testnet deployment

Use the standalone `npm start` server and repository-root Render/Docker setup,
not `vite preview`, for hosting. See
[the deployment guide](../../docs/PUBLIC_TESTNET_DEPLOYMENT.md) for free hosting,
Redis secrets, DNS, wallet funding and the verified public contract manifest.
