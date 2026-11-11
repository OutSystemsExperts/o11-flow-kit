import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(here, '../skills/outsystems-mcp-pitfalls/scripts/lessons.mjs');
const FIXTURES = path.join(here, 'fixtures');
// A checkout on Windows may turn the fixtures into CRLF files: the tests ask for LF and build CRLF twins themselves.
const fixture = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8').replace(/\r\n/g, '\n');

const AREAS = [
  'session', 'edit-loop', 'merge-publish', 'dependencies', 'ui', 'charts', 'theme', 'model',
  'logic', 'tests', 'environment', 'quota', 'collaboration', 'security', 'planning', 'review',
];

// ---------------------------------------------------------------- helpers

const dirs = [];
after(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true, maxRetries: 3 });
});

/** A temporary project. `log` is the text of the project log (null: no log at all). */
function project({ log = null, generic = '' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lessons-'));
  dirs.push(root);
  const logPath = path.join(root, 'docs', 'outsystems', 'lessons-log.md');
  if (log !== null) {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, log);
  }
  const genericPath = path.join(root, 'generic.md');
  fs.writeFileSync(genericPath, generic);
  return { root, logPath, genericPath, lock: logPath + '.lock' };
}

/** Runs the CLI inside the project. The generic file is the project's own unless `generic` is false. */
function run(proj, args, { input, env, cwd, generic = true } = {}) {
  const argv = [SCRIPT, ...args];
  if (generic && proj.genericPath) argv.push('--generic', proj.genericPath);
  const r = spawnSync(process.execPath, argv, {
    cwd: cwd ?? proj.root,
    input,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  assert.equal(r.error, undefined, 'the process must start');
  return r;
}

const read = (p) => fs.readFileSync(p, 'utf8');
const json = (r) => JSON.parse(r.stdout);

const FIELD_ORDER = ['Symptom', 'Cause', 'Resolution', 'Cost', 'Skill', 'Scope', 'Evidence', 'Slide'];

/** One entry as a block of lines (no trailing newline). A field set to null is left out. */
function entry({
  id, date = '2026-10-01', phase, area = 'ui', title = `Title of ${id}`, symptom = 'It broke',
  cause = 'A reason', resolution = 'A fix', cost = '1 round', skill = 'not in any skill yet',
  scope = 'generic', evidence = 'a commit', slide = 'no',
}) {
  const heading = ['###', id, '·', date, ...(phase ? ['·', phase] : []), '·', area, '·', title].join(' ');
  const values = { Symptom: symptom, Cause: cause, Resolution: resolution, Cost: cost, Skill: skill, Scope: scope, Evidence: evidence, Slide: slide };
  const lines = FIELD_ORDER.filter((k) => values[k] !== null).map((k) => `- **${k}:** ${values[k]}`);
  return [heading, ...lines].join('\n');
}

const HEADER = '# Lessons log\n\nIntro.\n\n## Entries\n';
/** A whole log: the header, then each entry after a blank line. */
const logOf = (...blocks) => HEADER + blocks.map((b) => `\n${b}\n`).join('');

const lesson = (over = {}) => ({
  date: '2026-11-11', area: 'ui', title: 'A new lesson', symptom: 'It broke', cause: 'A reason',
  resolution: 'A fix', skill: 'not in any skill yet', scope: 'project', ...over,
});

/** The block that `add` is expected to write for `lesson()`, with defaults filled in. */
const newBlock = (id, over = {}) => {
  const l = lesson(over);
  return entry({
    id, date: l.date, phase: l.phase, area: l.area, title: l.title, symptom: l.symptom, cause: l.cause,
    resolution: l.resolution, cost: l.cost ?? 'not recorded', skill: l.skill, scope: l.scope,
    evidence: l.evidence ?? 'none recorded', slide: l.slide ?? 'no',
  });
};

const add = (proj, payload, opts = {}) => run(proj, ['add'], { input: JSON.stringify(payload), ...opts });

const GENERIC_FIXTURE = fixture('generic-lessons.md');
const OLD_LOG = fixture('old-log.md');
const LEGACY_TEMPLATE = fixture('legacy-template.md');

// ---------------------------------------------------------------- usage

describe('usage', () => {
  const commands = ['pending', 'show', 'add', 'check', 'share', 'help'];
  const options = [
    '--area', '--full', '--json', '--project-only', '--generic-only', '--file', '--dry-run',
    '--strict', '--repo', '--log', '--generic',
  ];

  for (const flag of ['help', '--help', '-h']) {
    test(`${flag} prints the usage on stdout and exits 0`, () => {
      const r = run(project(), [flag], { generic: false });
      assert.equal(r.status, 0);
      for (const word of [...commands, ...options]) assert.ok(r.stdout.includes(word), `usage lists ${word}`);
    });
  }

  test('a command followed by --help prints the same usage', () => {
    const p = project();
    assert.equal(run(p, ['pending', '--help'], { generic: false }).stdout, run(p, ['help'], { generic: false }).stdout);
  });

  test('the usage text is the first comment block of the script', () => {
    const lines = read(SCRIPT).split(/\r?\n/);
    const block = [];
    for (const line of lines) {
      if (!line.startsWith('//')) break;
      block.push(line.replace(/^\/\/ ?/, ''));
    }
    assert.equal(run(project(), ['help'], { generic: false }).stdout, block.join('\n') + '\n');
  });

  test('no command is a usage error', () => {
    const r = run(project(), [], { generic: false });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /pending/);
    assert.equal(r.stdout, '');
  });

  test('an unknown command is a usage error that names it and prints the usage', () => {
    const r = run(project(), ['frobnicate'], { generic: false });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /frobnicate/);
    assert.match(r.stderr, /pending/);
  });

  test('an unknown option is a usage error', () => {
    const r = run(project({ log: HEADER }), ['pending', '--nope']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--nope/);
  });

  test('an option of another command is a usage error', () => {
    const r = run(project({ log: HEADER }), ['check', '--dry-run']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--dry-run/);
  });

  test('an option that needs a value and gets none is a usage error', () => {
    const r = run(project({ log: HEADER }), ['pending', '--area']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--area/);
  });

  test('--option=value works like --option value', () => {
    const p = project({ log: HEADER, generic: GENERIC_FIXTURE });
    const a = run(p, ['pending', '--area=ui', '--json']);
    const b = run(p, ['pending', '--area', 'ui', '--json']);
    assert.equal(a.status, 0);
    assert.equal(a.stdout, b.stdout);
  });

  test('the script imports only the allowed modules and never starts a process or opens a socket', () => {
    const src = read(SCRIPT);
    const imported = [...src.matchAll(/^import\s[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1]).sort();
    const allowed = ['node:fs', 'node:os', 'node:path', 'node:process', 'node:url'];
    for (const mod of imported) assert.ok(allowed.includes(mod), `${mod} is not an allowed import`);
    assert.doesNotMatch(src, /child_process|node:https?|node:net|node:dns|\bfetch\s*\(|\brequire\s*\(|await import\s*\(/);
  });
});

// ---------------------------------------------------------------- add

describe('add: ids', () => {
  test('the first id on a log with no entry is L-001', () => {
    const p = project({ log: HEADER });
    const r = add(p, lesson());
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, 'L-001\n');
    assert.equal(read(p.logPath), HEADER + '\n' + newBlock('L-001') + '\n');
  });

  test('the first id on an empty file is L-001 and the file does not start with a blank line', () => {
    const p = project({ log: '' });
    assert.equal(add(p, lesson()).status, 0);
    assert.equal(read(p.logPath), newBlock('L-001') + '\n');
  });

  test('the id is the highest one plus one, not the count', () => {
    const p = project({ log: logOf(entry({ id: 'L-002' }), entry({ id: 'L-012' }), entry({ id: 'L-005' })) });
    assert.equal(add(p, lesson()).stdout, 'L-013\n');
  });

  test('past 999 the id grows to four digits', () => {
    const p = project({ log: logOf(entry({ id: 'L-999' })) });
    assert.equal(add(p, lesson()).stdout, 'L-1000\n');
    assert.match(read(p.logPath), /^### L-1000 · /m);
  });

  test('a batch gets consecutive ids, in order, each after a blank line', () => {
    const p = project({ log: logOf(entry({ id: 'L-001' })) });
    const r = add(p, [lesson({ title: 'First' }), lesson({ title: 'Second' })]);
    assert.equal(r.stdout, 'L-002 L-003\n');
    assert.equal(
      read(p.logPath),
      logOf(entry({ id: 'L-001' })) + '\n' + newBlock('L-002', { title: 'First' }) + '\n\n' + newBlock('L-003', { title: 'Second' }) + '\n',
    );
  });

  test('a log whose last line has no line ending still gets a clean append', () => {
    const p = project({ log: logOf(entry({ id: 'L-001' })).trimEnd() });
    assert.equal(add(p, lesson()).status, 0);
    assert.equal(read(p.logPath), logOf(entry({ id: 'L-001' })) + '\n' + newBlock('L-002') + '\n');
  });

  test('blank lines already at the end are left alone and no more are added', () => {
    const before = logOf(entry({ id: 'L-001' })) + '\n\n\n';
    const p = project({ log: before });
    assert.equal(add(p, lesson()).status, 0);
    assert.equal(read(p.logPath), before + newBlock('L-002') + '\n');
  });

  test('existing entries are never changed', () => {
    const before = logOf(entry({ id: 'L-001', skill: 'free text' }), entry({ id: 'L-002', phase: 'Phase 2' }));
    const p = project({ log: before });
    add(p, lesson());
    assert.ok(read(p.logPath).startsWith(before));
  });
});

describe('add: the bytes of the log are kept', () => {
  const base = logOf(entry({ id: 'L-001' }));
  const content = base.trimEnd();
  const isPrefix = (before, after) => after.length >= before.length && after.subarray(0, before.length).equals(before);

  // [name, what the log ends with after its last content line, what add must append to it]
  for (const [name, tail, appended] of [
    ['no line ending', '', `\n\n${newBlock('L-002')}\n`],
    ['one line ending', '\n', `\n${newBlock('L-002')}\n`],
    ['one blank line', '\n\n', `${newBlock('L-002')}\n`],
    ['three blank lines', '\n\n\n\n', `${newBlock('L-002')}\n`],
    ['whitespace-only lines', '\n   \n\t\n', `${newBlock('L-002')}\n`],
    ['a whitespace-only last line with no line ending', '\n  ', `\n${newBlock('L-002')}\n`],
    ['trailing spaces on the last line', '   \n', `\n${newBlock('L-002')}\n`],
  ]) {
    test(`a log that ends with ${name}: the original bytes are an exact prefix`, () => {
      const before = Buffer.from(content + tail);
      const p = project({ log: before });
      assert.equal(add(p, lesson()).status, 0);
      const after = fs.readFileSync(p.logPath);
      assert.ok(isPrefix(before, after), 'the original bytes stay as they were');
      assert.equal(after.subarray(before.length).toString(), appended);
    });
  }

  test('a log with mixed line endings keeps every byte, and the new entry follows the ending of the last line', () => {
    const crlf = (s) => s.replace(/\n/g, '\r\n');
    const before = crlf(HEADER + '\n' + entry({ id: 'L-001' }) + '\n') + '\n' + entry({ id: 'L-002' }) + '\n';
    const p = project({ log: before });
    assert.equal(add(p, lesson()).status, 0);
    assert.equal(read(p.logPath), before + '\n' + newBlock('L-003') + '\n');
  });

  test('a log whose last line ends in CRLF but whose first lines end in LF gets CRLF', () => {
    const before = HEADER + '\n' + entry({ id: 'L-001' }).replace(/\n/g, '\r\n') + '\r\n';
    const p = project({ log: before });
    assert.equal(add(p, lesson()).status, 0);
    assert.equal(read(p.logPath), before + '\r\n' + newBlock('L-002').replace(/\n/g, '\r\n') + '\r\n');
  });

  test('bytes that are not UTF-8 in an existing entry survive an append', () => {
    const at = base.indexOf('It broke');
    const before = Buffer.concat([Buffer.from(base.slice(0, at) + 'caf'), Buffer.from([0xe9]), Buffer.from(base.slice(at + 'It'.length))]);
    const p = project({ log: before });
    assert.equal(add(p, lesson()).status, 0);
    assert.ok(isPrefix(before, fs.readFileSync(p.logPath)));
  });

  test('a log that cannot be written is reported as such, and left as it was', (t) => {
    const p = project({ log: base });
    fs.chmodSync(p.logPath, 0o444);
    try {
      try {
        fs.accessSync(p.logPath, fs.constants.W_OK);
        t.skip('this account can write to a read-only file');
        return;
      } catch { /* the file is read-only for us, as the test needs */ }
      const r = add(p, lesson());
      assert.equal(r.status, 1);
      assert.match(r.stderr, /lessons-log\.md/);
      assert.doesNotMatch(r.stderr, /\n\s+at /, 'a message, not a stack trace');
      assert.equal(fs.existsSync(p.lock), false);
    } finally {
      fs.chmodSync(p.logPath, 0o644);
    }
    assert.equal(read(p.logPath), base);
  });

  test('a file system error on the log is a message and exit 1, not a stack trace', () => {
    const p = project();
    const dir = path.join(p.root, 'a-folder.md');
    fs.mkdirSync(dir);
    const r = run(p, ['check', '--log', dir]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /a-folder\.md/);
    assert.doesNotMatch(r.stderr, /\n\s+at /);
  });
});

describe('add: several runs at the same time', () => {
  test('twelve adds at once get twelve distinct ids, all land in the log, and no lock is left', async () => {
    const p = project({ log: logOf(entry({ id: 'L-001' })) });
    const children = Array.from({ length: 12 }, (_, i) => new Promise((resolve, reject) => {
      const c = spawn(process.execPath, [SCRIPT, 'add'], { cwd: p.root, env: { ...process.env, O11_LESSONS_LOCK_WAIT_MS: '60000' } });
      let stdout = '';
      let stderr = '';
      c.stdout.on('data', (d) => { stdout += d; });
      c.stderr.on('data', (d) => { stderr += d; });
      c.on('error', reject);
      c.on('close', (status) => resolve({ status, stdout, stderr }));
      c.stdin.end(JSON.stringify(lesson({ title: `Concurrent ${i}` })));
    }));
    const results = await Promise.all(children);
    for (const r of results) assert.equal(r.status, 0, r.stderr);
    const ids = results.map((r) => r.stdout.trim()).sort();
    assert.deepEqual(ids, Array.from({ length: 12 }, (_, i) => `L-${String(i + 2).padStart(3, '0')}`));
    const text = read(p.logPath);
    for (let i = 0; i < 12; i += 1) assert.equal(text.split(`· Concurrent ${i}\n`).length, 2, `Concurrent ${i} is in the log once`);
    assert.equal(run(p, ['check']).stdout, '13 entries, 0 errors, 0 warnings\n');
    assert.equal(fs.existsSync(p.lock), false);
  });
});

describe('add: a code fence that is never closed', () => {
  const open = `${HEADER}\n${entry({ id: 'L-001' })}\n\n\`\`\`\nsome text\n`;
  const opensAt = open.split('\n').indexOf('```') + 1;

  test('add refuses, names the line and writes nothing', () => {
    const p = project({ log: open });
    const r = add(p, lesson());
    assert.equal(r.status, 1);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, new RegExp(`line ${opensAt}\\b`));
    assert.match(r.stderr, /fence/i);
    assert.equal(read(p.logPath), open);
    assert.equal(fs.existsSync(p.lock), false);
  });

  test('add --dry-run refuses too', () => {
    const r = run(project({ log: open }), ['add', '--dry-run'], { input: JSON.stringify(lesson()) });
    assert.equal(r.status, 1);
    assert.equal(r.stdout, '');
  });

  test('two adds do not hand out the same id: neither writes', () => {
    const p = project({ log: open });
    add(p, lesson());
    add(p, lesson());
    assert.equal(read(p.logPath), open);
  });

  test('check reports it as an error with the line', () => {
    const r = run(project({ log: open }), ['check']);
    assert.equal(r.status, 1);
    const lines = r.stdout.trimEnd().split('\n');
    assert.match(lines[0], /^1 entries, 1 errors, 0 warnings$/);
    assert.match(lines[1], new RegExp(`line ${opensAt}\\b.*fence`, 'i'));
  });

  test('pending and show say that the entries after the fence are hidden', () => {
    const p = project({ log: open });
    for (const args of [['pending', '--project-only'], ['show', 'L-001']]) {
      const r = run(p, args);
      assert.match(r.stderr, new RegExp(`line ${opensAt}\\b`), args.join(' '));
      assert.match(r.stderr, /fence/i);
    }
  });

  test('a closed fence is fine', () => {
    const closed = `${open}\`\`\`\n`;
    const p = project({ log: closed });
    assert.equal(run(p, ['check']).stdout, '1 entries, 0 errors, 0 warnings\n');
    assert.equal(add(p, lesson()).status, 0);
  });

  test('triple backticks that open an inline code span are not a fence', () => {
    const log = `${HEADER}\n\`\`\`inline\`\`\` is a code span, not a fence.\n\n${entry({ id: 'L-001' })}\n`;
    const p = project({ log });
    assert.equal(run(p, ['check']).stdout, '1 entries, 0 errors, 0 warnings\n');
    assert.equal(add(p, lesson()).stdout, 'L-002\n');
  });
});

describe('add: validation', () => {
  test('nothing is written when any entry is invalid, and every problem is listed', () => {
    const before = logOf(entry({ id: 'L-001' }));
    const p = project({ log: before });
    const r = add(p, [lesson(), lesson({ area: 'nope', cause: '' }), lesson({ title: ' ', scope: 'both' })]);
    assert.equal(r.status, 1);
    assert.equal(r.stdout, '');
    assert.equal(read(p.logPath), before);
    assert.match(r.stderr, /entry 2.*area/s);
    assert.match(r.stderr, /entry 2.*cause/s);
    assert.match(r.stderr, /entry 3.*title/s);
    assert.match(r.stderr, /entry 3.*scope/s);
    assert.doesNotMatch(r.stderr, /entry 1/);
  });

  for (const field of ['area', 'title', 'symptom', 'cause', 'resolution', 'skill', 'scope']) {
    for (const [what, value] of [['missing', undefined], ['empty', ''], ['blank', '  \n\t ']]) {
      test(`${field} ${what} is refused and named`, () => {
        const before = logOf(entry({ id: 'L-001' }));
        const p = project({ log: before });
        const payload = lesson();
        if (value === undefined) delete payload[field];
        else payload[field] = value;
        const r = add(p, payload);
        assert.equal(r.status, 1);
        assert.match(r.stderr, new RegExp(field));
        assert.equal(read(p.logPath), before);
      });
    }
  }

  test('an unknown area lists the 16 areas', () => {
    const r = add(project({ log: HEADER }), lesson({ area: 'frontend' }));
    assert.equal(r.status, 1);
    for (const a of AREAS) assert.ok(r.stderr.includes(a), `lists ${a}`);
  });

  for (const [wrong, meant] of [['testing', 'tests'], ['reactive-ui', 'ui'], ['data-model', 'model'], ['access', 'security']]) {
    test(`area "${wrong}" is refused with the hint "${meant}"`, () => {
      const r = add(project({ log: HEADER }), lesson({ area: wrong }));
      assert.equal(r.status, 1);
      assert.ok(r.stderr.includes(`"${meant}"`), r.stderr);
    });
  }

  test('every one of the 16 areas is accepted, in any case', () => {
    const p = project({ log: HEADER });
    for (const a of AREAS) assert.equal(add(p, lesson({ area: a.toUpperCase() })).status, 0, a);
    assert.equal([...read(p.logPath).matchAll(/^### L-\d+ · \S+ · (\S+) · /gm)].map((m) => m[1]).join(','), AREAS.join(','));
  });

  for (const skill of [
    'covered (SKILL.md section 3)', 'covered (references/reactive-ui.md) · official: missing', 'partial',
    'partial: only the symptom', 'missing from the official skill', 'new in the skill',
    'new in our skill', 'new in our skill (SKILL.md section 2)', 'not in any skill yet',
    'Not In Any Skill Yet', 'COVERED (section 1)',
  ]) {
    test(`skill "${skill}" is accepted and written as given`, () => {
      const p = project({ log: HEADER });
      const r = add(p, lesson({ skill }));
      assert.equal(r.status, 0, r.stderr);
      assert.ok(read(p.logPath).includes(`- **Skill:** ${skill}\n`));
    });
  }

  for (const skill of ['covered', 'covered ()', 'covered (   )', 'covered section 3', 'maybe', 'unknown', 'new', 'not covered']) {
    test(`skill "${skill}" is refused`, () => {
      const before = HEADER;
      const p = project({ log: before });
      const r = add(p, lesson({ skill }));
      assert.equal(r.status, 1);
      assert.match(r.stderr, /skill/i);
      assert.equal(read(p.logPath), before);
    });
  }

  test('a covered skill without a section says what to write', () => {
    const r = add(project({ log: HEADER }), lesson({ skill: 'covered' }));
    assert.match(r.stderr, /covered \(/);
  });

  test('a skill that names no status lists the five', () => {
    const r = add(project({ log: HEADER }), lesson({ skill: 'maybe' }));
    for (const s of ['covered', 'partial', 'missing from the official skill', 'new in the skill', 'not in any skill yet']) {
      assert.ok(r.stderr.includes(s), s);
    }
  });

  test('scope accepts generic and project in any case, and nothing else', () => {
    const p = project({ log: HEADER });
    assert.equal(add(p, lesson({ scope: 'Generic' })).status, 0);
    assert.equal(add(p, lesson({ scope: 'PROJECT' })).status, 0);
    assert.match(read(p.logPath), /- \*\*Scope:\*\* generic\n/);
    assert.match(read(p.logPath), /- \*\*Scope:\*\* project\n/);
    const r = add(p, lesson({ scope: 'global' }));
    assert.equal(r.status, 1);
    assert.match(r.stderr, /generic/);
  });

  test('an unknown field is refused, so a typo is not lost silently', () => {
    const r = add(project({ log: HEADER }), lesson({ evidnce: 'a commit' }));
    assert.equal(r.status, 1);
    assert.match(r.stderr, /evidnce/);
  });

  test('field names are read in any case', () => {
    const p = project({ log: HEADER });
    const payload = Object.fromEntries(Object.entries(lesson()).map(([k, v]) => [k[0].toUpperCase() + k.slice(1), v]));
    assert.equal(add(p, payload).status, 0);
  });

  test('a value that is not text is refused', () => {
    const r = add(project({ log: HEADER }), lesson({ symptom: 42 }));
    assert.equal(r.status, 1);
    assert.match(r.stderr, /symptom/);
  });

  test('an entry that is not an object is refused', () => {
    const r = add(project({ log: HEADER }), ['text']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /entry 1/);
  });

  test('an empty list has nothing to add', () => {
    const r = add(project({ log: HEADER }), []);
    assert.notEqual(r.status, 0);
    assert.notEqual(r.stderr, '');
  });

  for (const date of ['11/11/2026', '2026-13-01', '2026-02-30', 'today', '20261111']) {
    test(`date "${date}" is refused`, () => {
      const r = add(project({ log: HEADER }), lesson({ date }));
      assert.equal(r.status, 1);
      assert.match(r.stderr, /YYYY-MM-DD/);
    });
  }
});

describe('add: what is written', () => {
  test('the defaults: today, not recorded, none recorded, no', () => {
    const p = project({ log: HEADER });
    const payload = lesson();
    delete payload.date;
    const lo = new Date();
    const r = add(p, payload);
    const hi = new Date();
    assert.equal(r.status, 0, r.stderr);
    const day = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const text = read(p.logPath);
    const date = /^### L-001 · (\S+) · /m.exec(text)[1];
    assert.ok([day(lo), day(hi)].includes(date), `${date} is today`);
    assert.match(text, /- \*\*Cost:\*\* not recorded\n/);
    assert.match(text, /- \*\*Evidence:\*\* none recorded\n/);
    assert.match(text, /- \*\*Slide:\*\* no\n$/);
  });

  test('the fields come in the documented order', () => {
    const p = project({ log: HEADER });
    add(p, lesson({ cost: '2 rounds', evidence: 'commit abc', slide: 'yes', phase: 'Phase 1' }));
    assert.equal(read(p.logPath), HEADER + '\n' + newBlock('L-001', { cost: '2 rounds', evidence: 'commit abc', slide: 'yes', phase: 'Phase 1' }) + '\n');
  });

  for (const [given, written] of [['yes', 'yes'], ['YES', 'yes'], [true, 'yes'], ['no', 'no'], [false, 'no'], ['No', 'no']]) {
    test(`slide ${JSON.stringify(given)} is written as ${written}`, () => {
      const p = project({ log: HEADER });
      assert.equal(add(p, lesson({ slide: given })).status, 0);
      assert.match(read(p.logPath), new RegExp(`- \\*\\*Slide:\\*\\* ${written}\\n$`));
    });
  }

  test('a slide value that is neither yes nor no is refused', () => {
    const r = add(project({ log: HEADER }), lesson({ slide: 'maybe' }));
    assert.equal(r.status, 1);
    assert.match(r.stderr, /slide/);
  });

  test('every value is flattened to one line', () => {
    const p = project({ log: HEADER });
    const r = add(p, lesson({
      title: '  A title\nover two lines ',
      symptom: 'First line\r\nsecond line\n\n   third\tline',
      cause: 'one\ntwo',
      resolution: ' fixed \n',
      cost: 'a\nb',
      evidence: 'x\n\ny',
    }));
    assert.equal(r.status, 0, r.stderr);
    const text = read(p.logPath);
    assert.ok(text.includes('· A title over two lines\n'));
    assert.ok(text.includes('- **Symptom:** First line second line third line\n'));
    assert.ok(text.includes('- **Cause:** one two\n'));
    assert.ok(text.includes('- **Resolution:** fixed\n'));
    assert.ok(text.includes('- **Cost:** a b\n'));
    assert.ok(text.includes('- **Evidence:** x y\n'));
    assert.equal(text.split('\n').filter((l) => l.startsWith('- **')).length, 8);
  });

  test('the separator in the title and the phase becomes " - "', () => {
    const p = project({ log: HEADER });
    const r = add(p, lesson({ title: 'Edit · publish loop', phase: 'Phase 2 · stage B' }));
    assert.equal(r.status, 0, r.stderr);
    const heading = read(p.logPath).split('\n').find((l) => l.startsWith('### L-001'));
    assert.equal(heading, '### L-001 · 2026-11-11 · Phase 2 - stage B · ui · Edit - publish loop');
    const shown = json(run(p, ['pending', '--json', '--project-only']));
    assert.equal(shown[0].title, 'Edit - publish loop');
    assert.equal(shown[0].phase, 'Phase 2 - stage B');
    assert.equal(shown[0].area, 'ui');
  });

  test('a phase or title that starts or ends with the dot of the separator does not break the heading', () => {
    const p = project({ log: HEADER });
    const r = add(p, lesson({ phase: 'Phase 1 ·', title: '· a lead dot and a tail dot ·' }));
    assert.equal(r.status, 0, r.stderr);
    const [row] = json(run(p, ['pending', '--json', '--project-only']));
    assert.deepEqual([row.phase, row.area, row.title], ['Phase 1 -', 'ui', '- a lead dot and a tail dot -']);
    assert.deepEqual(json(run(p, ['pending', '--json', '--project-only', '--area', 'ui'])).map((x) => x.id), ['L-001']);
    assert.equal(run(p, ['check']).stdout, '1 entries, 0 errors, 0 warnings\n');
  });

  test('the separator elsewhere is left alone', () => {
    const p = project({ log: HEADER });
    add(p, lesson({ symptom: 'a · b' }));
    assert.ok(read(p.logPath).includes('- **Symptom:** a · b\n'));
  });

  test('an entry written by add reads back the same through the other commands', () => {
    const p = project({ log: HEADER });
    add(p, lesson({ phase: 'Phase 3', title: 'Round trip', skill: 'partial: one variant', cost: '3 rounds', evidence: 'ev' }));
    const [row] = json(run(p, ['pending', '--json', '--project-only']));
    assert.deepEqual(row, {
      id: 'L-001', source: 'project', date: '2026-11-11', phase: 'Phase 3', area: 'ui', title: 'Round trip',
      status: 'partial', scope: 'project',
      fields: {
        symptom: 'It broke', cause: 'A reason', resolution: 'A fix', cost: '3 rounds',
        skill: 'partial: one variant', scope: 'project', evidence: 'ev', slide: 'no',
      },
    });
    assert.equal(run(p, ['check']).stdout, '1 entries, 0 errors, 0 warnings\n');
  });
});

describe('add: input', () => {
  test('one object or an array, from stdin', () => {
    const p = project({ log: HEADER });
    assert.equal(add(p, lesson()).stdout, 'L-001\n');
    assert.equal(add(p, [lesson(), lesson()]).stdout, 'L-002 L-003\n');
  });

  test('--file reads the entries from a file', () => {
    const p = project({ log: HEADER });
    const file = path.join(p.root, 'entries.json');
    fs.writeFileSync(file, JSON.stringify(lesson()));
    const r = run(p, ['add', '--file', file]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, 'L-001\n');
  });

  test('--file may be a relative path', () => {
    const p = project({ log: HEADER });
    fs.writeFileSync(path.join(p.root, 'entries.json'), JSON.stringify(lesson()));
    assert.equal(run(p, ['add', '--file', 'entries.json']).status, 0);
  });

  test('--file that does not exist is exit 2 and says so', () => {
    const p = project({ log: HEADER });
    const r = run(p, ['add', '--file', path.join(p.root, 'missing.json')]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /missing\.json/);
  });

  test('a file with a UTF-8 BOM is read', () => {
    const p = project({ log: HEADER });
    const file = path.join(p.root, 'bom.json');
    fs.writeFileSync(file, '\uFEFF' + JSON.stringify(lesson()));
    assert.equal(run(p, ['add', '--file', file]).status, 0);
  });

  test('a UTF-16 file, as Windows PowerShell writes it, is read', () => {
    const p = project({ log: HEADER });
    const file = path.join(p.root, 'utf16.json');
    fs.writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(JSON.stringify(lesson({ title: 'Ação' })), 'utf16le')]));
    const r = run(p, ['add', '--file', file]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(read(p.logPath), /· Ação\n/);
  });

  test('empty stdin is a usage error that points to --file', () => {
    const p = project({ log: HEADER });
    const r = run(p, ['add'], { input: '' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--file/);
  });

  test('stdin that is not JSON is refused and nothing is written', () => {
    const p = project({ log: HEADER });
    const r = run(p, ['add'], { input: '{ not json' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /JSON/);
    assert.equal(read(p.logPath), HEADER);
  });

  test('non-ASCII text survives', () => {
    const p = project({ log: HEADER });
    add(p, lesson({ title: 'Gráfico não aparece', symptom: 'ç ã é — “quotes”' }));
    assert.ok(read(p.logPath).includes('Gráfico não aparece'));
    assert.ok(read(p.logPath).includes('ç ã é — “quotes”'));
  });
});

describe('add: dry run', () => {
  test('--dry-run prints the block and writes nothing', () => {
    const before = logOf(entry({ id: 'L-001' }));
    const p = project({ log: before });
    const r = run(p, ['add', '--dry-run'], { input: JSON.stringify(lesson()) });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes(newBlock('L-002')));
    assert.equal(read(p.logPath), before);
  });

  test('--dry-run leaves the file and the folder untouched', () => {
    const before = logOf(entry({ id: 'L-001' }));
    const p = project({ log: before });
    const r = run(p, ['add', '--dry-run'], { input: JSON.stringify([lesson({ title: 'One' }), lesson({ title: 'Two' })]) });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes(newBlock('L-002', { title: 'One' })));
    assert.ok(r.stdout.includes(newBlock('L-003', { title: 'Two' })));
    assert.equal(read(p.logPath), before);
    assert.deepEqual(fs.readdirSync(path.dirname(p.logPath)), ['lessons-log.md']);
  });

  test('--dry-run takes no lock, so it works while another run holds one', () => {
    const p = project({ log: HEADER });
    fs.writeFileSync(p.lock, 'someone else');
    const r = run(p, ['add', '--dry-run'], { input: JSON.stringify(lesson()), env: { O11_LESSONS_LOCK_WAIT_MS: '200' } });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(read(p.lock), 'someone else');
  });

  test('--dry-run still validates', () => {
    const p = project({ log: HEADER });
    const r = run(p, ['add', '--dry-run'], { input: JSON.stringify(lesson({ area: 'nope' })) });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /area/);
  });

  test('--dry-run on the legacy template says the example would go, and keeps it', () => {
    const p = project({ log: LEGACY_TEMPLATE });
    const r = run(p, ['add', '--dry-run'], { input: JSON.stringify(lesson()) });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes(newBlock('L-001')));
    assert.equal(read(p.logPath), LEGACY_TEMPLATE);
  });
});

describe('add: the hint to share', () => {
  const hint = (r, id) => r.stderr.split('\n').filter((l) => l.includes(`share ${id}`));

  for (const skill of ['not in any skill yet', 'partial', 'Partial: one variant']) {
    test(`a generic lesson with skill "${skill}" asks to be shared`, () => {
      const r = add(project({ log: HEADER }), lesson({ scope: 'generic', skill }));
      assert.equal(r.status, 0);
      const lines = hint(r, 'L-001');
      assert.equal(lines.length, 1, r.stderr);
      assert.match(lines[0], /ask the user/i);
    });
  }

  for (const skill of ['covered (SKILL.md section 3)', 'missing from the official skill', 'new in the skill', 'new in our skill']) {
    test(`a generic lesson with skill "${skill}" gets no hint`, () => {
      const r = add(project({ log: HEADER }), lesson({ scope: 'generic', skill }));
      assert.equal(r.status, 0);
      assert.doesNotMatch(r.stderr, /share/);
    });
  }

  test('a project lesson gets no hint, whatever its skill', () => {
    const r = add(project({ log: HEADER }), lesson({ scope: 'project', skill: 'not in any skill yet' }));
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stderr, /share/);
  });

  test('in a batch, only the entries that qualify get a hint, each with its own id', () => {
    const r = add(project({ log: HEADER }), [
      lesson({ scope: 'generic' }), lesson({ scope: 'project' }), lesson({ scope: 'generic', skill: 'new in the skill' }), lesson({ scope: 'generic', skill: 'partial' }),
    ]);
    assert.equal(r.stdout, 'L-001 L-002 L-003 L-004\n');
    assert.equal(hint(r, 'L-001').length, 1);
    assert.equal(hint(r, 'L-004').length, 1);
    assert.equal(hint(r, 'L-002').length + hint(r, 'L-003').length, 0);
  });

  test('stdout carries only the ids, whatever the hints', () => {
    const r = add(project({ log: HEADER }), lesson({ scope: 'generic' }));
    assert.equal(r.stdout, 'L-001\n');
  });

  /** The command of the hint, as the agent would run it. */
  const commandOf = (r, id) => {
    const m = /run: node (?:"([^"]+)"|(\S+)) share (\S+)(?: --log (?:"([^"]+)"|(\S+)))?/.exec(hint(r, id)[0]);
    assert.ok(m, `the hint holds a command: ${r.stderr}`);
    return { script: m[1] ?? m[2], id: m[3], log: m[4] ?? m[5] ?? null };
  };

  test('the command in the hint runs from the folder where add ran', () => {
    const p = project({ log: HEADER });
    const r = add(p, lesson({ scope: 'generic' }));
    const { script, id } = commandOf(r, 'L-001');
    const shared = spawnSync(process.execPath, [script, 'share', id], { cwd: p.root, encoding: 'utf8' });
    assert.equal(shared.status, 0, shared.stderr);
    assert.match(shared.stdout, /^Lesson: ui · A new lesson\n/);
  });

  test('for the installed copy, the hint names the script under .claude/skills', () => {
    const p = project({ log: HEADER });
    const skill = path.join(p.root, '.claude', 'skills', 'outsystems-mcp-pitfalls');
    fs.mkdirSync(path.join(skill, 'scripts'), { recursive: true });
    fs.copyFileSync(SCRIPT, path.join(skill, 'scripts', 'lessons.mjs'));
    const r = spawnSync(process.execPath, [path.join(skill, 'scripts', 'lessons.mjs'), 'add'], {
      cwd: p.root, input: JSON.stringify(lesson({ scope: 'generic' })), encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(commandOf(r, 'L-001').script, path.join('.claude', 'skills', 'outsystems-mcp-pitfalls', 'scripts', 'lessons.mjs'));
  });

  test('a log given with --log is passed on to the share command', () => {
    const p = project();
    const other = path.join(p.root, 'other lessons.md');
    fs.writeFileSync(other, HEADER);
    const r = run(p, ['add', '--log', other], { input: JSON.stringify(lesson({ scope: 'generic' })) });
    assert.equal(r.status, 0, r.stderr);
    const { script, id, log } = commandOf(r, 'L-001');
    assert.equal(log, other);
    const shared = spawnSync(process.execPath, [script, 'share', id, '--log', log], { cwd: p.root, encoding: 'utf8' });
    assert.equal(shared.status, 0, shared.stderr);
  });
});

describe('add: text that is not UTF-8', () => {
  const bytes = (before, byte, after) => Buffer.concat([Buffer.from(before), Buffer.from([byte]), Buffer.from(after)]);
  const ansi = bytes('{"area":"ui","title":"caf', 0xe9, ' test","symptom":"na\\u00efve","cause":"c","resolution":"r","skill":"partial","scope":"project"}');

  test('a file in an 8-bit code page is refused, not written with replacement characters', () => {
    const p = project({ log: HEADER });
    fs.writeFileSync(path.join(p.root, 'ansi.json'), ansi);
    const r = run(p, ['add', '--file', 'ansi.json']);
    assert.equal(r.status, 1);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /UTF-8/);
    assert.match(r.stderr, /ansi\.json/);
    assert.equal(read(p.logPath), HEADER);
  });

  test('the same on stdin', () => {
    const p = project({ log: HEADER });
    const r = run(p, ['add'], { input: ansi });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /UTF-8/);
    assert.equal(read(p.logPath), HEADER);
  });

  test('share --file refuses it too', () => {
    const p = project();
    fs.writeFileSync(path.join(p.root, 'ansi.json'), bytes('{"area":"ui","title":"caf', 0xe9, ' test","symptom":"s","cause":"c","resolution":"r"}'));
    const r = run(p, ['share', '--file', 'ansi.json']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /UTF-8/);
    assert.equal(r.stdout, '');
  });

  test('UTF-8 with accents is still read', () => {
    const p = project({ log: HEADER });
    assert.equal(add(p, lesson({ title: 'café ação' })).status, 0);
    assert.ok(read(p.logPath).includes('· café ação\n'));
  });
});

// ---------------------------------------------------------------- the placeholder

describe('the example entry of the legacy template', () => {
  const expected = (block) => LEGACY_TEMPLATE.slice(0, LEGACY_TEMPLATE.indexOf('Delete this example')) + block + '\n';

  test('the first real entry is L-001 and the example and its "Delete this example" line are gone', () => {
    const p = project({ log: LEGACY_TEMPLATE });
    const r = add(p, lesson());
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, 'L-001\n');
    const text = read(p.logPath);
    assert.equal(text, expected(newBlock('L-001')));
    assert.doesNotMatch(text, /YYYY-MM-DD|Delete this example|short title/);
  });

  test('stderr says the example was removed', () => {
    const r = add(project({ log: LEGACY_TEMPLATE }), lesson());
    assert.match(r.stderr, /example/i);
  });

  test('nothing else in the template changes', () => {
    const p = project({ log: LEGACY_TEMPLATE });
    add(p, lesson());
    const head = LEGACY_TEMPLATE.slice(0, LEGACY_TEMPLATE.indexOf('Delete this example'));
    assert.ok(read(p.logPath).startsWith(head));
    assert.ok(read(p.logPath).includes('## Entry format'));
  });

  test('the second add gets L-002 and says nothing about the example', () => {
    const p = project({ log: LEGACY_TEMPLATE });
    add(p, lesson());
    const r = add(p, lesson({ title: 'Second' }));
    assert.equal(r.stdout, 'L-002\n');
    assert.doesNotMatch(r.stderr, /example/i);
    assert.equal(read(p.logPath), expected(newBlock('L-001')) + '\n' + newBlock('L-002', { title: 'Second' }) + '\n');
  });

  test('a batch on the template starts at L-001', () => {
    const r = add(project({ log: LEGACY_TEMPLATE }), [lesson(), lesson()]);
    assert.equal(r.stdout, 'L-001 L-002\n');
  });

  test('the example is not counted, listed, shown or checked', () => {
    const p = project({ log: LEGACY_TEMPLATE });
    assert.deepEqual(json(run(p, ['pending', '--json', '--project-only'])), []);
    const show = run(p, ['show', 'L-001']);
    assert.equal(show.status, 1);
    assert.equal(show.stdout, '');
    const check = run(p, ['check', '--strict']);
    assert.equal(check.status, 0);
    assert.equal(check.stdout, '0 entries, 0 errors, 0 warnings\n');
    assert.match(check.stderr, /example/i);
  });

  test('the template with Windows line endings: example removed, CRLF kept', () => {
    const crlf = LEGACY_TEMPLATE.replace(/\n/g, '\r\n');
    const p = project({ log: crlf });
    const r = add(p, lesson());
    assert.equal(r.status, 0, r.stderr);
    const text = read(p.logPath);
    assert.doesNotMatch(text, /(?<!\r)\n/);
    assert.doesNotMatch(text, /Delete this example|YYYY-MM-DD/);
    assert.equal(text, expected(newBlock('L-001')).replace(/\n/g, '\r\n'));
  });

  test('an example entry kept below real entries is not an entry either', () => {
    const p = project({ log: logOf(entry({ id: 'L-001' }), entry({ id: 'L-001', date: 'YYYY-MM-DD', phase: 'phase', area: 'area', title: 'short title', symptom: '', cause: '', resolution: '', cost: '', skill: '', scope: null, evidence: '', slide: '' })) });
    assert.equal(json(run(p, ['pending', '--json', '--project-only'])).length, 1);
    assert.equal(add(p, lesson()).stdout, 'L-002\n');
  });

  test('only the example goes: text the user wrote after it stays', () => {
    const tail = '<!-- keep me: notes the user wrote below the example -->\nSome paragraph the user added.\n';
    const p = project({ log: LEGACY_TEMPLATE + '\n' + tail });
    const r = add(p, lesson());
    assert.equal(r.status, 0, r.stderr);
    assert.equal(read(p.logPath), LEGACY_TEMPLATE.slice(0, LEGACY_TEMPLATE.indexOf('Delete this example')) + tail + '\n' + newBlock('L-001') + '\n');
  });

  test('only the example goes: a real entry written after it stays, with its id counted', () => {
    const after = entry({ id: 'L-002' });
    const p = project({ log: LEGACY_TEMPLATE + '\n' + after + '\n' });
    assert.equal(add(p, lesson()).stdout, 'L-003\n');
    const text = read(p.logPath);
    assert.ok(text.includes(after + '\n'));
    assert.doesNotMatch(text, /Delete this example|short title/);
  });

  test('removing the example leaves no temporary file behind', () => {
    const p = project({ log: LEGACY_TEMPLATE });
    add(p, lesson());
    assert.deepEqual(fs.readdirSync(path.dirname(p.logPath)), ['lessons-log.md']);
  });

  test('a log that is not UTF-8 is not rewritten to drop the example: add refuses and changes nothing', () => {
    const before = Buffer.concat([Buffer.from(LEGACY_TEMPLATE), Buffer.from([0xe9, 0x0a])]);
    const p = project({ log: before });
    const r = add(p, lesson());
    assert.equal(r.status, 1);
    assert.match(r.stderr, /UTF-8/);
    assert.ok(fs.readFileSync(p.logPath).equals(before));
  });
});

describe('a real entry whose date was left as YYYY-MM-DD', () => {
  const filled = entry({ id: 'L-002', date: 'YYYY-MM-DD', phase: 'Phase 1', area: 'model', title: 'a real lesson whose date was never filled in' });
  const log = logOf(entry({ id: 'L-001' }), filled, entry({ id: 'L-003' }));

  test('add keeps it, byte for byte, and counts it for the next id', () => {
    const p = project({ log });
    const r = add(p, lesson());
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, 'L-004\n');
    assert.doesNotMatch(r.stderr, /example/i);
    assert.equal(read(p.logPath), log + '\n' + newBlock('L-004') + '\n');
  });

  test('it is listed, shown and checked like any entry, and check warns about its date', () => {
    const p = project({ log });
    assert.deepEqual(json(run(p, ['pending', '--json', '--project-only'])).map((r) => r.id), ['L-001', 'L-002', 'L-003']);
    assert.ok(run(p, ['show', 'L-002']).stdout.includes('a real lesson whose date was never filled in'));
    const check = run(p, ['check']);
    assert.equal(check.status, 0);
    assert.equal(check.stdout.split('\n')[0], '3 entries, 0 errors, 1 warnings');
    assert.match(check.stdout, /^L-002: warning: .*date/m);
    assert.doesNotMatch(check.stderr, /example/i);
  });

  test('the "Delete this example" line above a filled-in entry does not make it an example', () => {
    const before = `${HEADER}\nDelete this example when you add your first entry.\n\n${filled}\n`;
    const p = project({ log: before });
    assert.equal(add(p, lesson()).stdout, 'L-003\n');
    assert.equal(read(p.logPath), before + '\n' + newBlock('L-003') + '\n');
  });

  test('an entry with only some of the example fields filled is a real entry too', () => {
    const half = entry({ id: 'L-001', date: 'YYYY-MM-DD', symptom: 'I saw this', cause: '', resolution: '', skill: '' });
    const p = project({ log: logOf(half) });
    assert.equal(add(p, lesson()).stdout, 'L-002\n');
    assert.ok(read(p.logPath).includes('I saw this'));
  });
});

// ---------------------------------------------------------------- line endings

describe('line endings and the byte order mark', () => {
  const lf = logOf(entry({ id: 'L-001', skill: 'partial' }), entry({ id: 'L-002', phase: 'Phase 1', skill: 'covered (x)' }));

  test('a CRLF log stays CRLF after add', () => {
    const p = project({ log: lf.replace(/\n/g, '\r\n') });
    const r = add(p, lesson());
    assert.equal(r.status, 0, r.stderr);
    const text = read(p.logPath);
    assert.doesNotMatch(text, /(?<!\r)\n/, 'no bare LF');
    assert.equal(text, (lf + '\n' + newBlock('L-003') + '\n').replace(/\n/g, '\r\n'));
  });

  test('a LF log stays LF after add', () => {
    const p = project({ log: lf });
    add(p, lesson());
    assert.doesNotMatch(read(p.logPath), /\r/);
  });

  test('a CRLF log without a final line ending gets one, in CRLF', () => {
    const p = project({ log: lf.replace(/\n/g, '\r\n').trimEnd() });
    add(p, lesson());
    assert.doesNotMatch(read(p.logPath), /(?<!\r)\n|\r\r/);
  });

  test('a CRLF log parses like its LF twin', () => {
    const a = project({ log: lf, generic: GENERIC_FIXTURE });
    const b = project({ log: lf.replace(/\n/g, '\r\n'), generic: GENERIC_FIXTURE.replace(/\n/g, '\r\n') });
    for (const args of [['pending', '--json'], ['pending'], ['check'], ['show', 'L-001', 'L-002', 'G-001']]) {
      const ra = run(a, args);
      const rb = run(b, args);
      assert.equal(rb.status, ra.status, args.join(' '));
      assert.equal(rb.stdout, ra.stdout, args.join(' '));
    }
  });

  test('show prints no carriage return, even for a CRLF log', () => {
    const p = project({ log: lf.replace(/\n/g, '\r\n') });
    const r = run(p, ['show', 'L-001']);
    assert.doesNotMatch(r.stdout, /\r/);
    assert.equal(r.stdout, entry({ id: 'L-001', skill: 'partial' }) + '\n');
  });

  test('a byte order mark does not break parsing', () => {
    const p = project({ log: '\uFEFF' + lf, generic: '\uFEFF' + GENERIC_FIXTURE });
    assert.equal(json(run(p, ['pending', '--json'])).length, 4);
    assert.equal(run(p, ['check']).stdout, '2 entries, 0 errors, 0 warnings\n');
  });

  test('a byte order mark in front of a heading is still a heading', () => {
    const p = project({ log: '\uFEFF' + entry({ id: 'L-001' }) + '\n' });
    assert.equal(run(p, ['check']).stdout, '1 entries, 0 errors, 0 warnings\n');
  });

  test('add keeps the byte order mark, once', () => {
    const p = project({ log: '\uFEFF' + lf });
    add(p, lesson());
    const text = read(p.logPath);
    assert.ok(text.startsWith('\uFEFF# Lessons log'));
    assert.equal(text.split('\uFEFF').length, 2);
  });

  test('add keeps the byte order mark and the CRLF when the example is removed', () => {
    const p = project({ log: '\uFEFF' + LEGACY_TEMPLATE.replace(/\n/g, '\r\n') });
    add(p, lesson());
    const text = read(p.logPath);
    assert.ok(text.startsWith('\uFEFF'));
    assert.doesNotMatch(text, /(?<!\r)\n/);
  });
});

// ---------------------------------------------------------------- parsing

describe('parsing', () => {
  const rows = (log, args = []) => json(run(project({ log }), ['pending', '--json', '--project-only', ...args]));

  test('a heading inside a fenced block is ignored', () => {
    const log = `${HEADER}\n\`\`\`\n${entry({ id: 'L-005' })}\n\`\`\`\n\n~~~md\n${entry({ id: 'L-006' })}\n~~~\n\n${entry({ id: 'L-007' })}\n`;
    assert.deepEqual(rows(log).map((r) => r.id), ['L-007']);
  });

  test('a longer fence is closed only by a fence at least as long', () => {
    const log = `${HEADER}\n\`\`\`\`\n\`\`\`\n${entry({ id: 'L-005' })}\n\`\`\`\n\`\`\`\`\n\n${entry({ id: 'L-006' })}\n`;
    assert.deepEqual(rows(log).map((r) => r.id), ['L-006']);
  });

  test('a heading inside a fence in the body of an entry does not end the entry', () => {
    const body = `${entry({ id: 'L-001' })}\n\n\`\`\`\n### L-002 · 2026-10-01 · ui · Not an entry\n## Not a section\n\`\`\`\n`;
    const p = project({ log: `${HEADER}\n${body}\n${entry({ id: 'L-003' })}\n` });
    assert.equal(json(run(p, ['pending', '--json', '--project-only'])).length, 2);
    assert.ok(run(p, ['show', 'L-001']).stdout.includes('Not an entry'));
  });

  test('only what follows the Entries heading counts', () => {
    const log = `# Log\n\n${entry({ id: 'L-001' })}\n\n## Entries\n\n${entry({ id: 'L-002' })}\n`;
    assert.deepEqual(rows(log).map((r) => r.id), ['L-002']);
  });

  test('without an Entries heading the whole file counts', () => {
    const log = `# Log\n\n${entry({ id: 'L-001' })}\n\n${entry({ id: 'L-002' })}\n`;
    assert.deepEqual(rows(log).map((r) => r.id), ['L-001', 'L-002']);
  });

  test('the Entries heading is found in any case, with any spacing', () => {
    const log = `# Log\n\n${entry({ id: 'L-001' })}\n\n##  entries  \n\n${entry({ id: 'L-002' })}\n`;
    assert.deepEqual(rows(log).map((r) => r.id), ['L-002']);
  });

  test('an entry with a phase and one without, side by side', () => {
    const [a, b] = rows(logOf(entry({ id: 'L-001', phase: 'Phase 2', area: 'tests', title: 'With phase' }), entry({ id: 'L-002', area: 'ui', title: 'Without phase' })));
    assert.deepEqual([a.phase, a.area, a.title, a.date], ['Phase 2', 'tests', 'With phase', '2026-10-01']);
    assert.deepEqual([b.phase, b.area, b.title, b.date], [null, 'ui', 'Without phase', '2026-10-01']);
  });

  test('a title that holds the separator, in an entry with a phase, is kept whole', () => {
    const [r] = rows(logOf(entry({ id: 'L-001', phase: 'Phase 2', area: 'ui', title: 'Edit · publish loop · again' })));
    assert.deepEqual([r.phase, r.area, r.title], ['Phase 2', 'ui', 'Edit · publish loop · again']);
  });

  test('any word is accepted as an area when reading', () => {
    const [r] = rows(logOf(entry({ id: 'L-001', area: 'reactive-ui' })));
    assert.equal(r.area, 'reactive-ui');
  });

  test('a repeated field: the first one wins', () => {
    const block = entry({ id: 'L-001', skill: 'covered (a)' }) + '\n- **Skill:** partial';
    assert.equal(rows(logOf(block)).length, 0);
  });

  test('an entry ends at the next heading of level 2 or 3, and the text after it is not part of it', () => {
    const p = project({ log: `${HEADER}\n${entry({ id: 'L-001' })}\n\nSome closing words.\n\n## Appendix\n\nAppendix text.\n\n### Notes\n\nNotes text.\n` });
    const shown = run(p, ['show', 'L-001']).stdout;
    assert.ok(shown.includes('Some closing words.'));
    assert.doesNotMatch(shown, /Appendix|Notes/);
  });

  test('a heading of level 4 does not end an entry', () => {
    const p = project({ log: `${HEADER}\n${entry({ id: 'L-001' })}\n\n#### Detail\n\nMore.\n` });
    assert.ok(run(p, ['show', 'L-001']).stdout.includes('#### Detail'));
  });

  test('show prints the entry verbatim, without the blank lines after it', () => {
    const block = entry({ id: 'L-001' }) + '\n\nA free paragraph with `code` and a - dash.';
    const p = project({ log: logOf(block, entry({ id: 'L-002' })) });
    assert.equal(run(p, ['show', 'L-001']).stdout, block + '\n');
  });

  test('a field value may hold bold text, colons and the separator', () => {
    const [r] = rows(logOf(entry({ id: 'L-001', symptom: 'saw **this**: a · b' })));
    assert.equal(r.fields.symptom, 'saw **this**: a · b');
  });

  test('indented bullets and prose are not fields', () => {
    const block = entry({ id: 'L-001', skill: null }) + '\n  - **Skill:** covered (x)\nSkill: covered (x)';
    const [r] = rows(logOf(block));
    assert.equal(r.status, 'unclassified');
  });

  test('a heading with a bad id shape is not an entry', () => {
    const log = `${HEADER}\n### L-12abc · 2026-10-01 · ui · Nope\n\n### L-NNN · 2026-10-01 · ui · Nope\n\n### X-001 · 2026-10-01 · ui · Nope\n\n${entry({ id: 'L-001' })}\n`;
    assert.deepEqual(rows(log).map((r) => r.id), ['L-001']);
  });

  test('the old log fixture parses as written', () => {
    const p = project({ log: OLD_LOG });
    const all = json(run(p, ['pending', '--json', '--project-only']));
    assert.deepEqual(all.map((r) => r.id), ['L-003', 'L-004', 'L-005', 'L-007', 'L-099']);
    const l3 = all[0];
    assert.deepEqual([l3.phase, l3.area, l3.title], ['Phase 1', 'reactive-ui', 'Edit · publish loop: the screen kept the old layout']);
    assert.equal(l3.scope, null);
    assert.match(run(p, ['check']).stdout.split('\n')[0], /^8 entries, 0 errors, \d+ warnings$/);
  });
});

// ---------------------------------------------------------------- pending

describe('pending', () => {
  const log = logOf(
    entry({ id: 'L-001', skill: 'covered (SKILL.md section 2)', area: 'session' }),
    entry({ id: 'L-002', skill: 'partial: one variant', area: 'ui', scope: 'generic' }),
    entry({ id: 'L-003', skill: 'not in any skill yet', area: 'tests', scope: 'project' }),
    entry({ id: 'L-004', skill: 'missing from the official skill', area: 'ui' }),
    entry({ id: 'L-005', skill: 'new in the skill', area: 'ui' }),
    entry({ id: 'L-006', skill: 'new in our skill (SKILL.md section 3)', area: 'charts' }),
    entry({ id: 'L-007', skill: 'planning checklist: some free text', area: 'planning' }),
    entry({ id: 'L-008', skill: null, area: 'model' }),
    entry({ id: 'L-009', skill: 'Partial', area: 'UI', phase: 'Phase 2' }),
  );
  const proj = () => project({ log, generic: GENERIC_FIXTURE });

  test('lists the generic lessons first, then the project entries still to read, by increasing id', () => {
    const r = run(proj(), ['pending']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, [
      'Generic lessons (3)',
      'G-001 · ui · A list inside a container loses its scroll',
      'G-002 · security · A server action is not an access rule',
      'G-003 · charts · A chart series needs a name of its own',
      'Project lessons to read (5)',
      'L-002 · ui · Title of L-002',
      'L-003 · tests · Title of L-003',
      'L-007 · planning · Title of L-007',
      'L-008 · model · Title of L-008',
      'L-009 · UI · Title of L-009',
      '',
    ].join('\n'));
  });

  test('the last line on stderr says that show prints a lesson', () => {
    const lines = run(proj(), ['pending']).stderr.trimEnd().split('\n');
    assert.match(lines[lines.length - 1], /show <id>/);
  });

  test('covered, missing and new are not listed; partial, none and unclassified are', () => {
    const ids = json(run(proj(), ['pending', '--json', '--project-only'])).map((r) => r.id);
    assert.deepEqual(ids, ['L-002', 'L-003', 'L-007', 'L-008', 'L-009']);
  });

  test('an unclassified Skill value is listed, and so is a missing Skill line', () => {
    const rows = json(run(proj(), ['pending', '--json', '--project-only']));
    assert.equal(rows.find((r) => r.id === 'L-007').status, 'unclassified');
    assert.equal(rows.find((r) => r.id === 'L-008').status, 'unclassified');
  });

  test('--area keeps the lessons of the named areas, in any case, from both sources', () => {
    const r = run(proj(), ['pending', '--area', 'ui,CHARTS', '--json']);
    assert.deepEqual(json(r).map((x) => x.id), ['G-001', 'G-003', 'L-002', 'L-009']);
  });

  test('--area accepts an area outside the 16, since old logs use others', () => {
    const p = project({ log: OLD_LOG });
    assert.deepEqual(json(run(p, ['pending', '--area', 'reactive-ui', '--json', '--project-only'])).map((r) => r.id), ['L-003']);
  });

  test('--area with no match prints empty sections and exits 0', () => {
    const r = run(proj(), ['pending', '--area', 'quota']);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, 'Generic lessons (0)\nProject lessons to read (0)\n');
  });

  test('--full prints the whole entries instead of one line each', () => {
    const r = run(proj(), ['pending', '--full', '--area', 'tests,security']);
    assert.ok(r.stdout.includes(entry({ id: 'L-003', skill: 'not in any skill yet', area: 'tests', scope: 'project' })));
    assert.ok(r.stdout.includes('### G-002 · 2026-11-02 · security · A server action is not an access rule\n- **Symptom:** A user without the role still got the data.'));
    assert.ok(r.stdout.includes('Generic lessons (1)'));
    assert.doesNotMatch(r.stdout, /^G-002 · security/m);
  });

  test('--json prints an array with the documented shape', () => {
    const rows = json(run(proj(), ['pending', '--json']));
    assert.ok(Array.isArray(rows));
    assert.equal(rows.length, 8);
    const g = rows[0];
    assert.deepEqual(Object.keys(g).sort(), ['area', 'date', 'fields', 'id', 'phase', 'scope', 'source', 'status', 'title']);
    assert.deepEqual([g.id, g.source, g.date, g.phase, g.area, g.status, g.scope], ['G-001', 'generic', '2026-11-01', null, 'ui', null, 'generic']);
    assert.equal(g.fields.symptom, 'The list was cut off at the bottom of the screen.');
    assert.equal(g.fields.cause, 'The container had a fixed height and hidden overflow.');
    const l = rows.find((r) => r.id === 'L-009');
    assert.deepEqual([l.source, l.phase, l.status, l.scope], ['project', 'Phase 2', 'partial', 'generic']);
    assert.equal(l.fields.skill, 'Partial');
    assert.equal(rows.find((r) => r.id === 'L-003').scope, 'project');
  });

  test('--json status is partial, none or unclassified for the pending ones', () => {
    const statusOf = (skill) => json(run(project({ log: logOf(entry({ id: 'L-001', skill })) }), ['pending', '--json', '--project-only']));
    assert.equal(statusOf('partial')[0].status, 'partial');
    assert.equal(statusOf('not in any skill yet')[0].status, 'none');
    assert.equal(statusOf('whatever')[0].status, 'unclassified');
    for (const skill of ['covered (a)', 'missing from the official skill', 'new in the skill', 'new in our skill']) {
      assert.deepEqual(statusOf(skill), [], `${skill} is not pending`);
    }
  });

  test('--json with a Scope line in another case or an unknown value', () => {
    const rows = json(run(project({ log: logOf(entry({ id: 'L-001', scope: 'Generic' }), entry({ id: 'L-002', scope: 'everywhere' }), entry({ id: 'L-003', scope: null })) }), ['pending', '--json', '--project-only']));
    assert.deepEqual(rows.map((r) => r.scope), ['generic', null, null]);
  });

  test('--project-only lists the project entries only', () => {
    const r = run(proj(), ['pending', '--project-only']);
    assert.doesNotMatch(r.stdout, /Generic lessons|G-00/);
    assert.match(r.stdout, /^Project lessons to read \(5\)\n/);
  });

  test('--generic-only lists the generic lessons only', () => {
    const r = run(proj(), ['pending', '--generic-only']);
    assert.doesNotMatch(r.stdout, /Project lessons|L-00/);
    assert.match(r.stdout, /^Generic lessons \(3\)\n/);
  });

  test('--project-only and --generic-only together are a usage error', () => {
    assert.equal(run(proj(), ['pending', '--project-only', '--generic-only']).status, 2);
  });

  test('--generic-only needs no project log and says nothing about it', () => {
    const p = project({ generic: GENERIC_FIXTURE });
    const r = run(p, ['pending', '--generic-only']);
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stderr, /no lessons log|no log/i);
  });

  test('without a project log it still lists the generic lessons, exits 0 and says so on stderr', () => {
    const p = project({ generic: GENERIC_FIXTURE });
    const r = run(p, ['pending']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /^Generic lessons \(3\)\n/);
    assert.doesNotMatch(r.stdout, /Project lessons/);
    assert.match(r.stderr, /no (project )?(lessons )?log/i);
    assert.match(r.stderr, /o11-flow-setup/);
  });

  test('without a project log, --json is the generic lessons', () => {
    const p = project({ generic: GENERIC_FIXTURE });
    assert.deepEqual(json(run(p, ['pending', '--json'])).map((r) => r.id), ['G-001', 'G-002', 'G-003']);
  });

  test('a missing generic file counts as empty, with a note on stderr', () => {
    const p = project({ log });
    const r = run(p, ['pending', '--generic', path.join(p.root, 'absent.md')], { generic: false });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /^Generic lessons \(0\)\n/);
    assert.match(r.stderr, /generic/i);
  });

  test('--generic points to another file', () => {
    const p = project({ log });
    const other = path.join(p.root, 'other.md');
    fs.writeFileSync(other, GENERIC_FIXTURE.replace(/G-00(\d)/g, 'G-10$1'));
    const r = run(p, ['pending', '--generic-only', '--json', '--generic', other], { generic: false });
    assert.deepEqual(json(r).map((x) => x.id), ['G-101', 'G-102', 'G-103']);
  });

  test('by default the generic file is ../references/generic-lessons.md next to the script', () => {
    const p = project({ log });
    const skill = path.join(p.root, '.claude', 'skills', 'outsystems-mcp-pitfalls');
    fs.mkdirSync(path.join(skill, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(skill, 'references'), { recursive: true });
    fs.copyFileSync(SCRIPT, path.join(skill, 'scripts', 'lessons.mjs'));
    fs.writeFileSync(path.join(skill, 'references', 'generic-lessons.md'), GENERIC_FIXTURE);
    const r = spawnSync(process.execPath, [path.join(skill, 'scripts', 'lessons.mjs'), 'pending', '--generic-only', '--json'], { cwd: p.root, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(json(r).map((x) => x.id), ['G-001', 'G-002', 'G-003']);
  });

  test('the generic lessons are listed whatever their Skill, scope or fields', () => {
    const generic = '### G-001 · 2026-11-01 · ui · Bare\n';
    const rows = json(run(project({ log: HEADER, generic }), ['pending', '--json', '--generic-only']));
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].fields, {});
  });
});

// ---------------------------------------------------------------- show

describe('show', () => {
  const log = logOf(entry({ id: 'L-001' }), entry({ id: 'L-002', phase: 'Phase 1' }), entry({ id: 'L-003', skill: 'covered (x)' }));
  const proj = () => project({ log, generic: GENERIC_FIXTURE });

  test('prints the entries in the order asked, from both sources', () => {
    const r = run(proj(), ['show', 'L-003', 'G-001', 'L-001']);
    assert.equal(r.status, 0, r.stderr);
    const g1 = GENERIC_FIXTURE.slice(GENERIC_FIXTURE.indexOf('### G-001'), GENERIC_FIXTURE.indexOf('### G-002')).trimEnd();
    assert.equal(r.stdout, [entry({ id: 'L-003', skill: 'covered (x)' }), g1, entry({ id: 'L-001' })].join('\n\n') + '\n');
  });

  test('an unknown id is reported after the others are printed, and the exit code is 1', () => {
    const r = run(proj(), ['show', 'L-001', 'L-404', 'L-002']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /L-404/);
    assert.ok(r.stdout.includes(entry({ id: 'L-001' })));
    assert.ok(r.stdout.includes(entry({ id: 'L-002', phase: 'Phase 1' })));
    assert.doesNotMatch(r.stdout, /L-404/);
  });

  test('only unknown ids: nothing on stdout, exit 1', () => {
    const r = run(proj(), ['show', 'G-404']);
    assert.equal(r.status, 1);
    assert.equal(r.stdout, '');
  });

  test('an id is read in any case and without leading zeros', () => {
    const r = run(proj(), ['show', 'l-1', 'g-2', 'L2']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal((r.stdout.match(/^### /gm) || []).length, 3);
  });

  test('something that is not an id is reported as unknown', () => {
    const r = run(proj(), ['show', 'banana', 'L-001']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /banana/);
    assert.ok(r.stdout.includes('### L-001'));
  });

  test('no id is a usage error', () => {
    assert.equal(run(proj(), ['show']).status, 2);
  });

  test('a generic id works without a project log, and stderr says the project has none', () => {
    const p = project({ generic: GENERIC_FIXTURE });
    const r = run(p, ['show', 'G-002']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^### G-002 /);
    assert.match(r.stderr, /no lessons log/i);
  });

  test('an L id without a project log exits 2 and points to the set-up skill', () => {
    const p = project({ generic: GENERIC_FIXTURE });
    const r = run(p, ['show', 'G-001', 'L-001']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /o11-flow-setup/);
    assert.equal(r.stderr.match(/no lessons log/gi).length, 1, 'the message is not repeated');
    assert.match(r.stdout, /### G-001/);
  });

  test('a duplicated id prints the first entry once', () => {
    const p = project({ log: logOf(entry({ id: 'L-001', title: 'First' }), entry({ id: 'L-001', title: 'Second' })) });
    const r = run(p, ['show', 'L-001']);
    assert.match(r.stdout, /First/);
    assert.doesNotMatch(r.stdout, /Second/);
  });
});

// ---------------------------------------------------------------- check

describe('check', () => {
  const lines = (r) => r.stdout.trimEnd().split('\n');

  test('a clean log', () => {
    const p = project({ log: logOf(entry({ id: 'L-001' }), entry({ id: 'L-002', phase: 'Phase 1', skill: 'covered (x)', scope: 'project' })) });
    const r = run(p, ['check']);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '2 entries, 0 errors, 0 warnings\n');
    assert.equal(run(p, ['check', '--strict']).status, 0);
  });

  test('an empty log', () => {
    const r = run(project({ log: HEADER }), ['check']);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '0 entries, 0 errors, 0 warnings\n');
  });

  test('a duplicate id is an error', () => {
    const r = run(project({ log: logOf(entry({ id: 'L-001' }), entry({ id: 'L-002' }), entry({ id: 'L-002' })) }), ['check']);
    assert.equal(r.status, 1);
    assert.equal(lines(r)[0], '3 entries, 1 errors, 0 warnings');
    assert.match(lines(r)[1], /^L-002: .*duplicate/);
  });

  test('ids that do not increase are an error', () => {
    const r = run(project({ log: logOf(entry({ id: 'L-001' }), entry({ id: 'L-005' }), entry({ id: 'L-003' })) }), ['check']);
    assert.equal(r.status, 1);
    assert.equal(lines(r)[0], '3 entries, 1 errors, 0 warnings');
    assert.match(lines(r)[1], /^L-003: .*(increas|order)/);
  });

  test('gaps in the ids are fine', () => {
    const r = run(project({ log: logOf(entry({ id: 'L-001' }), entry({ id: 'L-010' })) }), ['check']);
    assert.equal(r.status, 0);
  });

  for (const [field, key] of [['Symptom', 'symptom'], ['Cause', 'cause'], ['Resolution', 'resolution'], ['Skill', 'skill']]) {
    test(`an entry without ${field} is an error`, () => {
      const r = run(project({ log: logOf(entry({ id: 'L-001' }), entry({ id: 'L-002', [key]: null })) }), ['check']);
      assert.equal(r.status, 1);
      assert.equal(lines(r)[0], '2 entries, 1 errors, 0 warnings');
      assert.match(lines(r)[1], new RegExp(`^L-002: .*${field}`));
    });

    test(`an entry with an empty ${field} is an error`, () => {
      const r = run(project({ log: logOf(entry({ id: 'L-001', [key]: '' })) }), ['check']);
      assert.equal(r.status, 1);
      assert.match(lines(r)[1], new RegExp(field));
    });
  }

  test('several problems in one entry are all reported', () => {
    const r = run(project({ log: logOf(entry({ id: 'L-001', symptom: null, cause: null })) }), ['check']);
    assert.equal(lines(r)[0], '1 entries, 2 errors, 0 warnings');
    assert.equal(lines(r).length, 3);
  });

  const warn = (name, block, pattern) => {
    test(`warning: ${name}`, () => {
      const p = project({ log: logOf(block) });
      const r = run(p, ['check']);
      assert.equal(r.status, 0);
      assert.equal(lines(r)[0], '1 entries, 0 errors, 1 warnings');
      assert.match(lines(r)[1], pattern);
      assert.equal(lines(r).length, 2);
      const strict = run(p, ['check', '--strict']);
      assert.equal(strict.status, 1);
      assert.equal(strict.stdout, r.stdout);
    });
  };
  warn('an area outside the 16', entry({ id: 'L-001', area: 'frontend' }), /^L-001: .*area/);
  warn('an old area names the one meant', entry({ id: 'L-001', area: 'testing' }), /^L-001: .*"tests"/);
  warn('an unclassified Skill status', entry({ id: 'L-001', skill: 'tests: some free text' }), /^L-001: .*Skill/);
  warn('Scope missing', entry({ id: 'L-001', scope: null }), /^L-001: .*Scope/);
  warn('Scope not generic or project', entry({ id: 'L-001', scope: 'everywhere' }), /^L-001: .*Scope/);
  warn('Cost missing', entry({ id: 'L-001', cost: null }), /^L-001: .*Cost/);
  warn('Evidence missing', entry({ id: 'L-001', evidence: null }), /^L-001: .*Evidence/);
  warn('Slide missing', entry({ id: 'L-001', slide: null }), /^L-001: .*Slide/);
  warn('a heading date that is not YYYY-MM-DD', entry({ id: 'L-001', date: '11/11/2026' }), /^L-001: .*date/);
  warn('a heading date that is not a real day', entry({ id: 'L-001', date: '2026-02-30' }), /^L-001: .*date/);

  test('an area in capitals is the same area: no warning', () => {
    const r = run(project({ log: logOf(entry({ id: 'L-001', area: 'UI' }), entry({ id: 'L-002', area: 'Edit-Loop' })) }), ['check', '--strict']);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '2 entries, 0 errors, 0 warnings\n');
  });
  warn('an old area in capitals still names the one meant', entry({ id: 'L-001', area: 'Testing' }), /^L-001: .*"tests"/);

  test('errors and warnings together: the exit code follows the errors, not --strict', () => {
    const p = project({ log: logOf(entry({ id: 'L-001', scope: null }), entry({ id: 'L-001' })) });
    const r = run(p, ['check']);
    assert.equal(r.status, 1);
    assert.equal(lines(r)[0], '2 entries, 1 errors, 1 warnings');
  });

  test('the old log fixture has no error', () => {
    const r = run(project({ log: OLD_LOG }), ['check']);
    assert.equal(r.status, 0);
    assert.match(lines(r)[0], /^8 entries, 0 errors, \d+ warnings$/);
    assert.equal(run(project({ log: OLD_LOG }), ['check', '--strict']).status, 1);
  });

  test('without a log it exits 2 and points to the set-up skill', () => {
    const r = run(project(), ['check']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /o11-flow-setup/);
    assert.match(r.stderr, /lessons-log\.template\.md/);
  });
});

// ---------------------------------------------------------------- share

describe('share', () => {
  const secret = { cost: 'COSTMARK', evidence: 'EVIDMARK', phase: 'PHASEMARK', slide: 'yes' };
  const shareable = entry({
    id: 'L-007', area: 'charts', title: 'A series needs a name', symptom: 'Two series drew one line', cause: 'They shared a name',
    resolution: 'Name every series', scope: 'generic', skill: 'not in any skill yet', ...secret, date: '2026-10-09',
  });
  const proj = (extra = []) => project({ log: logOf(shareable, entry({ id: 'L-008', scope: 'project' }), entry({ id: 'L-009', scope: null }), ...extra) });
  const query = (url) => new URL(url).searchParams;
  const BODY = (a, s, c, r) => ['## Area', '', a, '', '## Symptom', '', s, '', '## Cause', '', c, '', '## Resolution', '', r, '', "Shared from a project lessons log, with the user's consent."].join('\n');

  test('by id: prints the title, the body and the link', () => {
    const r = run(proj(), ['share', 'L-007']);
    assert.equal(r.status, 0, r.stderr);
    const body = BODY('charts', 'Two series drew one line', 'They shared a name', 'Name every series');
    const url = r.stdout.trimEnd().split('\n').pop();
    assert.equal(r.stdout, `Lesson: charts · A series needs a name\n\n${body}\n\n${url}\n`);
    assert.ok(url.startsWith('https://github.com/OutSystemsExperts/o11-flow-kit/issues/new?title='));
  });

  test('the link decodes back to the same title and body', () => {
    const r = run(proj(), ['share', 'L-007', '--json']);
    const out = json(r);
    const q = query(out.url);
    assert.equal(q.get('title'), out.title);
    assert.equal(q.get('body'), out.body);
    assert.equal(out.title, 'Lesson: charts · A series needs a name');
  });

  // GitHub answers 404 to a visitor without permission to label issues when the link has a labels parameter.
  // Most people who share a lesson cannot label, so the link carries the title and the body only.
  test('the link carries no labels parameter: a visitor who cannot label would get a 404', () => {
    const r = run(proj(), ['share', 'L-007']);
    const url = r.stdout.trimEnd().split('\n').pop();
    assert.deepEqual([...query(url).keys()].sort(), ['body', 'title']);
    assert.doesNotMatch(url, /label/i);
    assert.doesNotMatch(json(run(proj(), ['share', 'L-007', '--json'])).url, /label/i);
  });

  test('the link is encoded with encodeURIComponent', () => {
    const out = json(run(proj(), ['share', 'L-007', '--json']));
    assert.ok(out.url.includes('title=' + encodeURIComponent(out.title)));
    assert.ok(out.url.includes('&body=' + encodeURIComponent(out.body)));
  });

  test('only area, title, symptom, cause and resolution are shared', () => {
    const r = run(proj(), ['share', 'L-007']);
    assert.doesNotMatch(decodeURIComponent(r.stdout), /COSTMARK|EVIDMARK|PHASEMARK|2026-10-09|L-007|not in any skill yet/);
    assert.deepEqual(Object.keys(json(run(proj(), ['share', 'L-007', '--json']))).sort(), ['body', 'repo', 'title', 'url']);
  });

  test('the body has the four headings and the closing line last', () => {
    const { body } = json(run(proj(), ['share', 'L-007', '--json']));
    assert.equal(body, BODY('charts', 'Two series drew one line', 'They shared a name', 'Name every series'));
    assert.equal(body.split('\n').pop(), "Shared from a project lessons log, with the user's consent.");
  });

  test('share sends nothing and writes nothing: the log is the same and there is no lock', () => {
    const p = proj();
    const before = read(p.logPath);
    run(p, ['share', 'L-007']);
    assert.equal(read(p.logPath), before);
    assert.equal(fs.existsSync(p.lock), false);
  });

  test('a project-scope entry is refused', () => {
    const r = run(proj(), ['share', 'L-008']);
    assert.equal(r.status, 1);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /project/);
  });

  test('a Scope line that begins with project is refused, however it goes on', () => {
    for (const scope of ['project only (our approval rule)', 'Project-specific', 'PROJECT: no']) {
      const r = run(project({ log: logOf(entry({ id: 'L-001', scope })) }), ['share', 'L-001']);
      assert.equal(r.status, 1, scope);
      assert.equal(r.stdout, '');
      assert.match(r.stderr, /project/);
    }
  });

  test('a Scope line that begins with generic but has more text is shared with the note', () => {
    const r = run(project({ log: logOf(entry({ id: 'L-001', scope: 'generic (any project)' })) }), ['share', 'L-001']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /scope/i);
  });

  test('an entry without Scope is accepted, with a note on stderr', () => {
    const r = run(proj(), ['share', 'L-009']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /scope/i);
    assert.match(r.stdout, /^Lesson: ui · Title of L-009\n/);
  });

  test('an entry with Scope generic gets no note about scope', () => {
    assert.doesNotMatch(run(proj(), ['share', 'L-007']).stderr, /scope/i);
  });

  test('an old entry whose area is outside the 16 is shared with its own area', () => {
    const p = project({ log: OLD_LOG });
    const out = json(run(p, ['share', 'L-003', '--json']));
    assert.equal(out.title, 'Lesson: reactive-ui · Edit · publish loop: the screen kept the old layout');
  });

  test('an unknown id exits 1', () => {
    const r = run(proj(), ['share', 'L-404']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /L-404/);
  });

  test('an id in lower case or without the dash is read', () => {
    assert.equal(run(proj(), ['share', 'l-7']).status, 0);
    assert.equal(run(proj(), ['share', 'L7']).status, 0);
  });

  test('a generic id is a usage error: share takes an L id', () => {
    assert.equal(run(proj(), ['share', 'G-001']).status, 2);
  });

  test('no argument is a usage error', () => {
    assert.equal(run(proj(), ['share']).status, 2);
  });

  test('an id and --file together are a usage error', () => {
    const p = proj();
    fs.writeFileSync(path.join(p.root, 'l.json'), '{}');
    assert.equal(run(p, ['share', 'L-007', '--file', 'l.json']).status, 2);
  });

  test('by id without a log exits 2 and points to the set-up skill', () => {
    const r = run(project(), ['share', 'L-001']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /o11-flow-setup/);
  });

  describe('from a file', () => {
    const general = { area: 'ui', title: 'A list loses its scroll', symptom: 'The list was cut off', cause: 'A fixed height', resolution: 'Let it grow' };
    const withFile = (obj, args = [], p = project()) => {
      fs.writeFileSync(path.join(p.root, 'lesson.json'), typeof obj === 'string' ? obj : JSON.stringify(obj));
      return run(p, ['share', '--file', 'lesson.json', ...args]);
    };

    test('prepares the generalised version, and needs no project log', () => {
      const r = withFile(general);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /^Lesson: ui · A list loses its scroll\n\n## Area\n\nui\n\n## Symptom\n\nThe list was cut off\n/);
    });

    test('other fields in the file are not shared', () => {
      const r = withFile({ ...general, cost: 'COSTMARK', evidence: 'EVIDMARK', date: '2026-01-01', phase: 'PHASEMARK', skill: 'partial', slide: 'yes' });
      assert.equal(r.status, 0, r.stderr);
      assert.doesNotMatch(r.stdout, /COSTMARK|EVIDMARK|2026-01-01|PHASEMARK|partial/);
    });

    test('a file with scope project is refused', () => {
      const r = withFile({ ...general, scope: 'project' });
      assert.equal(r.status, 1);
    });

    test('a list of one lesson is accepted, a longer one is not', () => {
      assert.equal(withFile([general]).status, 0);
      const r = withFile([general, general]);
      assert.equal(r.status, 1);
    });

    test('the five fields are validated like add does', () => {
      for (const [bad, pattern] of [
        [{ ...general, area: 'frontend' }, /area/],
        [{ ...general, area: 'testing' }, /"tests"/],
        [{ ...general, title: '' }, /title/],
        [{ ...general, symptom: undefined }, /symptom/],
        [{ ...general, cause: ' ' }, /cause/],
        [{ ...general, resolution: undefined }, /resolution/],
      ]) {
        const r = withFile(bad);
        assert.equal(r.status, 1, JSON.stringify(bad));
        assert.match(r.stderr, pattern);
        assert.equal(r.stdout, '');
      }
    });

    test('multi-line values are flattened and the separator in the title is replaced', () => {
      const r = json(withFile({ ...general, title: 'a · b', symptom: 'one\ntwo' }, ['--json']));
      assert.equal(r.title, 'Lesson: ui · a - b');
      assert.ok(r.body.includes('\n\none two\n'));
    });

    test('a file that is not there exits 2', () => {
      const p = project();
      assert.equal(run(p, ['share', '--file', 'nope.json']).status, 2);
    });

    test('a file that is not JSON exits 1', () => {
      assert.equal(withFile('{ nope').status, 1);
    });

    test('a file with a byte order mark is read', () => {
      assert.equal(withFile('\uFEFF' + JSON.stringify(general)).status, 0);
    });
  });

  describe('the guard', () => {
    // Built from pieces: this file holds no address, e-mail or personal path, only the shapes the guard must refuse.
    const join = (sep, ...parts) => parts.join(sep);
    const SITE = join('/', 'https:', '', 'host.example', 'page');
    const SITE_B = join('/', 'https:', '', 'a.example');
    const MAIL = join('@', 'someone', 'example.org');
    const MAIL_B = join('@', 'a.b+c', 'sub.example.org');
    const MAIL_C = join('@', 'a', 'b.example');
    const IP_A = join('.', 10, 1, 2, 3);
    const IP_B = join('.', 192, 168, 0, 255);
    const IP_C = join('.', 10, 0, 0, 1);
    const HOME = join('/', '', 'Users', 'someone', 'project', 'file.cs');
    const HOME_B = join('/', '', 'Users', 'x', 'y');
    const HOME_C = join('/', '', 'Users', 'someone', 'work', 'file');
    const base = { area: 'ui', title: 'A title', symptom: 'A symptom', cause: 'A cause', resolution: 'A resolution' };
    const refuses = [
      ['symptom', `See ${SITE} for the log`, 'URL'],
      ['cause', 'Call ftp://host/file', 'URL'],
      ['resolution', `Mail ${MAIL} about it`, 'e-mail'],
      ['title', `Fix for mail ${MAIL_B}`, 'e-mail'],
      ['symptom', `The host ${IP_A} answered`, 'IPv4'],
      ['cause', `It listens on ${IP_B}:8080`, 'IPv4'],
      ['resolution', `Edit ${HOME}`, 'path'],
      ['symptom', 'The file is in /home/someone/work', 'path'],
      ['cause', 'Run it from ~/work/project', 'path'],
      ['resolution', 'Open C:\\Users\\someone\\file.txt', 'path'],
      ['symptom', 'Open D:/work/file.txt', 'path'],
      ['cause', 'The commit 0123456789abcdef0123 broke it', 'hexadecimal'],
      ['resolution', 'The key is ABCDEF0123456789abcdef0123456789', 'hexadecimal'],
    ];
    const permitted = [
      ['symptom', 'It happened in version 11.55 and in 1.2.3'],
      ['cause', 'The commit 0123456789abcdef012 (19 digits) is short'],
      ['resolution', 'Use e.g. the HTTP method, not the http: scheme'],
      ['title', 'The a:b pair and the 999.1.1.1 value'],
      ['symptom', 'Paths like docs/outsystems/file.md are relative'],
      ['cause', 'A user@ without a host, and the CSS rules @media and @font-face'],
      ['resolution', 'Names such as Orders and Customer are fine'],
      ['title', 'The route /Orders/Home has two segments'],
      ['symptom', 'A relative path such as docs/var/log.md or src/opt/x is not a home path'],
      ['cause', 'The attributes Customer.Name and Employee.Id/Count are fine'],
      ['resolution', 'The identifier ServiceStudioMcpOmlEditSessionManagerForDesigners is long but has no digit'],
    ];

    // Shapes that must be refused in each of the four text fields. Built from pieces, like the values above.
    const everywhere = [
      ['a home path in lower case', '/users/someone/dev'],
      ['a home path in upper case', '/USERS/someone'],
      ['a home path with a capital H', '/Home/someone'],
      ['a UNC path', join('\\', '', '', 'fileserver', 'projects', 'share', 'x.oml')],
      ['a tilde path with backslashes', join('\\', '~', 'Documents', 'work')],
      ['a variable for the profile folder', join('\\', '%USERPROFILE%', 'work')],
      ['a variable for the home folder', '$HOME/dev/project'],
      ['a Windows home path without a drive', join('\\', '', 'Users', 'someone', 'AppData')],
      ['an absolute path under /opt', '/opt/vendor/app'],
      ['an absolute path under /Volumes', '/Volumes/Work/project/file.cs'],
      ['an absolute path under /var', '/var/folders/x/file.txt'],
      ['an environment host name', `Publish to ${join('.', 'example-dev', 'outsystemsenterprise', 'com')} failed`],
      ['a host name with a path', `Open ${join('.', 'example', 'outsystemscloud', 'com')}/DeliveryApp/Login`],
      ['a host name under a country domain', `${join('.', 'www', 'example', 'com', 'br')}/app`],
      ['a short host name with a path', `${join('.', 'example', 'com')}/app`],
      ['an e-mail address with an accent', join('@', 'josé', 'example.org')],
      ['an e-mail address on localhost', join('@', 'someone', 'localhost')],
      ['an IPv4 address with leading zeros', join('.', '010', '000', '000', '001')],
      ['a GUID', join('-', '123e4567', 'e89b', '12d3', 'a456', '426614174000')],
      ['an @mention', 'ask @someone-handle about it'],
      ['a token with a known prefix', join('_', 'ghp', 'abcdefghijklmnopqrstuvwxyz0123456789')],
      ['an access key id', `AKIA${'ABCDEFGHIJKLMNOP'}`],
      ['a long mixed run of letters and digits', 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7'],
    ];
    for (const [what, value] of everywhere) {
      for (const field of ['title', 'symptom', 'cause', 'resolution']) {
        test(`${what} in the ${field} is refused and the field is named`, () => {
          const p = project();
          fs.writeFileSync(path.join(p.root, 'l.json'), JSON.stringify({ ...base, [field]: `See ${value} here` }));
          const r = run(p, ['share', '--file', 'l.json']);
          assert.equal(r.status, 1, r.stdout);
          assert.equal(r.stdout, '');
          assert.match(r.stderr, new RegExp(`^  ${field}: `, 'm'), 'the hit is listed under its field');
          assert.match(r.stderr, /--file/);
        });
      }
    }

    test('a URL is reported once, not again as the host name inside it', () => {
      const p = project();
      fs.writeFileSync(path.join(p.root, 'l.json'), JSON.stringify({ ...base, symptom: `See ${join('/', 'https:', '', join('.', 'www', 'example', 'com'), 'page')}` }));
      const r = run(p, ['share', '--file', 'l.json']);
      assert.equal(r.status, 1);
      assert.equal(r.stderr.split('\n').filter((l) => l.includes('example.com')).length, 1, r.stderr);
    });

    test('the area of an entry shared by id is guarded too', () => {
      for (const area of [join('/', '', 'home', 'someone'), SITE_B, IP_C]) {
        const p = project({ log: logOf(entry({ id: 'L-001', area, scope: 'generic' })) });
        const r = run(p, ['share', 'L-001']);
        assert.equal(r.status, 1, `${area}: ${r.stdout}`);
        assert.equal(r.stdout, '');
        assert.match(r.stderr, /^ {2}area: /m);
      }
    });

    for (const [field, value, kind] of refuses) {
      test(`${field} holding ${kind} (${value.slice(0, 28)}) is refused and the field is named`, () => {
        const p = project();
        fs.writeFileSync(path.join(p.root, 'l.json'), JSON.stringify({ ...base, [field]: value }));
        const r = run(p, ['share', '--file', 'l.json']);
        assert.equal(r.status, 1, r.stdout);
        assert.equal(r.stdout, '');
        assert.match(r.stderr, new RegExp(`^  ${field}: `, 'm'), 'the hit is listed under its field');
        assert.match(r.stderr, /--file/);
        assert.match(r.stderr, /generalis/i);
      });
    }

    for (const [field, value] of permitted) {
      test(`${field} "${value.slice(0, 40)}" passes`, () => {
        const p = project();
        fs.writeFileSync(path.join(p.root, 'l.json'), JSON.stringify({ ...base, [field]: value }));
        const r = run(p, ['share', '--file', 'l.json']);
        assert.equal(r.status, 0, r.stderr);
      });
    }

    test('every match is listed, with its field', () => {
      const p = project();
      fs.writeFileSync(path.join(p.root, 'l.json'), JSON.stringify({ ...base, symptom: `${SITE_B} and ${IP_C}`, cause: MAIL_C, title: `Run ${HOME_B}` }));
      const r = run(p, ['share', '--file', 'l.json']);
      assert.equal(r.status, 1);
      for (const f of ['symptom', 'cause', 'title']) assert.match(r.stderr, new RegExp(`${f}\\b`));
      assert.ok(r.stderr.includes(SITE_B));
      assert.ok(r.stderr.includes(IP_C));
      assert.ok(r.stderr.includes(MAIL_C));
    });

    test('the same guard applies to an entry shared by id', () => {
      const p = project({ log: logOf(entry({ id: 'L-001', cause: `It lives at ${SITE}`, scope: 'generic' })) });
      const r = run(p, ['share', 'L-001']);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /cause/);
      assert.match(r.stderr, /--file/);
      assert.equal(r.stdout, '');
    });

    test('what is not shared is not guarded: a path in the evidence does not stop the share', () => {
      const p = project({ log: logOf(entry({ id: 'L-001', evidence: `${HOME_C} at ${SITE}`, cost: MAIL_C, scope: 'generic' })) });
      assert.equal(run(p, ['share', 'L-001']).status, 0);
    });

    test('there is no override flag', () => {
      const p = project();
      fs.writeFileSync(path.join(p.root, 'l.json'), JSON.stringify({ ...base, symptom: SITE }));
      for (const flag of ['--force', '--no-guard', '--yes']) assert.equal(run(p, ['share', '--file', 'l.json', flag]).status, 2);
    });
  });

  describe('the repository', () => {
    test('the default is OutSystemsExperts/o11-flow-kit', () => {
      const out = json(run(proj(), ['share', 'L-007', '--json'], { env: { O11_FLOW_KIT_REPO: '' } }));
      assert.equal(out.repo, 'OutSystemsExperts/o11-flow-kit');
      assert.ok(out.url.startsWith('https://github.com/OutSystemsExperts/o11-flow-kit/issues/new?'));
    });

    test('the environment variable O11_FLOW_KIT_REPO overrides the default', () => {
      const out = json(run(proj(), ['share', 'L-007', '--json'], { env: { O11_FLOW_KIT_REPO: 'acme/kit-fork' } }));
      assert.equal(out.repo, 'acme/kit-fork');
      assert.ok(out.url.startsWith('https://github.com/acme/kit-fork/issues/new?'));
    });

    test('--repo overrides the environment variable', () => {
      const out = json(run(proj(), ['share', 'L-007', '--json', '--repo', 'me/mine'], { env: { O11_FLOW_KIT_REPO: 'acme/kit-fork' } }));
      assert.equal(out.repo, 'me/mine');
      assert.ok(out.url.startsWith('https://github.com/me/mine/issues/new?'));
    });

    for (const bad of ['no-slash', 'a/b/c', 'a b/c', '/x', 'x/', 'https://github.com/a/b']) {
      test(`a repository like "${bad}" is a usage error`, () => {
        const r = run(proj(), ['share', 'L-007', '--repo', bad]);
        assert.equal(r.status, 2);
        assert.match(r.stderr, /owner\/name/);
      });
    }
  });

  describe('the link length', () => {
    test('a link that would pass 7000 characters is printed without the body, and stderr says to paste', () => {
      const long = 'word '.repeat(1500).trim();
      const p = project({ log: logOf(entry({ id: 'L-001', symptom: long, scope: 'generic' })) });
      const r = run(p, ['share', 'L-001']);
      assert.equal(r.status, 0, r.stderr);
      const url = r.stdout.trimEnd().split('\n').pop();
      assert.ok(url.length <= 7000, `${url.length}`);
      assert.equal(query(url).get('body'), null);
      assert.equal(query(url).get('title'), 'Lesson: ui · Title of L-001');
      assert.deepEqual([...query(url).keys()], ['title']);
      assert.doesNotMatch(url, /label/i);
      assert.match(r.stderr, /paste/i);
      assert.ok(r.stdout.includes(long), 'the body is still printed');
    });

    test('--json carries the same shorter link', () => {
      const long = 'word '.repeat(1500).trim();
      const p = project({ log: logOf(entry({ id: 'L-001', symptom: long, scope: 'generic' })) });
      const out = json(run(p, ['share', 'L-001', '--json']));
      assert.equal(new URL(out.url).searchParams.get('body'), null);
      assert.equal(out.body.includes(long), true);
    });

    test('a link under the limit carries the body and stderr has no warning', () => {
      const r = run(proj(), ['share', 'L-007']);
      assert.doesNotMatch(r.stderr, /paste/i);
      assert.notEqual(query(r.stdout.trimEnd().split('\n').pop()).get('body'), null);
    });
  });

  test('--json prints only the JSON object', () => {
    const r = run(proj(), ['share', 'L-007', '--json']);
    assert.deepEqual(Object.keys(json(r)), ['repo', 'title', 'body', 'url']);
    assert.equal(r.stdout.trimEnd().split('\n').length > 1, true);
  });
});

// ---------------------------------------------------------------- the lock

describe('the lock', () => {
  test('a fresh lock makes add fail after its wait, leaves the log and the lock alone', () => {
    const before = logOf(entry({ id: 'L-001' }));
    const p = project({ log: before });
    fs.writeFileSync(p.lock, 'someone else');
    const t0 = Date.now();
    const r = add(p, lesson(), { env: { O11_LESSONS_LOCK_WAIT_MS: '400' } });
    const waited = Date.now() - t0;
    assert.equal(r.status, 1);
    assert.match(r.stderr, /lock/i);
    assert.match(r.stderr, /lessons-log\.md\.lock/);
    assert.equal(read(p.logPath), before);
    assert.equal(read(p.lock), 'someone else', 'a lock that is not ours is never removed');
    assert.ok(waited >= 350, `it waited ${waited} ms`);
    assert.ok(waited < 5000, `it waited ${waited} ms: the O11_LESSONS_LOCK_WAIT_MS override must be honoured, the default is 10 s`);
  });

  test('a lock 50 seconds old is still taken to be alive: add waits, fails, and leaves it alone', () => {
    const before = logOf(entry({ id: 'L-001' }));
    const p = project({ log: before });
    fs.writeFileSync(p.lock, 'a run in progress');
    const age = new Date(Date.now() - 50_000);
    fs.utimesSync(p.lock, age, age);
    const r = add(p, lesson(), { env: { O11_LESSONS_LOCK_WAIT_MS: '400' } });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /lock/i);
    assert.equal(read(p.lock), 'a run in progress');
    assert.equal(read(p.logPath), before);
  });

  test('a lock 70 seconds old is stale: add replaces it and removes it at the end', () => {
    const p = project({ log: HEADER });
    fs.writeFileSync(p.lock, 'a crashed run');
    const age = new Date(Date.now() - 70_000);
    fs.utimesSync(p.lock, age, age);
    const r = add(p, lesson(), { env: { O11_LESSONS_LOCK_WAIT_MS: '400' } });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.existsSync(p.lock), false);
  });

  test('add gets in when the lock goes away during its wait', async () => {
    const p = project({ log: HEADER });
    fs.writeFileSync(p.lock, 'someone else');
    setTimeout(() => fs.rmSync(p.lock, { force: true }), 300);
    const child = await new Promise((resolve) => {
      const c = spawn(process.execPath, [SCRIPT, 'add'], { cwd: p.root, env: { ...process.env, O11_LESSONS_LOCK_WAIT_MS: '5000' } });
      let stderr = '';
      c.stderr.on('data', (d) => { stderr += d; });
      c.on('close', (status) => resolve({ status, stderr }));
      c.stdin.end(JSON.stringify(lesson()));
    });
    assert.equal(child.status, 0, child.stderr);
    assert.match(read(p.logPath), /### L-001/);
    assert.equal(fs.existsSync(p.lock), false);
  });

  test('a lock older than 60 seconds is stale and is replaced', () => {
    const p = project({ log: HEADER });
    fs.writeFileSync(p.lock, 'a crashed run');
    const old = new Date(Date.now() - 120_000);
    fs.utimesSync(p.lock, old, old);
    const r = add(p, lesson(), { env: { O11_LESSONS_LOCK_WAIT_MS: '400' } });
    assert.equal(r.status, 0, r.stderr);
    assert.match(read(p.logPath), /### L-001/);
    assert.equal(fs.existsSync(p.lock), false);
  });

  test('no lock file remains after a normal run', () => {
    const p = project({ log: HEADER });
    add(p, lesson());
    assert.deepEqual(fs.readdirSync(path.dirname(p.logPath)), ['lessons-log.md']);
  });

  test('no lock file remains after a refused run, and none was taken for it', () => {
    const p = project({ log: HEADER });
    add(p, lesson({ area: 'nope' }));
    assert.deepEqual(fs.readdirSync(path.dirname(p.logPath)), ['lessons-log.md']);
  });

  test('the wait is configurable, and by default it is long enough to matter', () => {
    const src = read(SCRIPT);
    assert.match(src, /O11_LESSONS_LOCK_WAIT_MS/);
    assert.match(src, /10_?000/);
  });
});

// ---------------------------------------------------------------- log discovery

describe('finding the log', () => {
  test('from the project root', () => {
    const p = project({ log: logOf(entry({ id: 'L-001' })) });
    assert.equal(run(p, ['check']).stdout, '1 entries, 0 errors, 0 warnings\n');
  });

  test('from a subfolder of the project, however deep', () => {
    const p = project({ log: logOf(entry({ id: 'L-001' })) });
    const deep = path.join(p.root, 'src', 'a', 'b');
    fs.mkdirSync(deep, { recursive: true });
    assert.equal(run(p, ['check'], { cwd: deep }).stdout, '1 entries, 0 errors, 0 warnings\n');
    assert.equal(add(p, lesson(), { cwd: deep }).stdout, 'L-002\n');
  });

  test('the nearest log wins', () => {
    const outer = project({ log: logOf(entry({ id: 'L-001' }), entry({ id: 'L-002' })) });
    const innerRoot = path.join(outer.root, 'sub');
    const innerLog = path.join(innerRoot, 'docs', 'outsystems', 'lessons-log.md');
    fs.mkdirSync(path.dirname(innerLog), { recursive: true });
    fs.writeFileSync(innerLog, logOf(entry({ id: 'L-001' })));
    assert.equal(run(outer, ['check'], { cwd: innerRoot }).stdout, '1 entries, 0 errors, 0 warnings\n');
    assert.equal(run(outer, ['check'], { cwd: outer.root }).stdout, '2 entries, 0 errors, 0 warnings\n');
  });

  test('--log overrides the search', () => {
    const p = project({ log: logOf(entry({ id: 'L-001' })) });
    const other = path.join(p.root, 'elsewhere.md');
    fs.writeFileSync(other, logOf(entry({ id: 'L-001' }), entry({ id: 'L-002' }), entry({ id: 'L-003' })));
    assert.equal(run(p, ['check', '--log', other]).stdout, '3 entries, 0 errors, 0 warnings\n');
    assert.equal(add(p, lesson(), {}).stdout, 'L-002\n');
    const r = run(p, ['add', '--log', other], { input: JSON.stringify(lesson()) });
    assert.equal(r.stdout, 'L-004\n');
  });

  test('--log may be relative to the current folder', () => {
    const p = project();
    fs.writeFileSync(path.join(p.root, 'mine.md'), logOf(entry({ id: 'L-001' })));
    assert.equal(run(p, ['check', '--log', 'mine.md']).stdout, '1 entries, 0 errors, 0 warnings\n');
  });

  test('add without a log exits 2 and says what to do', () => {
    const p = project();
    const r = add(p, lesson());
    assert.equal(r.status, 2);
    assert.match(r.stderr, /o11-flow-setup/);
    assert.match(r.stderr, /lessons-log\.template\.md/);
    assert.equal(fs.existsSync(p.logPath), false, 'add never creates the log');
  });

  test('--log that points to nothing: add exits 2 and creates nothing', () => {
    const p = project();
    const target = path.join(p.root, 'nothing.md');
    const r = run(p, ['add', '--log', target], { input: JSON.stringify(lesson()) });
    assert.equal(r.status, 2);
    assert.equal(fs.existsSync(target), false);
    assert.equal(fs.existsSync(target + '.lock'), false);
  });

  test('share by id without a log exits 2', () => {
    assert.equal(run(project(), ['share', 'L-001']).status, 2);
  });

  test('--log that points to nothing: pending still lists the generic lessons', () => {
    const p = project({ generic: GENERIC_FIXTURE });
    const r = run(p, ['pending', '--log', path.join(p.root, 'nothing.md')]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Generic lessons \(3\)/);
    assert.match(r.stderr, /nothing\.md/);
  });

  test('the installed copy of the skill finds the log from the project root', () => {
    const p = project({ log: logOf(entry({ id: 'L-001', skill: 'partial' })), generic: GENERIC_FIXTURE });
    const skill = path.join(p.root, '.claude', 'skills', 'outsystems-mcp-pitfalls');
    fs.mkdirSync(path.join(skill, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(skill, 'references'), { recursive: true });
    fs.copyFileSync(SCRIPT, path.join(skill, 'scripts', 'lessons.mjs'));
    fs.writeFileSync(path.join(skill, 'references', 'generic-lessons.md'), GENERIC_FIXTURE);
    const installed = path.join(skill, 'scripts', 'lessons.mjs');
    const pending = spawnSync(process.execPath, [installed, 'pending', '--json'], { cwd: p.root, encoding: 'utf8' });
    assert.equal(pending.status, 0, pending.stderr);
    assert.deepEqual(json(pending).map((r) => r.id), ['G-001', 'G-002', 'G-003', 'L-001']);
    const file = path.join(p.root, 'new.json');
    fs.writeFileSync(file, JSON.stringify(lesson()));
    const dry = spawnSync(process.execPath, [installed, 'add', '--dry-run', '--file', file], { cwd: p.root, encoding: 'utf8' });
    assert.equal(dry.status, 0, dry.stderr);
    assert.ok(dry.stdout.includes('### L-002 · '));
  });
});
