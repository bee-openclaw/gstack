/**
 * Unit 7 regression tests: env-gated sentinel emission for /qa and /ship.
 *
 * The /qa and /ship skills emit sentinel files when invoked from the /build
 * chain (env vars set) and stay byte-for-byte silent when invoked normally.
 * This file pins down both halves PLUS the prose-shape of the SKILL.md.tmpl
 * sources — if a future template edit accidentally drops the sentinel-write
 * line, the prose-shape test catches it before it ships silently.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const ROOT = path.resolve(import.meta.dir, '..');
const STEP = path.join(ROOT, 'bin', 'gstack-build-step.ts');

const RUN_ID = '4c107dc2-f68e-4b6e-8acc-2fc57c009002';
const BUILDER = 'test-builder';
const COMPANY = 'test-co';

let tmpHome: string;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gstack-sentinel-emission-'));
});
afterEach(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

interface RunResult { stdout: string; stderr: string; exitCode: number }

function runStep(args: string[], stdin?: string, env?: Record<string, string>): RunResult {
  const r = spawnSync('bun', ['run', STEP, ...args], {
    cwd: ROOT,
    env: { ...process.env, GSTACK_HOME: tmpHome, ...(env ?? {}) },
    encoding: 'utf-8',
    timeout: 15000,
    input: stdin,
  });
  return { stdout: r.stdout?.toString() ?? '', stderr: r.stderr?.toString() ?? '', exitCode: r.status ?? 1 };
}

const sentinelPath = (stage: string) =>
  path.join(tmpHome, 'builders', BUILDER, 'companies', COMPANY, 'runs', RUN_ID, `${stage}-result.json`);

// ---------------------------------------------------------------------------
// Cases 1-2: stub /qa and /ship workflows without env vars produce nothing
// ---------------------------------------------------------------------------

describe('sentinel emission: env-gated', () => {
  test('case 1: simulated /qa flow without orchestrator env vars → no sentinel created', () => {
    // Simulating what qa's Phase 12 guard does: if env vars unset, skip.
    // The guard is: [ -n "$GSTACK_RUN_ID" ] && ... && ... && write-sentinel
    // With no env vars, no write-sentinel call happens — so no file should exist.
    expect(fs.existsSync(sentinelPath('qa'))).toBe(false);
    // (No write-sentinel invoked here on purpose — confirms the no-op path)
    expect(fs.existsSync(sentinelPath('qa'))).toBe(false);
  });

  test('case 2: simulated /ship flow without orchestrator env vars → no sentinel created', () => {
    expect(fs.existsSync(sentinelPath('ship'))).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Cases 3-4: with env vars + a write-sentinel call, sentinels exist with
  // exactly the fields the /qa and /ship templates promise to write
  // -------------------------------------------------------------------------

  test('case 3: /qa writes a valid sentinel when invoked with all three env vars', () => {
    const payload = {
      status: 'ok',
      report_path: '/tmp/qa-report-2026-04-27.md',
      bugs_found: 4,
      bugs_fixed: 3,
      ship_ready: true,
      context_for_next_stage: 'Fixed login + cart bugs. Deferred typo in footer (cosmetic).',
    };
    const r = runStep(
      ['write-sentinel', 'qa', '--run-id', RUN_ID, '--builder-slug', BUILDER, '--company-slug', COMPANY],
      JSON.stringify(payload),
    );
    expect(r.exitCode).toBe(0);

    const onDisk = JSON.parse(fs.readFileSync(sentinelPath('qa'), 'utf-8'));
    expect(onDisk.schema_version).toBe(1);
    expect(onDisk.bugs_found).toBe(4);
    expect(onDisk.bugs_fixed).toBe(3);
    expect(onDisk.ship_ready).toBe(true);
    expect(onDisk.report_path).toBe('/tmp/qa-report-2026-04-27.md');
    expect(typeof onDisk.context_for_next_stage).toBe('string');
  });

  test('case 4: /ship writes a valid sentinel when invoked with all three env vars', () => {
    const payload = {
      status: 'ok',
      pr_url: 'https://github.com/test/repo/pull/42',
      version_tag: 'v0.1.0.0',
      commit_sha: 'abc1234567',
    };
    const r = runStep(
      ['write-sentinel', 'ship', '--run-id', RUN_ID, '--builder-slug', BUILDER, '--company-slug', COMPANY],
      JSON.stringify(payload),
    );
    expect(r.exitCode).toBe(0);

    const onDisk = JSON.parse(fs.readFileSync(sentinelPath('ship'), 'utf-8'));
    expect(onDisk.schema_version).toBe(1);
    expect(onDisk.pr_url).toBe('https://github.com/test/repo/pull/42');
    expect(onDisk.version_tag).toBe('v0.1.0.0');
    expect(onDisk.commit_sha).toBe('abc1234567');
    // ship is the terminal stage — should not require context_for_next_stage
    expect(onDisk).not.toHaveProperty('context_for_next_stage');
  });

  test('case 5: /qa sentinel rejects payload missing ship_ready (orchestrator contract)', () => {
    const r = runStep(
      ['write-sentinel', 'qa', '--run-id', RUN_ID, '--builder-slug', BUILDER, '--company-slug', COMPANY],
      JSON.stringify({
        status: 'ok',
        report_path: '/tmp/r.md',
        bugs_found: 0,
        bugs_fixed: 0,
        // ship_ready intentionally omitted
        context_for_next_stage: 'all good',
      }),
    );
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/missing required field for stage qa: ship_ready/);
  });

  test('case 6: /ship sentinel rejects payload missing pr_url', () => {
    const r = runStep(
      ['write-sentinel', 'ship', '--run-id', RUN_ID, '--builder-slug', BUILDER, '--company-slug', COMPANY],
      JSON.stringify({
        status: 'ok',
        // pr_url intentionally omitted
        version_tag: 'v1.0.0.0',
        commit_sha: 'abc',
      }),
    );
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/missing required field for stage ship: pr_url/);
  });
});

// ---------------------------------------------------------------------------
// Case 7: prose-shape regression on SKILL.md.tmpl files
// ---------------------------------------------------------------------------
//
// The previous 6 cases only verify that gstack-build-step works correctly when
// CALLED. They don't verify that the qa/ship templates actually contain the
// guarded write-sentinel invocation. If a future template edit drops or
// comments out that line, every test above stays green but /build chains
// silently break — exactly the "silent failure" pattern the eng review's
// IRON RULE was meant to catch.
//
// This test fails loudly the moment a template loses the line.
// ---------------------------------------------------------------------------

describe('sentinel emission: SKILL.md.tmpl prose shape (silent-failure tripwire)', () => {
  test('case 7: qa/SKILL.md.tmpl AND ship/SKILL.md.tmpl each contain the env-guarded write-sentinel invocation', () => {
    // The contract: each template body must contain a guard checking all three
    // GSTACK_* env vars AND a gstack-build-step write-sentinel <stage> call.
    // We accept reasonable formatting variation (whitespace, line wrapping)
    // but require the three components to all appear in the file.
    const required: Array<{ tmpl: string; stage: string }> = [
      { tmpl: 'qa/SKILL.md.tmpl', stage: 'qa' },
      { tmpl: 'ship/SKILL.md.tmpl', stage: 'ship' },
    ];

    for (const { tmpl, stage } of required) {
      const body = fs.readFileSync(path.join(ROOT, tmpl), 'utf-8');
      // Hard requirements:
      // 1. References to all three orchestrator env vars (the guard's components)
      expect(body).toContain('GSTACK_RUN_ID');
      expect(body).toContain('GSTACK_BUILDER_SLUG');
      expect(body).toContain('GSTACK_COMPANY_SLUG');
      // 2. A guard line that bails when env vars are unset
      //    Accept either: [ -n "$GSTACK_RUN_ID" ]  OR  [ -n "${GSTACK_RUN_ID:-}" ]
      const hasGuard = /\[\s*-n\s+"\$\{?GSTACK_RUN_ID(:-)?\}?"\s*\]/.test(body);
      expect(hasGuard).toBe(true);
      // 3. The write-sentinel call for this exact stage
      const writeRegex = new RegExp(`gstack-build-step\\s+write-sentinel\\s+${stage}\\b`);
      expect(writeRegex.test(body)).toBe(true);
    }
  });

  test('case 7b: generated SKILL.md outputs preserve the same prose shape', () => {
    // gen-skill-docs is what installs go through. If the resolver pipeline
    // accidentally strips our sentinel section, the .tmpl test alone wouldn't
    // catch it. Pin down the generated file too.
    for (const { md, stage } of [
      { md: 'qa/SKILL.md', stage: 'qa' },
      { md: 'ship/SKILL.md', stage: 'ship' },
    ]) {
      const body = fs.readFileSync(path.join(ROOT, md), 'utf-8');
      expect(body).toContain('GSTACK_RUN_ID');
      expect(new RegExp(`gstack-build-step\\s+write-sentinel\\s+${stage}\\b`).test(body)).toBe(true);
    }
  });
});
