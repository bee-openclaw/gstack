/**
 * Unit 10: cross-cutting orchestrator integration tests.
 *
 * What this file covers that the per-binary test files don't:
 *
 *   - prose-shape tripwires for /build and /implement skill templates
 *     (mirroring the Unit 7 sentinel-emission shape test against /qa+/ship)
 *   - end-to-end sentinel chain across all 5 stages, no real LLM —
 *     synthetic test exercising gstack-build-step + gstack-dashboard
 *     in concert
 *   - runs/archive separation (archive dir filtered out of run listings)
 *   - cost rollup correctness across multi-line costs.jsonl
 *   - slug uniqueness across builders (no cross-contamination)
 *
 * No paid evals. Pure regex + filesystem fixture tests.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const ROOT = path.resolve(import.meta.dir, '..');
const STEP = path.join(ROOT, 'bin', 'gstack-build-step.ts');
const DASH = path.join(ROOT, 'bin', 'gstack-dashboard.ts');
const BUILD_TMPL = path.join(ROOT, 'build', 'SKILL.md.tmpl');
const IMPL_TMPL = path.join(ROOT, 'implement', 'SKILL.md.tmpl');

const RUN_A = '4c107dc2-f68e-4b6e-8acc-2fc57c009002';
const RUN_B = '5d208ed3-074f-5c7e-9bdd-3df68e10a113';
const BUILDER_A = 'alice';
const BUILDER_B = 'bob';
const COMPANY = 'shared-co';

let tmpHome: string;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gstack-orchestrator-int-'));
});
afterEach(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

interface RunResult { stdout: string; stderr: string; exitCode: number }

function runBin(bin: string, args: string[], opts: { stdin?: string } = {}): RunResult {
  const r = spawnSync('bun', ['run', bin, ...args], {
    cwd: ROOT,
    env: { ...process.env, GSTACK_HOME: tmpHome },
    encoding: 'utf-8',
    timeout: 15000,
    input: opts.stdin,
  });
  return { stdout: r.stdout?.toString() ?? '', stderr: r.stderr?.toString() ?? '', exitCode: r.status ?? 1 };
}

function runStep(args: string[], stdin?: string): RunResult {
  return runBin(STEP, args, { stdin });
}
function runDash(args: string[]): RunResult {
  return runBin(DASH, args);
}

function writeSentinel(stage: string, runId: string, builder: string, company: string, payload: object): void {
  const r = runStep(
    ['write-sentinel', stage, '--run-id', runId, '--builder-slug', builder, '--company-slug', company],
    JSON.stringify(payload),
  );
  if (r.exitCode !== 0) throw new Error(`write-sentinel ${stage} failed: ${r.stderr}`);
}

function appendJsonl(filePath: string, obj: object): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(obj) + '\n');
}

// ---------------------------------------------------------------------------
// Cases 1-2: prose-shape tripwires for /build and /implement
// ---------------------------------------------------------------------------

describe('orchestrator-integration: skill template prose-shape tripwires', () => {
  test('case 1: build/SKILL.md.tmpl contains the keystone primitives', () => {
    const body = fs.readFileSync(BUILD_TMPL, 'utf-8');

    // Five stages must all be referenced (the chain is the contract)
    for (const stage of ['office-hours', 'autoplan', 'implement', 'qa', 'ship']) {
      expect(body).toContain(stage);
    }

    // Spawn-per-stage primitives — the helper binary + Agent tool
    expect(body).toMatch(/gstack-build-step/);
    expect(/Agent\b.*tool|Agent tool|via the Agent tool/i.test(body)).toBe(true);

    // Read-sentinel + write-sentinel must both appear (chain reads what
    // sub-agents write)
    expect(body).toMatch(/write-sentinel/);
    expect(body).toMatch(/read-sentinel/);

    // The mandatory post-/autoplan approval gate — Premise 7 keystone
    expect(/APPROVAL GATE|approval gate/i.test(body)).toBe(true);
    expect(/non-?negotiable|mandatory/i.test(body)).toBe(true);

    // Run-identifier env vars must be propagated explicitly
    for (const v of ['GSTACK_RUN_ID', 'GSTACK_BUILDER_SLUG', 'GSTACK_COMPANY_SLUG']) {
      expect(body).toContain(v);
    }
  });

  test('case 2: implement/SKILL.md.tmpl contains failure ladder + checkpoint contract', () => {
    const body = fs.readFileSync(IMPL_TMPL, 'utf-8');

    // Four failure-ladder cases must all be named (per design doc § A.1)
    expect(/Case A:/i.test(body)).toBe(true);
    expect(/Case B:/i.test(body)).toBe(true);
    expect(/Case C:/i.test(body)).toBe(true);
    expect(/Case D:/i.test(body)).toBe(true);

    // Checkpoint contract — orchestrator-mode + standalone paths both named
    expect(body).toContain('implement-checkpoint.json');
    expect(body).toContain('schema_version');

    // Orchestrator-mode detection guards
    for (const v of ['GSTACK_RUN_ID', 'GSTACK_BUILDER_SLUG', 'GSTACK_COMPANY_SLUG']) {
      expect(body).toContain(v);
    }

    // The /investigate dispatch in Case B (the recovery path)
    expect(body).toContain('/investigate');

    // Hard rules: never amend, never auto-skip
    expect(/never amend|Never amend/i.test(body)).toBe(true);
    expect(/never auto-skip|Never auto-skip|never automatically skip/i.test(body)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Case 3: end-to-end sentinel chain across all 5 stages
// ---------------------------------------------------------------------------

describe('orchestrator-integration: end-to-end sentinel chain', () => {
  test('case 3: write 5 stage sentinels in order, dashboard runs lists the run', () => {
    // Stage 1: office-hours
    writeSentinel('office-hours', RUN_A, BUILDER_A, COMPANY, {
      status: 'ok',
      design_doc_path: '/tmp/d.md',
      decisions_summary: 'narrow wedge: open austin community',
      context_for_next_stage: 'target user = chairman, wedge = 5 austin members',
    });
    // Stage 2: autoplan
    writeSentinel('autoplan', RUN_A, BUILDER_A, COMPANY, {
      status: 'ok',
      plan_path: '/tmp/p.md',
      ac_count: 4,
      ac_summary: 'AC1 widget. AC2 wire build. AC3 tests. AC4 readme.',
      context_for_next_stage: '4 ACs locked, no inter-AC blockers',
    });
    // Stage 3: implement
    writeSentinel('implement', RUN_A, BUILDER_A, COMPANY, {
      status: 'ok',
      commit_shas: ['abc1234', 'def5678', '9876fed', '0123abc'],
      last_ac_index: 4,
      tests_passing: true,
      context_for_next_stage: 'all 4 ACs committed, repo-wide tests green',
    });
    // Stage 4: qa
    writeSentinel('qa', RUN_A, BUILDER_A, COMPANY, {
      status: 'ok',
      report_path: '/tmp/qa.md',
      bugs_found: 2,
      bugs_fixed: 2,
      ship_ready: true,
      context_for_next_stage: 'fixed 2 cosmetic bugs, ship green',
    });
    // Stage 5: ship
    writeSentinel('ship', RUN_A, BUILDER_A, COMPANY, {
      status: 'ok',
      pr_url: 'https://github.com/test/repo/pull/1',
      version_tag: 'v0.1.0.0',
      commit_sha: 'aaa1234',
    });

    // Synthetic timeline events tying the sentinels together
    const tl = path.join(tmpHome, 'builders', BUILDER_A, 'companies', COMPANY, 'timeline.jsonl');
    appendJsonl(tl, { ts: '2026-04-27T10:00:00Z', skill: 'office-hours', event: 'completed', outcome: 'success', run_id: RUN_A });
    appendJsonl(tl, { ts: '2026-04-27T10:30:00Z', skill: 'autoplan', event: 'completed', outcome: 'success', run_id: RUN_A });
    appendJsonl(tl, { ts: '2026-04-27T11:00:00Z', skill: 'implement', event: 'completed', outcome: 'success', run_id: RUN_A });
    appendJsonl(tl, { ts: '2026-04-27T11:30:00Z', skill: 'qa', event: 'completed', outcome: 'success', run_id: RUN_A });
    appendJsonl(tl, { ts: '2026-04-27T12:00:00Z', skill: 'ship', event: 'completed', outcome: 'success', run_id: RUN_A });

    // Each sentinel readable + valid via gstack-build-step
    for (const stage of ['office-hours', 'autoplan', 'implement', 'qa', 'ship']) {
      const r = runStep(['read-sentinel', stage, '--run-id', RUN_A, '--builder-slug', BUILDER_A, '--company-slug', COMPANY]);
      expect(r.exitCode).toBe(0);
      expect(JSON.parse(r.stdout).schema_version).toBe(1);
    }

    // gstack-dashboard runs shows the run with all 5 stages
    const r = runDash(['runs', '--company', COMPANY, '--builder', BUILDER_A]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain(RUN_A);
    expect(r.stdout).toContain('success');
    // All 5 stage skill names should appear in the STAGES column
    for (const s of ['office-hours', 'autoplan', 'implement', 'qa', 'ship']) {
      expect(r.stdout).toContain(s);
    }
  });
});

// ---------------------------------------------------------------------------
// Case 4: runs/archive separation
// ---------------------------------------------------------------------------

describe('orchestrator-integration: archive directory filtering', () => {
  test('case 4: runs/archive/ is filtered out of dashboard runs listing', () => {
    // Active run
    writeSentinel('autoplan', RUN_A, BUILDER_A, COMPANY, {
      status: 'ok', plan_path: '/p', ac_count: 1, ac_summary: 's', context_for_next_stage: 'c',
    });
    // Synthetic archived run dir (not via write-sentinel — directly drop it)
    const archiveDir = path.join(tmpHome, 'builders', BUILDER_A, 'companies', COMPANY, 'runs', 'archive');
    fs.mkdirSync(path.join(archiveDir, RUN_B), { recursive: true });
    fs.writeFileSync(path.join(archiveDir, RUN_B, 'autoplan-result.json'),
      JSON.stringify({ schema_version: 1, status: 'archived', plan_path: 'x', ac_count: 0, ac_summary: '', context_for_next_stage: '' }));

    // Timeline only mentions the active run
    const tl = path.join(tmpHome, 'builders', BUILDER_A, 'companies', COMPANY, 'timeline.jsonl');
    appendJsonl(tl, { ts: '2026-04-27T10:00:00Z', skill: 'autoplan', event: 'started', run_id: RUN_A });

    const r = runDash(['runs', '--company', COMPANY, '--builder', BUILDER_A]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain(RUN_A);
    // archive must NOT appear as a "run"
    expect(r.stdout).not.toContain('archive');
    expect(r.stdout).not.toContain(RUN_B);
  });
});

// ---------------------------------------------------------------------------
// Case 5: cost rollup correctness
// ---------------------------------------------------------------------------

describe('orchestrator-integration: cost rollup', () => {
  test('case 5: dashboard sums cost_usd from costs.jsonl, ignoring rows without cost_usd', () => {
    const cd = path.join(tmpHome, 'builders', BUILDER_A, 'companies', COMPANY);
    fs.mkdirSync(cd, { recursive: true });
    fs.writeFileSync(path.join(cd, 'costs.jsonl'),
      [
        { stage: 'autoplan',   cost_usd: 0.50,  run_id: RUN_A },
        { stage: 'implement',  cost_usd: 1.25,  run_id: RUN_A },
        { stage: 'qa',         cost_usd: 0.10,  run_id: RUN_A },
        { stage: 'ship',       cost_usd: 0.05,  run_id: RUN_A },
        // Row with no cost_usd field (e.g., Agent-tool call where only tokens were captured)
        { stage: 'office-hours', total_tokens: 50000, run_id: RUN_A },
      ].map((o) => JSON.stringify(o)).join('\n') + '\n');
    // timeline so the company shows up in dashboard
    appendJsonl(path.join(cd, 'timeline.jsonl'), { ts: '2026-04-27T10:00:00Z', skill: 'build', event: 'completed', run_id: RUN_A });

    const r = runDash(['companies', '--builder', BUILDER_A]);
    expect(r.exitCode).toBe(0);
    // Total: 0.50 + 1.25 + 0.10 + 0.05 = $1.9000
    expect(r.stdout).toContain('$1.9000');
  });

  test('case 5b: zero-cost company shows "—" not "$0.0000"', () => {
    const cd = path.join(tmpHome, 'builders', BUILDER_A, 'companies', COMPANY);
    fs.mkdirSync(cd, { recursive: true });
    appendJsonl(path.join(cd, 'timeline.jsonl'), { ts: '2026-04-27T10:00:00Z', skill: 'build', event: 'started' });
    const r = runDash(['companies', '--builder', BUILDER_A]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('—');
    expect(r.stdout).not.toContain('$0.0000');
  });
});

// ---------------------------------------------------------------------------
// Case 6: slug uniqueness across builders (no cross-contamination)
// ---------------------------------------------------------------------------

describe('orchestrator-integration: builder/company namespace isolation', () => {
  test('case 6: same company name under two builders → distinct paths, no leak', () => {
    // Alice's view
    const pa = runStep(['paths', '--run-id', RUN_A, '--builder-slug', BUILDER_A, '--company-slug', COMPANY]);
    expect(pa.exitCode).toBe(0);

    // Bob's view (same company name, different builder)
    const pb = runStep(['paths', '--run-id', RUN_B, '--builder-slug', BUILDER_B, '--company-slug', COMPANY]);
    expect(pb.exitCode).toBe(0);

    // Pull RUN_DIR from each
    const aliceRunDir = pa.stdout.match(/RUN_DIR='([^']+)'/)?.[1];
    const bobRunDir = pb.stdout.match(/RUN_DIR='([^']+)'/)?.[1];
    expect(aliceRunDir).toBeDefined();
    expect(bobRunDir).toBeDefined();
    expect(aliceRunDir).not.toBe(bobRunDir);
    expect(aliceRunDir).toContain(`/builders/${BUILDER_A}/`);
    expect(bobRunDir).toContain(`/builders/${BUILDER_B}/`);

    // Write a sentinel under Alice — Bob's tree must remain empty
    writeSentinel('autoplan', RUN_A, BUILDER_A, COMPANY, {
      status: 'ok', plan_path: '/p', ac_count: 1, ac_summary: 's', context_for_next_stage: 'c',
    });
    expect(fs.existsSync(path.join(aliceRunDir!, 'autoplan-result.json'))).toBe(true);
    expect(fs.existsSync(path.join(bobRunDir!, 'autoplan-result.json'))).toBe(false);

    // Bob can write to the same company-slug independently
    writeSentinel('autoplan', RUN_B, BUILDER_B, COMPANY, {
      status: 'ok', plan_path: '/p2', ac_count: 2, ac_summary: 's2', context_for_next_stage: 'c2',
    });
    const bobSentinel = JSON.parse(fs.readFileSync(path.join(bobRunDir!, 'autoplan-result.json'), 'utf-8'));
    expect(bobSentinel.plan_path).toBe('/p2');

    // Alice's sentinel still has alice's data
    const aliceSentinel = JSON.parse(fs.readFileSync(path.join(aliceRunDir!, 'autoplan-result.json'), 'utf-8'));
    expect(aliceSentinel.plan_path).toBe('/p');
  });
});
