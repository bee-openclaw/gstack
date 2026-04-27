# Spike: orchestrator spawn-per-stage (Agent-tool variant)

Throwaway. Deleted once Unit 6 (`/build` meta-skill) lands and exercises
the same primitive in production.

## What this spike validates

The Phase A orchestrator chains stages via Claude Code's **native Agent
tool** (no SDK, no `claude -p`, no API key). The parent session running
`/build` calls `Agent({ prompt, subagent_type })` with a prompt that
embeds run identifiers as text. The sub-agent has fresh, isolated
context, runs the prompt, writes a sentinel JSON, and returns.

This spike proves three things end-to-end:

1. **Context handoff via prompt text.** Identifiers (`run_id`,
   `builder_slug`, `company_slug`, `sentinel_path`) reach the sub-agent
   intact when embedded in the prompt body. No env-var plumbing needed.
2. **Sentinel-file IPC.** The sub-agent writes a deterministic JSON file
   the parent can read after the Agent call returns.
3. **Schema-versioned read-before-trust.** Parent reads
   `schema_version: 1` and asserts every field — locking the contract
   from day one.

## Files

| File | Purpose |
|---|---|
| `spike.sh` | `setup` mints the uuid + tempdir; `verify` reads the sentinel and asserts shape. |
| `agent-prompt.md` | SKILL.md.tmpl-style prompt template the parent fills with `{{RUN_ID}}` / `{{BUILDER_SLUG}}` / `{{COMPANY_SLUG}}` / `{{SENTINEL_PATH}}` before calling the Agent tool. |

## How to run

Inside a Claude Code session (the parent), do this in order:

```bash
# 1. Bootstrap the spike
eval "$(bash spike/orchestrator-spawn/spike.sh setup)"
echo "$RUN_ID $BUILDER_SLUG $COMPANY_SLUG $SENTINEL_PATH"
```

Then the parent (Claude) reads `agent-prompt.md`, substitutes the four
values, and calls the Agent tool with the resolved prompt. After the
Agent call returns:

```bash
# 2. Verify the sub-agent wrote what the contract requires
bash spike/orchestrator-spawn/spike.sh verify \
  "$SENTINEL_PATH" "$RUN_ID" "$BUILDER_SLUG" "$COMPANY_SLUG"
```

`PASS` + sentinel contents on success. `FAIL: <reason>` + nonzero exit
on any field mismatch.

## Pass / Fail / STOP

- **PASS:** sentinel exists, schema_version=1, all four identifiers
  match, status="ok". Move to Unit 2.
- **FAIL on sentinel-missing:** sub-agent didn't follow the prompt's
  write step. Tighten the prompt; re-run.
- **FAIL on field mismatch:** the Agent tool isn't passing prompt text
  through verbatim. STOP and surface — chain protocol redesign needed.

## Deletion criterion

Removed once Unit 6 (`/build` meta-skill) lands and `test/build-chain-e2e.test.ts`
exercises the spawn-per-stage primitive in the production path.
