#!/usr/bin/env bash
# Create and push a release git tag after version-packages merges (changesets publish hook).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(node -p "require('${ROOT}/apps/fuda/package.json').version")"
TAG="v${VERSION}"

if git rev-parse "${TAG}" >/dev/null 2>&1; then
  echo "Tag ${TAG} already exists; skipping"
  exit 0
fi

git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"
git tag "${TAG}"
git push origin "${TAG}"
echo "Pushed tag ${TAG}"
