# Deployment and recovery

GitHub Actions typechecks and builds the app, runs the game and PostgreSQL API tests, and checks the release containers through their proxy and the deployment controller.

- **Preview.** Pull requests install Chromium and run `pnpm test:browser:smoke`, a short Android journey through account setup, rendering the shop, choosing a town, and saving the choice. Passing same-repository pull requests publish to https://undercut-preview.tylerallen.net. Forked pull requests run the same checks.
- **Production.** Main runs `pnpm test:browser` on desktop Chromium and Firefox, Android Chromium, and iPhone WebKit. The full journeys cover multiple shop days, campaign isolation, reconnect and recovery, and mobile layout and touch controls. Passing main commits publish to https://undercut.tylerallen.net.

The publish job pushes the tested app images and signs an immutable release descriptor with Cosign. The API runtime image installs production dependencies only; tools used to build and test the app stay out of the hosted image. The host controller resolves each channel to a digest, verifies the repository, workflow and ref, checks the application image references, and runs committed SQL migrations before replacing the API and web containers. It records current and previous healthy releases. A failed startup or readiness check restores the prior app release. Both channels wait for the deployed commit to report its version and readiness. Migrations must remain compatible with the prior release.

## Host setup

- Point both Undercut DNS records at the existing SWAG address. Install the Undercut SWAG proxy templates on the host's `proxynet`.
- Serve challenges from `/config/www/undercut-acme` using the HTTP template. Issue a dedicated Certbot webroot certificate covering both names with config directory `/config/undercut-acme/letsencrypt`. In `ssl-undercut.conf`, use that certificate and key with the host TLS policy. Validate Nginx, then reload it. Install `renew-undercut.sh` under `/config/undercut-acme` and call it daily in the persisted SWAG root crontab.
- Create separate preview and production roots under `/mnt/user/appdata/undercut`. Copy the matching environment and secret examples from `infrastructure/deployer` to `environment.env` and `secrets.env` there. Use independent random DB passwords and authentication secrets and mode 0600 for secret files.
- Make the three Undercut GHCR packages publicly readable, or configure a credential with read-only access in the mounted registry directory. Keep publishing permissions in GitHub Actions.
- Run `infrastructure/deployer/start-controllers.sh` from the trusted checkout. Check the preview and production controller logs and both public readiness and version endpoints.

## Tester accounts

Generate a private 72-hour invitation from the active API container. Use the corresponding preview container for preview testers.

```sh
docker exec undercut-production-api node --import tsx apps/api/src/operator.ts invite tester@example.com
docker exec undercut-production-api node --import tsx apps/api/src/operator.ts reset tester@example.com
```

Reset links expire in one hour. Deliver links privately. Keep tokens out of Git and logs.

## Checking and recovering the rollout

Check `/api/v1/health/ready` and `/api/v1/health/version`. Use `docker logs undercut-deployer-production` or the preview equivalent. Approval of a rollout is recorded in each channel's state directory. Do not edit a signed descriptor or bypass its signature. A new passing commit replaces a failed candidate. For database trouble, stop the affected controller and inspect the migration and database logs before making changes.

Production PostgreSQL gets a daily SQL backup retained for 14 days in `/mnt/user/appdata/undercut/production/backups`. These backups are on the host. Verify a backup by restoring it into a separate PostgreSQL 18 database with `psql -v ON_ERROR_STOP=1` and checking campaign and account tables. Only restore to the active environment during an intentional recovery. Preserve the original database directory until recovery is verified.

For a preview reset, stop `undercut-deployer-preview`, run its `undercut-reset-preview` entry point with `CONFIRM_PREVIEW_RESET=undercut-preview` and the same host bind mounts, then restart the preview controller. The script archives the database and controller state under the preview root for recovery.
