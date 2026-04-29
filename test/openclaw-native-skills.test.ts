import { describe, test, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(import.meta.dir, '..');

const OPENCLAW_NATIVE_SKILLS = [
  'openclaw/skills/gstack-openclaw-investigate/SKILL.md',
  'openclaw/skills/gstack-openclaw-office-hours/SKILL.md',
  'openclaw/skills/gstack-openclaw-ceo-review/SKILL.md',
  'openclaw/skills/gstack-openclaw-retro/SKILL.md',
];

function extractFrontmatter(content: string): string {
  expect(content.startsWith('---\n')).toBe(true);
  const fmEnd = content.indexOf('\n---', 4);
  expect(fmEnd).toBeGreaterThan(0);
  return content.slice(4, fmEnd);
}

function parseFlatFrontmatter(frontmatter: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of frontmatter.split('\n')) {
    const line = raw.trimEnd();
    if (line === '') continue;
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
    if (!m) throw new Error(`malformed frontmatter line: ${line}`);
    let value = m[2];
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    out[m[1]] = value;
  }
  return out;
}

describe('OpenClaw native skills', () => {
  test('frontmatter parses as YAML and keeps only name + description', () => {
    for (const skill of OPENCLAW_NATIVE_SKILLS) {
      const content = fs.readFileSync(path.join(ROOT, skill), 'utf-8');
      const frontmatter = extractFrontmatter(content);
      const parsed = parseFlatFrontmatter(frontmatter);

      expect(Object.keys(parsed).sort()).toEqual(['description', 'name']);
      expect(typeof parsed.name).toBe('string');
      expect(typeof parsed.description).toBe('string');
      expect(parsed.name.length).toBeGreaterThan(0);
      expect(parsed.description.length).toBeGreaterThan(0);
    }
  });
});
