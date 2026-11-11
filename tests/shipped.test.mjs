// The files the kit ships as data must work with the CLI as they are: the lessons log template that
// o11-flow-setup copies into a project, and the generic lessons that come with the pitfalls skill.
// The other test files use fixtures; these tests read the shipped files themselves.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const PITFALLS = path.join(ROOT, 'skills', 'outsystems-mcp-pitfalls');
const SCRIPT = path.join(PITFALLS, 'scripts', 'lessons.mjs');
const GENERIC = path.join(PITFALLS, 'references', 'generic-lessons.md');
const TEMPLATE = path.join(ROOT, 'skills', 'o11-flow-setup', 'assets', 'lessons-log.template.md');

// A checkout on Windows may turn the files into CRLF files: the tests read them as LF.
const text = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

const dirs = [];
after(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true, maxRetries: 3 });
});

/** A temporary project whose log is a copy of the shipped template. */
function projectFromTemplate() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shipped-'));
  dirs.push(root);
  const logPath = path.join(root, 'docs', 'outsystems', 'lessons-log.md');
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.copyFileSync(TEMPLATE, logPath);
  return { root, logPath };
}

/** Runs the CLI as installed: no --generic, so it reads the generic lessons shipped next to it. */
function run(cwd, args, input) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, input, encoding: 'utf8' });
  assert.equal(r.error, undefined, 'the process must start');
  return r;
}

/** The areas and the Skill statuses, as `help` prints them. */
function fromHelp() {
  const help = run(ROOT, ['help']).stdout.replace(/\s+/g, ' ');
  const areas = /Areas: ([^.]+)\./.exec(help)[1].split(',').map((a) => a.trim());
  return { areas, help };
}

const isDate = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};

/** The entries of the generic lessons file, read here without the CLI: every "### " heading after "## Entries". */
function genericEntries() {
  const lines = text(GENERIC).split('\n');
  const from = lines.findIndex((l) => /^## Entries\s*$/.test(l));
  assert.notEqual(from, -1, 'the file has a "## Entries" heading');
  const entries = [];
  for (let i = from + 1; i < lines.length; i += 1) {
    if (!lines[i].startsWith('### ')) continue;
    const parts = lines[i].slice(4).split(' · ');
    const fields = {};
    for (let k = i + 1; k < lines.length && !lines[k].startsWith('#'); k += 1) {
      const f = /^- \*\*([^*:]+):\*\*\s*(.*)$/.exec(lines[k]);
      if (f && !(f[1] in fields)) fields[f[1]] = f[2].trim();
    }
    entries.push({ line: i + 1, heading: lines[i], id: parts[0], date: parts[1], area: parts[2], title: parts.slice(3).join(' · '), fields });
  }
  return entries;
}

describe('the shipped lessons log template', () => {
  test('a new project log passes check --strict with no entry and no example to remove', () => {
    const p = projectFromTemplate();
    const r = run(p.root, ['check', '--strict']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /^0 entries, 0 errors, 0 warnings\n/);
    assert.doesNotMatch(r.stderr, /example entry/);
  });

  test('pending lists no project lesson for it', () => {
    const p = projectFromTemplate();
    const r = run(p.root, ['pending', '--project-only']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, 'Project lessons to read (0)\n');
  });

  test('the first add gives L-001, keeps the template as it is and leaves a log that passes check --strict', () => {
    const p = projectFromTemplate();
    const before = fs.readFileSync(p.logPath);
    const lesson = {
      date: '2026-11-11', area: 'ui', title: 'First lesson', symptom: 'It broke', cause: 'A reason', resolution: 'A fix',
      skill: 'not in any skill yet', scope: 'project', cost: 'one round', evidence: 'a commit', slide: 'no',
    };
    const added = run(p.root, ['add'], JSON.stringify(lesson));
    assert.equal(added.status, 0, added.stderr);
    assert.equal(added.stdout, 'L-001\n');
    assert.doesNotMatch(added.stderr, /example entry/);

    const now = fs.readFileSync(p.logPath);
    assert.ok(now.subarray(0, before.length).equals(before), 'the bytes of the template are untouched');
    assert.match(now.subarray(before.length).toString('utf8'), /^\r?\n?### L-001 · 2026-11-11 · ui · First lesson\r?\n/);

    const checked = run(p.root, ['check', '--strict']);
    assert.equal(checked.status, 0, checked.stdout + checked.stderr);
    assert.match(checked.stdout, /^1 entries, 0 errors, 0 warnings\n/);
  });

  test('it names every area, field and Skill status of the CLI', () => {
    const template = text(TEMPLATE);
    const { areas, help } = fromHelp();
    assert.equal(areas.length, 16);
    const listed = /`area` is one of: ([^.]+)\./.exec(template.replace(/\s+/g, ' '))[1].split(',').map((a) => a.trim());
    assert.deepEqual(listed, areas);
    // The format part must explain each field, and the example in the fenced block must show each one.
    const [format, example] = template.split(/^```$/m);
    assert.ok(example, 'the template has a fenced example');
    for (const field of ['Symptom', 'Cause', 'Resolution', 'Cost', 'Skill', 'Scope', 'Evidence', 'Slide']) {
      assert.ok(format.includes(`- **${field}:**`), `the format part explains the field ${field}`);
      assert.ok(example.includes(`- **${field}:**`), `the example shows the field ${field}`);
    }
    for (const status of ['covered (section)', 'partial', 'missing from the official skill', 'new in the skill', 'not in any skill yet']) {
      assert.ok(template.includes(`  - ${status}:`), `the template explains the status "${status}"`);
      assert.ok(help.includes(status), `help names the status "${status}"`);
    }
  });
});

describe('the shipped generic lessons', () => {
  const entries = genericEntries();
  const { areas } = fromHelp();

  test('there are entries, and every heading under Entries is a G entry', () => {
    assert.ok(entries.length > 0);
    for (const e of entries) {
      assert.match(e.id, /^G-\d{3,}$/, `line ${e.line}: "${e.heading}"`);
      assert.ok(e.title, `line ${e.line}: ${e.id} has a title`);
    }
  });

  test('the ids are unique and increase (gaps are allowed: a folded lesson retires its id)', () => {
    const nums = entries.map((e) => Number(e.id.slice(2)));
    assert.equal(new Set(nums).size, nums.length, 'no id is used twice');
    assert.deepEqual(nums, [...nums].sort((a, b) => a - b));
  });

  test('every entry has a real date, one of the 16 areas, and a symptom, a cause and a resolution', () => {
    for (const e of entries) {
      assert.ok(isDate(e.date), `${e.id}: the date "${e.date}" is a real day written YYYY-MM-DD`);
      assert.ok(areas.includes(e.area), `${e.id}: the area "${e.area}" is one of the 16`);
      for (const field of ['Symptom', 'Cause', 'Resolution']) {
        assert.ok(e.fields[field], `${e.id}: ${field} is written`);
      }
    }
  });

  test('the header lists the same 16 areas and a real snapshot date', () => {
    const header = text(GENERIC).split('## Entries')[0].replace(/\s+/g, ' ');
    const listed = /`area` is one of: ([^.]+)\./.exec(header)[1].split(',').map((a) => a.trim());
    assert.deepEqual(listed, areas);
    const snapshot = /Snapshot: (\S+?)\.?(?:\s|$)/.exec(header);
    assert.ok(snapshot && isDate(snapshot[1]), 'the header has "Snapshot: YYYY-MM-DD"');
  });

  test('the CLI reads every entry of the file', () => {
    const r = run(os.tmpdir(), ['pending', '--generic-only', '--json']);
    assert.equal(r.status, 0, r.stderr);
    const rows = JSON.parse(r.stdout);
    assert.deepEqual(rows.map((row) => row.id), entries.map((e) => e.id));
    for (const row of rows) assert.equal(row.source, 'generic');
  });

  test('show prints a shipped entry word for word', () => {
    const first = entries[0];
    const r = run(os.tmpdir(), ['show', first.id]);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.startsWith(`${first.heading}\n`));
    assert.ok(r.stdout.includes(`- **Symptom:** ${first.fields.Symptom}`));
  });

  test('every G id that a text of the kit cites is an entry of the file', () => {
    const known = new Set(entries.map((e) => e.id));
    const files = [
      path.join(ROOT, 'README.md'),
      path.join(PITFALLS, 'SKILL.md'),
      path.join(ROOT, 'skills', 'o11-flow-setup', 'SKILL.md'),
      ...fs.readdirSync(path.join(PITFALLS, 'references')).map((name) => path.join(PITFALLS, 'references', name)),
    ];
    for (const file of files) {
      // Examples in the texts use G-001 and the format line uses G-NNN; only real ids are checked.
      for (const [id] of text(file).matchAll(/\bG-\d{3,}\b/g)) {
        assert.ok(known.has(id), `${path.relative(ROOT, file)} cites ${id}, which is not in generic-lessons.md`);
      }
    }
  });
});
