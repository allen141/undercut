FROM ghcr.io/sigstore/cosign/cosign:v3.1.2 AS cosign

FROM docker:27.5.1-cli

RUN apk add --no-cache curl

COPY --from=cosign /ko-app/cosign /usr/local/bin/cosign
COPY infrastructure/deployer/deploy.sh /usr/local/bin/undercut-deploy
COPY infrastructure/deployer/reset-preview.sh /usr/local/bin/undercut-reset-preview
COPY infrastructure/deployer/deploy.compose.yaml /opt/undercut/deploy.compose.yaml

RUN chmod 0555 /usr/local/bin/undercut-deploy /usr/local/bin/undercut-reset-preview /usr/local/bin/cosign \
    && chmod 0444 /opt/undercut/deploy.compose.yaml

ENTRYPOINT ["/usr/local/bin/undercut-deploy"]
