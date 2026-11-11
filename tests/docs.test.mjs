// The texts of the kit and the CLI must not drift apart: every command that a Markdown file shows after
// "lessons.mjs" must be a command of the CLI (the CLI wants the command first, so an --option written
// straight after the file name is wrong, except --help), and every --option printed right after the
// command must be one of that command's options. The commands and options are read from
// `lessons.mjs help`, not copied here.
//
// Prose is left alone: only code (fenced blocks and `inline spans`) is checked, plus any line that
// shows a full "node ... lessons.mjs <word>" invocation.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const SCRIPT = path.join(ROOT, 'skills', 'outsystems-mcp-pitfalls', 'scripts', 'lessons.mjs');
const SKIP_DIRS = new Set(['node_modules', 'tests', '.git']);
const SHELL_STOPS = new Set(['|', '||', '&&', ';', '&', '>', '>>', '2>', '<']);

/** The commands (name -> set of options) and the options common to every command, from `help`. */
function readCli() {
  const r = spawnSync(process.execPath, [SCRIPT, 'help'], { encoding: 'utf8' });
  assert.equal(r.status, 0, `help must work: ${r.stderr}`);
  const commands = new Map();
  const common = new Set(['--help']);
  let section = '';
  for (const line of r.stdout.split('\n')) {
    if (/^\S/.test(line)) {
      section = line;
      continue;
    }
    if (section.startsWith('Commands')) {
      const m = /^ {2}([a-z]+)\b(.*)$/.exec(line);
      if (!m) continue;
      const options = commands.get(m[1]) ?? new Set();
      for (const o of m[2].match(/--[a-z][a-z-]*/g) ?? []) options.add(o);
      commands.set(m[1], options);
    } else if (section.startsWith('Options for every command')) {
      const m = /^ {2}(--[a-z][a-z-]*)/.exec(line);
      if (m) common.add(m[1]);
    }
  }
  return { commands, common };
}

/** Pieces of code in a Markdown text: the lines of fenced blocks and the inline spans, with line numbers. */
function codeFragments(text) {
  const fragments = [];
  let fence = null;
  text.split(/\r?\n/).forEach((line, i) => {
    const m = /^\s*(`{3,}|~{3,})/.exec(line);
    if (m) {
      if (fence === null) fence = m[1][0];
      else if (m[1][0] === fence) fence = null;
      return;
    }
    if (fence !== null) fragments.push({ text: line, line: i + 1 });
    else for (const span of line.matchAll(/`([^`\n]+)`/g)) fragments.push({ text: span[1], line: i + 1 });
  });
  return fragments;
}

/** What is wrong with the mentions of "lessons.mjs <word>" in one piece of text. */
function checkFragment(fragment, { commands, common }) {
  const problems = [];
  for (const m of fragment.matchAll(/lessons\.mjs[ \t]+(--[A-Za-z][\w-]*)/g)) {
    if (m[1] !== '--help') problems.push(`"lessons.mjs ${m[1]}": the command comes first, then the options`);
  }
  for (const m of fragment.matchAll(/lessons\.mjs[ \t]+([A-Za-z][\w-]*)([^\n]*)/g)) {
    const [, word, rest] = m;
    if (!commands.has(word)) {
      problems.push(`"lessons.mjs ${word}": ${word} is not a command (${[...commands.keys()].join(', ')})`);
      continue;
    }
    for (const token of rest.trim().split(/\s+/)) {
      if (SHELL_STOPS.has(token)) break;
      const option = /^(--[A-Za-z][\w-]*)/.exec(token);
      if (option && !commands.get(word).has(option[1]) && !common.has(option[1])) {
        problems.push(`"lessons.mjs ${word}": ${option[1]} is not an option of ${word}`);
      }
    }
  }
  return problems;
}

/** All the problems of a Markdown text, as "line N: ..." strings. */
function checkMarkdown(text, cli) {
  const problems = [];
  for (const fragment of codeFragments(text)) {
    for (const p of checkFragment(fragment.text, cli)) problems.push(`line ${fragment.line}: ${p}`);
  }
  text.split(/\r?\n/).forEach((line, i) => {
    if (!/\bnode\s+\S*lessons\.mjs\b/.test(line)) return;
    for (const p of checkFragment(line, cli)) problems.push(`line ${i + 1}: ${p}`);
  });
  return [...new Set(problems)];
}

function markdownFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) files.push(...markdownFiles(path.join(dir, entry.name)));
    } else if (entry.name.endsWith('.md')) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

describe('the checker itself', () => {
  const cli = readCli();

  test('it reads the commands and options of the CLI', () => {
    for (const name of ['pending', 'show', 'add', 'check', 'share', 'help']) assert.ok(cli.commands.has(name), name);
    assert.ok(cli.commands.get('pending').has('--project-only'));
    assert.ok(cli.commands.get('add').has('--dry-run'));
    assert.ok(cli.commands.get('share').has('--repo'));
    assert.ok(cli.commands.get('check').has('--strict'));
    assert.ok(cli.common.has('--log') && cli.common.has('--generic'));
  });

  test('it accepts correct mentions', () => {
    const text = [
      'Run `node lessons.mjs pending --area ui,tests --json` before you plan.',
      '```sh',
      'node .claude/skills/outsystems-mcp-pitfalls/scripts/lessons.mjs add --dry-run --file new.json',
      'node lessons.mjs share L-007 --repo me/mine && node lessons.mjs check --strict',
      'node lessons.mjs pending --log docs/x.md',
      'node lessons.mjs --help',
      'node lessons.mjs help',
      '```',
    ].join('\n');
    assert.deepEqual(checkMarkdown(text, cli), []);
  });

  test('it finds a word that is not a command', () => {
    const problems = checkMarkdown('Use `lessons.mjs list` to see them.', cli);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^line 1: .*list/);
  });

  test('it finds an option written before the command: the CLI wants the command first', () => {
    const problems = checkMarkdown('`node lessons.mjs --log docs/x.md pending`', cli);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /--log/);
    assert.equal(checkMarkdown('```sh\nnode lessons.mjs --generic x.md check\n```', cli).length, 1);
  });

  test('it finds an option that does not belong to the command', () => {
    assert.equal(checkMarkdown('`lessons.mjs check --dry-run`', cli).length, 1);
    assert.equal(checkMarkdown('`lessons.mjs pending --nope`', cli).length, 1);
    assert.equal(checkMarkdown('```\nnode lessons.mjs add --area ui\n```', cli).length, 1);
  });

  test('it stops reading options at a pipe or a second command', () => {
    assert.deepEqual(checkMarkdown('`lessons.mjs pending | grep --count x`', cli), []);
    assert.deepEqual(checkMarkdown('`lessons.mjs pending && ls --all`', cli), []);
  });

  test('it finds a bad mention on a line that shows the full "node" invocation, even in prose', () => {
    assert.equal(checkMarkdown('Then run node skills/x/scripts/lessons.mjs frobnicate and read it.', cli).length, 1);
  });

  test('it leaves prose alone', () => {
    const text = 'The script lessons.mjs is the only file that ships. lessons.mjs and its tests are small.\n`lessons.mjs` is one file.';
    assert.deepEqual(checkMarkdown(text, cli), []);
  });

  test('it ignores placeholders and paths that follow the file name', () => {
    assert.deepEqual(checkMarkdown('`node lessons.mjs <command> [options]` and `lessons.mjs ./x`', cli), []);
  });
});

describe('the Markdown files of the repository', () => {
  const cli = readCli();
  const files = markdownFiles(ROOT);

  test('there are files to check', () => {
    assert.ok(files.length > 0);
  });

  for (const file of files) {
    test(path.relative(ROOT, file).split(path.sep).join('/'), () => {
      const problems = checkMarkdown(fs.readFileSync(file, 'utf8'), cli);
      assert.deepEqual(problems, []);
    });
  }
});
