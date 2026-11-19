# Working on Undercut

Read docs/plan.md and docs/architecture.md before changing behavior. Keep implementation, tests, and docs aligned. Use Node 24 and pnpm with the committed lockfile. Run typecheck, game tests, API integration tests against a disposable PostgreSQL database, build, and applicable browser tests before publishing.

Game rules belong in packages/game-core; the server is authoritative. Preserve campaign ownership, atomic commands, idempotency, and forward-compatible saves. Never place credentials, invitation links, real account data, or runtime volumes in Git. Do not reset production. Database migrations must remain compatible with the previous application release. Public visibility does not imply an open-source license.

The long-term game uses trade to influence nations across independent branching campaigns. The first milestone is shop mechanics only. Do not add story, national simulation, multiplayer, offline writes, or cross-run bonuses without an agreed scope change.
