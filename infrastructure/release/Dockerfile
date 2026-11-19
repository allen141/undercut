FROM scratch

ARG CHANNEL
ARG API_IMAGE
ARG WEB_IMAGE
ARG BUILD_VERSION
ARG BUILD_PR_NUMBER

LABEL org.opencontainers.image.source=https://github.com/allen141/undercut \
      net.tylerallen.undercut.channel=$CHANNEL \
      net.tylerallen.undercut.api=$API_IMAGE \
      net.tylerallen.undercut.web=$WEB_IMAGE \
      net.tylerallen.undercut.pr=$BUILD_PR_NUMBER \
      org.opencontainers.image.revision=$BUILD_VERSION
