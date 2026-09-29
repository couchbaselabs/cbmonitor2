#!/usr/bin/env bash
# Prints the component summary that heads a GitHub release.
#
#   release-notes.sh <ref> [previous-tag]
#
# <ref> is the tag being released, or any commit to preview an untagged
# release. previous-tag defaults to the nearest tag before <ref>. The release
# action appends GitHub's generated notes (merged PRs, new contributors and the
# Full Changelog link) after this output, so none of that is repeated here.
set -euo pipefail

ref=${1:?usage: release-notes.sh <ref> [previous-tag]}
prev=${2:-$(git describe --tags --abbrev=0 "${ref}^" 2>/dev/null || true)}

version=$(git show "${ref}:cbmonitor/package.json" |
  sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' | head -1)

# Each entry: display name | paths that belong to the component | artifact.
# The first path decides whether the component exists at a given commit.
components=(
  "cbmonitor plugin|cbmonitor|\`cbmonitor-${version}.zip\`"
  "config-manager|config-manager configs/config-manager deployments/docker/Dockerfile.config-manager|\`config-manager-<platform>\`"
  "datasource-gateway|datasource-gateway configs/datasource-gateway deployments/docker/Dockerfile.datasource-gateway|\`datasource-gateway-<platform>\`"
)

exists_at() { git cat-file -e "$1:$2" 2>/dev/null; }

if [ -n "$prev" ]; then range="${prev}..${ref}"; since="Since ${prev}"; else range="$ref"; since="Changes"; fi

echo "## Components"
echo
echo "| Component | ${since} | Artifact |"
echo "|---|---|---|"
for c in "${components[@]}"; do
  IFS='|' read -r name paths artifact <<<"$c"
  read -r -a path_list <<<"$paths"
  exists_at "$ref" "${path_list[0]}" || continue
  n=$(git rev-list --no-merges --count "$range" -- "${path_list[@]}")
  if [ -n "$prev" ] && ! exists_at "$prev" "${path_list[0]}"; then
    status="New"
  elif [ "$n" -eq 0 ]; then
    status="Unchanged"
  elif [ "$n" -eq 1 ]; then
    status="1 change"
  else
    status="${n} changes"
  fi
  echo "| ${name} | ${status} | ${artifact} |"
done
echo

go_ver=""
for m in datasource-gateway config-manager cbmonitor; do
  go_ver=$(git show "${ref}:${m}/go.mod" 2>/dev/null | sed -n 's/^go //p') && [ -n "$go_ver" ] && break
done
node_ver=$(git show "${ref}:cbmonitor/.nvmrc" 2>/dev/null | tr -d '[:space:]' || true)
grafana=$(git show "${ref}:cbmonitor/src/plugin.json" |
  sed -n 's/.*"grafanaDependency": *"\([^"]*\)".*/\1/p')

echo "Binaries are built for linux-amd64, linux-arm64, darwin-amd64 and darwin-arm64."
echo "Built with Go ${go_ver}${node_ver:+ and Node ${node_ver}}. The plugin requires Grafana ${grafana}."
