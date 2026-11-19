# Deployment and recovery

GitHub Actions runs source, database, browser, container, and controller checks. Passing same-repository pull requests publish to the shared preview at https://undercut-preview.tylerallen.net. Passing main commits publish to https://undercut.tylerallen.net. Forked pull requests run checks only.

The publish job pushes the tested app images and signs an immutable release descriptor with Cosign. The host controller resolves each channel to a digest, verifies the repository, workflow and ref, checks the application image references, and runs committed SQL migrations before replacing the API and web containers. It records current and previous healthy releases. A failed startup or readiness check restores the prior app release. Migrations must remain compatible with the prior release.

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
