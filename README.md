# Undercut

Run a magical shop that opens into a different town each day. Choose a market, buy stock, price your shelves, and serve customers. Each named campaign is independent. The long-term design uses trade to influence nations and branch campaign stories.

See the [first milestone](docs/plan.md), [architecture](docs/architecture.md), and [deployment runbook](docs/operations/deployment.md).

## Local development

With Docker and Compose installed, start PostgreSQL and the application.

```sh
docker compose -f infrastructure/compose.yaml up --build --wait
docker compose -f infrastructure/compose.yaml exec api node --import tsx apps/api/src/operator.ts invite you@example.com
```

Open the generated invitation in a browser. The site runs at http://localhost:5180. Use a separate address for each test account.

For source development, use Node 24 and the pnpm version in `package.json`. Start the database with Compose, load the settings from `.env.example` into your shell, install with `pnpm install --frozen-lockfile`, and run `pnpm db:migrate`. Start `pnpm dev:api` and `pnpm dev` in separate shells. The frontend runs at http://localhost:5173. Run `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, and `pnpm build` before submitting changes.

The repository is publicly visible. No open-source license has been selected.

The shared preview follows passing pull requests from this repository. Preview accounts are separate from production accounts.
