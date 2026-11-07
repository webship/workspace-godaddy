#!/usr/bin/env bash
## The host side of the GoDaddy plugin: the CLI on this machine and the dashboard's credentials.
## Run by core/scripts/plugins.sh --install godaddy, and by core/scripts/install.sh for every installed
## plugin that ships one. Idempotent: whatever is already there is reported, not redone. Offered,
## never automatic: a hosting CLI carries cloud credentials for real environments.
set -u
WORKSPACE_ROOT="${WORKSPACE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../.." && pwd)}";

STATE="$(grep -E '^api_key:' "${WORKSPACE_ROOT}/core/config/plugin.godaddy.settings.yml" 2>/dev/null | head -1 | sed -E 's/^[a-z_]+:[[:space:]]*//')";
case "${STATE}" in
  ''|CHANGE_ME|"''"|'""') printf '  ✗ %-16s %s\n' "api_key" "not set in plugin.godaddy.settings.yml — the dashboard cannot reach GoDaddy" ;;
  *)                       printf '  ✓ %-16s %s\n' "api_key" "set (plugin.godaddy.settings.yml)" ;;
esac

STATE="$(grep -E '^api_secret:' "${WORKSPACE_ROOT}/core/config/plugin.godaddy.settings.yml" 2>/dev/null | head -1 | sed -E 's/^[a-z_]+:[[:space:]]*//')";
case "${STATE}" in
  ''|CHANGE_ME|"''"|'""') printf '  ✗ %-16s %s\n' "api_secret" "not set in plugin.godaddy.settings.yml — the dashboard cannot reach GoDaddy" ;;
  *)                       printf '  ✓ %-16s %s\n' "api_secret" "set (plugin.godaddy.settings.yml)" ;;
esac

