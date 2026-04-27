#!/usr/bin/env bash
# spike.sh — orchestrator spawn-per-stage spike (Agent-tool variant).
#
# Subcommands:
#   setup    Mint a uuid, create /tmp/gstack-spike-<uuid>/, print
#            shell-eval'able RUN_ID/BUILDER_SLUG/COMPANY_SLUG/SENTINEL_PATH.
#   verify   Read sentinel JSON, assert schema_version=1 + all four
#            identifiers match + status=ok. PASS or FAIL: <reason>.
set -euo pipefail

read_field() {
  bun -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf-8'))[process.argv[2]] ?? '')" "$1" "$2"
}

case "${1:-}" in
  setup)
    run_id="$(uuidgen | tr '[:upper:]' '[:lower:]')"
    builder_slug="spike-builder"
    company_slug="spike-co"
    dir="/tmp/gstack-spike-${run_id}"
    mkdir -p "$dir"
    printf 'export RUN_ID=%q\n' "$run_id"
    printf 'export BUILDER_SLUG=%q\n' "$builder_slug"
    printf 'export COMPANY_SLUG=%q\n' "$company_slug"
    printf 'export SENTINEL_PATH=%q\n' "${dir}/result.json"
    ;;
  verify)
    sentinel="${2:?usage: $0 verify <sentinel_path> <run_id> <builder_slug> <company_slug>}"
    want_run="${3:?run_id required}"
    want_builder="${4:?builder_slug required}"
    want_company="${5:?company_slug required}"
    [ -f "$sentinel" ] || { echo "FAIL: sentinel missing at $sentinel"; exit 1; }
    fail=0
    for pair in "schema_version 1" "run_id $want_run" "builder_slug $want_builder" "company_slug $want_company" "status ok"; do
      field="${pair%% *}"; want="${pair#* }"
      got="$(read_field "$sentinel" "$field")"
      [ "$got" = "$want" ] || { echo "FAIL: $field=$got, want $want"; fail=1; }
    done
    [ "$fail" = "0" ] && { echo "PASS"; echo "---"; cat "$sentinel"; } || exit 1
    ;;
  *)
    echo "usage: $0 {setup|verify}" >&2; exit 2 ;;
esac
