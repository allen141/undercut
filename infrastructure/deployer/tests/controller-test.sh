#!/bin/sh

set -eu

IMAGE=${1:-undercut-deployer:test}
ROOT=$(CDPATH= cd -- "$(dirname "$0")/../../.." && pwd)
TEST_STATE=$(mktemp -d)
trap 'rm -rf "$TEST_STATE"' EXIT
mkdir -p "$TEST_STATE/host/deployer/preview"
{
  printf '%s\n' 'ghcr.io/allen141/undercut-release@sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
  printf '%s\n' 'ghcr.io/allen141/undercut-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  printf '%s\n' 'ghcr.io/allen141/undercut-web@sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
} > "$TEST_STATE/host/deployer/preview/current-release"

if docker run --rm --entrypoint /usr/local/bin/undercut-deploy -e CHANNEL=staging "$IMAGE"; then
  echo "Controller accepted an invalid channel" >&2
  exit 1
fi

if docker run --rm \
  --entrypoint /usr/local/bin/undercut-deploy \
  -e CHANNEL=preview \
  -v "$ROOT/infrastructure/deployer/production.environment.example:/config/environment.env:ro" \
  "$IMAGE"; then
  echo "Controller accepted production configuration for preview" >&2
  exit 1
fi

docker run --rm \
  --entrypoint /usr/local/bin/undercut-deploy \
  -e CHANNEL=preview \
  -e RUN_ONCE=1 \
  -e FAKE_DOCKER_LOG=/test-state/docker.log \
  -e PATH=/test:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  -v "$ROOT/infrastructure/deployer/preview.environment.example:/config/environment.env:ro" \
  -v "$ROOT/infrastructure/deployer/preview.secrets.example:/mnt/user/appdata/undercut/preview/secrets.env:ro" \
  -v "$ROOT/infrastructure/deployer/tests/fake-docker:/test/docker:ro" \
  -v "$TEST_STATE:/test-state" \
  -v "$TEST_STATE/host/deployer:/mnt/user/appdata/undercut/deployer:ro" \
  "$IMAGE"

grep -Fq "image rm sha256:4444444444444444444444444444444444444444444444444444444444444444" "$TEST_STATE/docker.log"
grep -Fq "image rm sha256:2222222222222222222222222222222222222222222222222222222222222222" "$TEST_STATE/docker.log"
if grep -Fq "image rm sha256:3333333333333333333333333333333333333333333333333333333333333333" "$TEST_STATE/docker.log"; then
  echo "Controller cleanup attempted to remove an unrelated image" >&2
  exit 1
fi
if grep -Fq "image rm sha256:1111111111111111111111111111111111111111111111111111111111111111" "$TEST_STATE/docker.log"; then
  echo "Controller cleanup attempted to remove the active preview image ID" >&2
  exit 1
fi

release="ghcr.io/allen141/undercut-release@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
run_candidate() {
  scenario=$1
  state="$TEST_STATE/$scenario"
  mkdir -p "$state"
  cp "$TEST_STATE/host/deployer/preview/current-release" "$state/current-release"
  docker run --rm --entrypoint /usr/local/bin/undercut-deploy \
    -e CHANNEL=preview -e RUN_ONCE=1 -e STATE_DIR=/test-state \
    -e TEST_SCENARIO="$scenario" -e FAKE_DOCKER_LOG=/test-state/docker.log \
    -e PATH=/test:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    -v "$ROOT/infrastructure/deployer/preview.environment.example:/config/environment.env:ro" \
    -v "$ROOT/infrastructure/deployer/tests/fake-docker:/test/docker:ro" \
    -v "$ROOT/infrastructure/deployer/tests/fake-cosign:/test/cosign:ro" \
    -v "$state:/test-state" \
    "$IMAGE"
  grep -Fq "cosign verify " "$state/docker.log"
  grep -Fq "$release" "$state/docker.log"
}

for scenario in signature allowlist swapped-roles migration; do
  run_candidate "$scenario"
  if grep -Eq '^activated ' "$state/docker.log"; then
    echo "Controller activated a release in scenario $scenario" >&2
    exit 1
  fi
  cmp "$state/current-release" "$TEST_STATE/host/deployer/preview/current-release"
done
test "$(cat "$state/failed-release")" = "$release"

run_candidate readiness
test "$(grep -c '^activated ' "$state/docker.log")" = 2
previous_api=$(sed -n '2p' "$state/current-release")
previous_web=$(sed -n '3p' "$state/current-release")
test "$(grep '^activated ' "$state/docker.log" | tail -n 1)" = "activated $previous_api $previous_web"
cmp "$state/current-release" "$TEST_STATE/host/deployer/preview/current-release"
test "$(cat "$state/failed-release")" = "$release"

run_candidate success
test "$(grep -c '^activated ' "$state/docker.log")" = 1
test "$(sed -n '1p' "$state/current-release")" = "$release"
cmp "$state/previous-release" "$TEST_STATE/host/deployer/preview/current-release"
test ! -e "$state/failed-release"

docker run --rm \
  --entrypoint sh \
  -v "$ROOT/infrastructure/deployer/preview.environment.example:/config/environment.env:ro" \
  -v "$ROOT/infrastructure/deployer/preview.secrets.example:/config/secrets.env:ro" \
  -v "$ROOT/infrastructure/deployer/preview.secrets.example:/mnt/user/appdata/undercut/preview/secrets.env:ro" \
  "$IMAGE" -c '
    set -a
    . /config/environment.env
    set +a
    export API_IMAGE=ghcr.io/allen141/undercut-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    export WEB_IMAGE=ghcr.io/allen141/undercut-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
    export BUILD_VERSION=test BUILD_PR_NUMBER=1
    docker compose --env-file /config/environment.env -f /opt/undercut/deploy.compose.yaml config --quiet
  '

docker run --rm \
  --entrypoint sh \
  -v "$ROOT/infrastructure/deployer/production.environment.example:/config/environment.env:ro" \
  -v "$ROOT/infrastructure/deployer/production.secrets.example:/config/secrets.env:ro" \
  -v "$ROOT/infrastructure/deployer/production.secrets.example:/mnt/user/appdata/undercut/production/secrets.env:ro" \
  "$IMAGE" -c '
    set -a
    . /config/environment.env
    set +a
    export API_IMAGE=ghcr.io/allen141/undercut-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    export WEB_IMAGE=ghcr.io/allen141/undercut-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
    export BUILD_VERSION=test BUILD_PR_NUMBER=
    docker compose --env-file /config/environment.env -f /opt/undercut/deploy.compose.yaml --profile backup config --quiet
  '

echo "Deployment controller policy tests passed"
