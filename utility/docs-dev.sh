#!/usr/bin/env bash
# Start the MkDocs Material dev server for aspects.dev without a TTY,
# so it can be used from concurrently or other non-interactive runners.
#
# Usage: ./utility/docs-dev.sh [--port PORT]
#
# The aspects.dev repo is expected to be a sibling directory of this repo.
# Override with ASPECTED_DOCS_DIR if the repos are not siblings.
set -euo pipefail

PORT=8000

while [[ $# -gt 0 ]]; do
  case "$1" in
    -p|--port)
      PORT="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

DOCS_DIR="${ASPECTED_DOCS_DIR:-$(dirname "$(pwd)")/aspects.dev}"

if [[ ! -d "$DOCS_DIR" ]]; then
  echo "aspects.dev not found at $DOCS_DIR" >&2
  echo "Set ASPECTED_DOCS_DIR to the correct path." >&2
  exit 1
fi

IMAGE=aspected-mkdocs-material-runtime

echo "Building MkDocs runtime image..."
docker build -q -t "$IMAGE" -f - "$DOCS_DIR" <<'EOF'
FROM squidfunk/mkdocs-material
RUN pip install mkdocs-llmstxt
EOF

echo "Starting MkDocs dev server on http://localhost:${PORT} ..."
exec docker run --rm \
  -p "${PORT}:${PORT}" \
  -v "${DOCS_DIR}:/docs" \
  -e DOCS_SITE_URL="http://localhost:${PORT}" \
  -e DOCS_HOMEPAGE_URL="http://localhost:${PORT}" \
  "$IMAGE" \
  serve --livereload "--dev-addr=0.0.0.0:${PORT}"
