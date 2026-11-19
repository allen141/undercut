# Architecture

| Path | Responsibility |
| --- | --- |
| `apps/web` | React application and a Pixi shop scene, built with Vite |
| `apps/api` | Fastify HTTP API, Better Auth, database access and operator commands |
| `packages/game-core` | Deterministic game transitions, town and goods definitions, inventory accounting |
| `packages/contracts` | Shared Zod validation and command types |
| `infrastructure` | Local Compose, published images, deployment controller and ingress configuration |

The browser and API share an origin. Session cookies establish ownership. A host operator creates single-use email-bound invitation links that expire after 72 hours. The operator can issue password reset links that expire after one hour and delivers both kinds of links privately. There is no outbound email service.

PostgreSQL stores identity, campaigns, and command receipts. Drizzle maps data to the TypeScript application. Committed SQL migrations run before a candidate API starts. Hosted migrations must keep the previous API usable so that reverting application images remains safe.

Each campaign has a server-authoritative snapshot, rules version, and revision. The API validates command inputs, locks the campaign row in a transaction, checks ownership, and applies the domain transition together with its receipt. The client supplies a unique action ID and expected revision. The same accepted action can return its saved response on retry. A stale revision is rejected so the browser can reload server state before it submits a new decision.

Random customer behavior derives from the campaign seed, town, and day. The browser renders the response and requests the next action. A reload resumes the saved phase, inventory, and day without relying on browser storage.

The API serves `/api/v1/health/live`, `/api/v1/health/ready`, and `/api/v1/health/version`. The version response identifies the deployed commit and preview pull request. The [deployment runbook](operations/deployment.md) covers image provenance, host operation, and recovery.
