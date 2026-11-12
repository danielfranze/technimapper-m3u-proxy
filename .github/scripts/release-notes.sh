#!/usr/bin/env bash
# Prints the CHANGELOG.md section of one version (without its heading), e.g.:
#   bash .github/scripts/release-notes.sh 1.5.0
# Prints nothing if the version has no "## [x.y.z]" section.
set -euo pipefail
version="${1:?usage: release-notes.sh <version>}"
awk -v v="$version" '
  index($0, "## [" v "]") == 1 { found = 1; next }
  found && index($0, "## [") == 1 { exit }
  found { print }
' CHANGELOG.md
