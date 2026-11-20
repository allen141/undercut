# Working on Undercut

Read docs/plan.md and docs/architecture.md before changing behavior. Keep implementation, tests, and docs aligned. Use Node 24 and pnpm with the committed lockfile. For preview work, run focused local checks for the change and use the pull request CI results. CI runs source and API checks, verifies the release containers and deployment policy, and runs a short browser smoke test via `pnpm test:browser:smoke`. The main branch runs the full `pnpm test:browser` suite as well as the source, API, container, and policy checks before publishing production.

Game rules belong in packages/game-core; the server is authoritative. Preserve campaign ownership, atomic commands, idempotency, and forward-compatible saves. Never place credentials, invitation links, real account data, or runtime volumes in Git. Do not reset production. Database migrations must remain compatible with the previous application release. Public visibility does not imply an open-source license.

The long-term game uses trade to influence nations across independent branching campaigns. The first milestone is shop mechanics only. Do not add story, national simulation, multiplayer, offline writes, or cross-run bonuses without an agreed scope change.
