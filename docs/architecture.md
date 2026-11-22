# Architecture

| Path | Responsibility |
| --- | --- |
| `apps/web` | React account and campaign screens and a full-screen PixiJS shop using the harbor 2.5D scene, built with Vite |
| `apps/api` | Fastify HTTP API, Better Auth, database access and operator commands |
| `packages/game-core` | Deterministic game transitions, town and goods definitions, inventory accounting |
| `packages/contracts` | Shared Zod validation and command types |
| `infrastructure` | Local Compose, published images, deployment controller and ingress configuration |

The browser and API share an origin. Session cookies establish ownership. A host operator creates single-use email-bound invitation links that expire after 72 hours. The operator can issue password reset links that expire after one hour and delivers both kinds of links privately. There is no outbound email service.

PostgreSQL stores identity, campaigns, and command receipts. Drizzle maps data to the TypeScript application. Committed SQL migrations run before a candidate API starts. Hosted migrations must keep the previous API usable so that reverting application images remains safe.

Each campaign has a server-authoritative snapshot, rules version, and revision. The API validates command inputs, locks the campaign row in a transaction, checks ownership, and applies the domain transition together with its receipt. The client supplies a unique action ID and expected revision. A retry of the same accepted action returns the current snapshot without applying the command again. A stale revision is rejected so the browser can reload server state before it submits a new decision.

Random customer behavior derives from the campaign seed, town, and day. The browser renders the response and requests the next action. A reload resumes the saved phase, inventory, and day without relying on browser storage.

The [shop day design](game-design/README.md) describes the shop loop. The [shop room and books specification](game-design/shop-room-and-books.md) documents the Pixi scene and its controls; the Merchant Ledger redesign consolidates management navigation in React.

The shop loop keeps campaign snapshots on `rulesVersion` 1. Destination, Buying, Business, and Closing map to the existing stored phase values `travel`, `prepare`, `open`, and `report`, respectively. Extend the snapshot with optional game-loop fields and apply defaults when reading older saves. Keep the existing field shapes and meanings so the previous release can still read a campaign written by this release.

The persistent campaign ledger is an additive optional journal in the same authoritative snapshot. Record immutable market, purchase, display, customer, closing, and newspaper events in the game core so the browser can render inventory, performance, location and price history, events, and saved Gazette editions without reconstructing past publications from current rules. Customer sale records include the actual FIFO unit cost when available. New daily summaries store cash at opening and closing, remaining stock value, and conversion; older summaries leave these optional details absent. Existing saves without journal entries remain readable; transaction receipts continue to make retried commands idempotent.

Display setup supports an atomic four-slot configuration with 80%, 100%, and 120% presets. The baseline uses the midpoint of the town's estimated buyer range, rounded to the nearest gold. New shop openings allocate up to three owned units to each assigned display; display stock is stored separately from reserve allocation and sales consume one displayed unit using FIFO inventory costs. A `serve` command resolves one customer for new business sessions. When a display is empty but reserve stock remains, the current customer and requested display are saved in `pendingRestock`; a revision-checked refill or timeout resolves that same visit. The browser never receives the unserved customer queue. Older open saves without display allocation keep their existing batch behavior. These fields are optional/additive and do not change the rules version.

The API serves `/api/v1/health/live`, `/api/v1/health/ready`, and `/api/v1/health/version`. The version response identifies the deployed commit and preview pull request. The [deployment runbook](operations/deployment.md) covers image provenance, host operation, and recovery.
