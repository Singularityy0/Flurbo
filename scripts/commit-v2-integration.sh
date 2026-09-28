#!/usr/bin/env bash
# Run from Git Bash after reviewing docs/V2_INTEGRATION_RELEASE.md.
# Creates local commits only. Never pushes, merges main, or deploys.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

base=fbbeba1
backup=backup/redesign-v2-tested-snapshot
[[ "$(git branch --show-current)" == redesign/v2 ]] || { echo 'Run this only on redesign/v2.'; exit 1; }
[[ "$(git rev-parse --short=7 HEAD)" == 901542a ]] || { echo 'V2 HEAD changed. Review the integration plan before proceeding.'; exit 1; }
[[ "$(git rev-parse origin/feature/semantic-validation-rollout)" == "$(git rev-parse "$base")" ]] || { echo 'Semantic branch changed. Integrate and test its new commits first.'; exit 1; }
git diff --cached --quiet || { echo 'There are already staged changes. Review them before using this script.'; exit 1; }
if git show-ref --verify --quiet "refs/heads/$backup"; then
  echo "Recovery branch $backup already exists. Stop and inspect it; do not overwrite it."
  exit 1
fi
git merge-base --is-ancestor HEAD "$base"

# Explicit reviewed paths exclude local designs, skills, research and credentials.
git add --pathspec-from-file=docs/V2_RELEASE_PATHS.txt
git diff --cached --check
git diff --cached --stat
git commit -m "Snapshot tested V2 and semantic integration"
git branch "$backup"

# Keep the exact index and all working files. Only move this unpublished branch's
# parent to the semantic PR, then commit the remaining V2 delta on top of it.
# The complete original snapshot remains recoverable on the backup branch.
git reset --soft "$base"
git commit -m "Integrate Flurbo V2 UI with semantic validation rollout"
git diff --exit-code "$backup" HEAD
git merge-base --is-ancestor "$base" HEAD
echo 'V2 committed with semantic ancestry. Snapshot tree matches exactly. Nothing pushed.'
echo 'Next: git push -u origin redesign/v2, then open a draft PR for combined CI.'
