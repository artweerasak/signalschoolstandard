#!/bin/bash
# start-with-override.sh — Start LMS/CMS with military plugin overrides
# Replaces: tutor local restart lms

TUTOR_ROOT="$(tutor config printroot)"
cd "$(dirname "$0")/.."

docker compose \
  -f "${TUTOR_ROOT}/env/local/docker-compose.yml" \
  -f "${TUTOR_ROOT}/env/local/docker-compose.prod.yml" \
  -f docker-compose.override.yml \
  --project-name tutor_local \
  up -d "${@:-lms}"

echo "Done. Tailing logs (Ctrl+C to exit)..."
docker logs -f tutor_local-lms-1 2>&1 | grep -v "tracking\|req:" | head -30
