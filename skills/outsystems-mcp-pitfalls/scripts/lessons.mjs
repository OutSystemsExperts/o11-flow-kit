// lessons.mjs: the lessons loop of an OutSystems 11 project built through the Service Studio MCP.
// One file, Node 18 or later, no dependencies, no network access.
//
// Usage: node lessons.mjs <command> [options]
//
// Commands:
//   pending [--area <area>[,<area>...]] [--full] [--json] [--project-only] [--generic-only]
//       What to read before planning: every generic lesson, and every project entry whose
//       Skill status is partial, not in any skill yet, or unclassified. One line per lesson;
//       --full prints whole entries, --json prints an array.
//   show <id>...
//       Print whole lessons, verbatim. Ids: L-NNN (project log) and G-NNN (generic lessons).
//   add [--file <entries.json>] [--dry-run]
//       Append one entry, or a list of entries, to the project log. The JSON comes from
//       --file or from stdin, and must be UTF-8. Nothing is written unless every entry is valid.
//       The ids are assigned for you and printed. The entries already in the log are never
//       changed. --dry-run prints what would be appended and writes nothing.
//   check [--strict]
//       Validate the project log. Exit 1 on an error, or on a warning too with --strict.
//   share <L-id> [--repo <owner/name>] [--json]
//   share --file <lesson.json> [--repo <owner/name>] [--json]
//       Prepare a generic lesson for the kit maintainers. It sends nothing: it prints the text
//       and a link that opens a prefilled GitHub issue, which the user reads and submits.
//       Only area, title, symptom, cause and resolution are shared, and the text must not
//       hold a URL or host name, an e-mail address, an @mention, an IPv4 address, an absolute
//       or home path, a GUID, a token or a long hexadecimal string: write a generalised version
//       and pass it with --file. The script cannot see names, two-part domain names, relative
//       paths or IPv6 addresses: read the text before you submit it.
//   help
//       Print this text.
//
// Options for every command:
//   --log <path>      The project log. Default: docs/outsystems/lessons-log.md, searched from
//                     the current folder upwards.
//   --generic <path>  The generic lessons. Default: ../references/generic-lessons.md,
//                     next to this script.
//   --help            Print this text.
//
// The input of add is a JSON object, or a list of them. Field names are read in any case and
// every value is flattened to one line:
//   area        required, one of the 16 areas below
//   title       required
//   symptom     required
//   cause       required ("unknown" if it was never established)
//   resolution  required ("unresolved" if nothing worked yet)
//   skill       required, starts with one of the statuses below
//   scope       required: generic (holds in any OutSystems 11 project built through the MCP)
//               or project (only makes sense in this project)
//   date        YYYY-MM-DD, default today
//   phase       optional, written between the date and the area
//   cost        default "not recorded"
//   evidence    default "none recorded"
//   slide       yes or no, default no
//
// Areas: session, edit-loop, merge-publish, dependencies, ui, charts, theme, model, logic,
// tests, environment, quota, collaboration, security, planning, review.
//
// Skill statuses: covered (section) and missing from the official skill and new in the skill
// (also written "new in our skill") need no reading; partial and not in any skill yet are
// pending; anything else is unclassified and counts as pending. Free text may follow a status.
//
// Exit codes: 0 ok, 1 validation failure or refusal, 2 usage error or file not found.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------- constants

const SEP = ' · ';
const AREAS = [
  'session', 'edit-loop', 'merge-publish', 'dependencies', 'ui', 'charts', 'theme', 'model',
  'logic', 'tests', 'environment', 'quota', 'collaboration', 'security', 'planning', 'review',
];
const NEAR_MISSES = { testing: 'tests', 'reactive-ui': 'ui', 'data-model': 'model', access: 'security' };

// The first prefix that starts the Skill value (case-insensitive) gives the status.
const STATUS_PREFIXES = [
  ['covered', 'covered'],
  ['partial', 'partial'],
  ['missing', 'missing from the official skill'],
  ['new', 'new in the skill'],
  ['new', 'new in our skill'],
  ['none', 'not in any skill yet'],
];
const PENDING = new Set(['partial', 'none', 'unclassified']);
const STATUS_LIST = 'covered (section), partial, missing from the official skill, '
  + 'new in the skill (or new in our skill), not in any skill yet';

// The example of the old template has YYYY-MM-DD as its date and nothing written in these fields. An entry
// with the same date but something written is a real entry whose date was never filled in: it is kept.
const PLACEHOLDER_DATE = 'YYYY-MM-DD';
const EXAMPLE_FIELDS = ['symptom', 'cause', 'resolution', 'skill'];
const PLACEHOLDER_NOTE = /^Delete this example when you add your first entry\.?\s*$/i;
const FIELD_NAMES = ['date', 'phase', 'area', 'title', 'symptom', 'cause', 'resolution', 'skill', 'scope', 'cost', 'evidence', 'slide'];
const SHARED_FIELDS = ['area', 'title', 'symptom', 'cause', 'resolution'];

const DEFAULT_REPO = 'OutSystemsExperts/o11-flow-kit';
const MAX_LINK_LENGTH = 7000;
const LOCK_WAIT_MS = 10_000;
const LOCK_STALE_MS = 60_000;
const CLOSING_LINE = "Shared from a project lessons log, with the user's consent.";

// Things the text of a shared lesson must not hold. Each match is reported with its field.
// A refusal costs one rewrite of the lesson, a miss publishes a detail of the project: when in doubt, refuse.
const LABEL = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?';
const HOST_ENDINGS = 'com|net|org|edu|gov|mil|int|info|biz|io|app|dev|cloud|eu|uk|de|fr|es|pt|nl|ch|se|dk|fi|pl|ru|br|ar|mx|ca|au|nz|jp|cn|za';
const POSIX_ROOTS = 'Volumes|private|var|opt|mnt|srv|etc|tmp|root|usr|media|Applications|Library|Network';
const CSS_AT_RULES = 'media|import|font-face|keyframes|supports|charset|layer|page|namespace|container|property|apply|tailwind';
const PATH_SHAPES = [
  /\/(?:Users|home)\/\S*/, // home folders on macOS and Linux, in any case
  /\\(?:Users|home)\\\S*/, // \Users\name, with no drive
  new RegExp(`(?<![\\w.~$%-])/(?:${POSIX_ROOTS})/\\S+`), // absolute paths under the usual roots
  /(?<!\w)~[\\/]\S*/, // ~/ and ~\
  /(?<![A-Za-z0-9])[A-Za-z]:[\\/]\S*/, // a Windows drive
  /(?<![\\\w])\\\\[^\s\\]+\\\S*/, // \\server\share
  /%[A-Za-z_][A-Za-z0-9_]*%[\\/]\S*/, // %USERPROFILE%\...
  /\$\{?(?:HOME|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEPATH|TMPDIR|PWD)\}?[\\/]\S*/, // $HOME/...
];
const GUARDS = [
  ['a URL', /[a-z][a-z0-9+.-]*:\/\/\S*/gi],
  // a host name written without a scheme: three or more parts, or one name and a path
  ['a host name', new RegExp(`(?<![\\w.@-])(?:${LABEL}\\.){2,}(?:${HOST_ENDINGS})(?![\\w-])(?::\\d+)?(?:/\\S*)?`, 'gi')],
  ['a host name', new RegExp(`(?<![\\w.@-])${LABEL}\\.(?:${HOST_ENDINGS})(?![\\w-])(?::\\d+)?/\\S*`, 'gi')],
  ['an e-mail address', /[\p{L}\p{N}_.%+-]+@(?:[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+|localhost\b)/gu],
  ['an @mention', new RegExp(`(?<![\\w.@-])@(?!(?:${CSS_AT_RULES})\\b)[a-z0-9][a-z0-9-]*`, 'gi')],
  ['an IPv4 address', /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b/g],
  ['a local path', new RegExp(PATH_SHAPES.map((shape) => shape.source).join('|'), 'gi')],
  ['a GUID', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi],
  ['a long hexadecimal string', /[0-9a-fA-F]{20,}/g],
  ['a token', /\b(?:gh[pousr]_|github_pat_|sk-|xox[abprs]-|AKIA|AIza)[A-Za-z0-9_-]{8,}|\b(?=[A-Za-z0-9_]*\d)(?=[A-Za-z0-9_]*[A-Za-z])[A-Za-z0-9_]{32,}\b/g],
];

// What each command accepts: option name -> takes a value.
const COMMON_OPTIONS = { log: true, generic: true, help: false };
const COMMANDS = {
  pending: { options: { area: true, full: false, json: false, 'project-only': false, 'generic-only': false }, run: cmdPending },
  show: { options: {}, run: cmdShow },
  add: { options: { file: true, 'dry-run': false }, run: cmdAdd },
  check: { options: { strict: false }, run: cmdCheck },
  share: { options: { file: true, repo: true, json: false }, run: cmdShare },
  help: { options: {}, run: () => { out(usage()); return 0; } },
};

// ---------------------------------------------------------------- output and errors

const out = (text) => process.stdout.write(text);
const err = (text) => process.stderr.write(text.endsWith('\n') ? text : `${text}\n`);

class CliError extends Error {
  constructor(message, code = 1, { showUsage = false } = {}) {
    super(message);
    this.code = code;
    this.showUsage = showUsage;
  }
}
const usageError = (message) => new CliError(message, 2, { showUsage: true });

/** The first comment block of this file. */
function usage() {
  const lines = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split(/\r?\n/);
  const block = [];
  for (const line of lines) {
    if (!line.startsWith('//')) break;
    block.push(line.replace(/^\/\/ ?/, ''));
  }
  return `${block.join('\n')}\n`;
}

// ---------------------------------------------------------------- reading files

function readBuffer(file) {
  try {
    return fs.readFileSync(file);
  } catch (e) {
    // A file that is not there is the user's mistake (2); one that is there and cannot be read is a refusal (1).
    throw new CliError(`Cannot read ${file}: ${e.code === 'ENOENT' ? 'no such file' : e.message}.`, e.code === 'ENOENT' ? 2 : 1);
  }
}

/** Text of a Markdown or JSON file without its byte order mark; reads UTF-8 and UTF-16 LE (Windows PowerShell). */
function decode(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.toString('utf16le', 2);
  const text = buffer.toString('utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Text typed by the agent (JSON for add and share): it must be UTF-8 or UTF-16. Bytes from an 8-bit code page
 * (what some Windows tools write) decode to U+FFFD, and a log must never receive those.
 */
function decodeInput(buffer, source) {
  const text = decode(buffer);
  if (text.includes('\uFFFD')) {
    throw new CliError(`${source} is not UTF-8 text. Save it as UTF-8 (the file tool of the agent does) and run the command again.`);
  }
  return text;
}

function findLogPath(opts) {
  if (opts.log) return path.resolve(opts.log);
  for (let dir = process.cwd(); ;) {
    const candidate = path.join(dir, 'docs', 'outsystems', 'lessons-log.md');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function noLogMessage(opts) {
  const where = opts.log ? `at ${path.resolve(opts.log)}` : 'at docs/outsystems/lessons-log.md (searched from the current folder upwards)';
  return `There is no lessons log ${where}. Run the o11-flow-setup skill to create it, or copy its `
    + 'assets/lessons-log.template.md to docs/outsystems/lessons-log.md at the project root. '
    + 'To use a log somewhere else, pass --log <path>.';
}

/** The project log, or null when there is none. */
function openLog(opts) {
  const file = findLogPath(opts);
  if (!file || !fs.existsSync(file)) return null;
  return { file, text: readBuffer(file).toString('utf8') };
}

function requireLog(opts) {
  const log = openLog(opts);
  if (!log) throw new CliError(noLogMessage(opts), 2);
  return log;
}

/** The entries of the project log. Says on stderr when a code fence that is never closed hides some of them. */
function readEntries(log) {
  const parsed = parseEntries(log.text);
  if (parsed.openFence !== null) {
    err(`note: the code fence that opens at line ${parsed.openFence} of ${log.file} is never closed, so the entries after it are not read. `
      + 'Close it with a line of three backticks.');
  }
  return parsed;
}

/** The generic lessons shipped with the kit; a missing file counts as empty. */
function loadGeneric(opts) {
  const file = opts.generic
    ? path.resolve(opts.generic)
    : fileURLToPath(new URL('../references/generic-lessons.md', import.meta.url));
  if (!fs.existsSync(file)) {
    err(`note: there is no generic lessons file at ${file}; no generic lesson is listed.`);
    return [];
  }
  return parseEntries(decode(readBuffer(file))).entries.filter((e) => e.kind === 'G');
}

// ---------------------------------------------------------------- parsing

/** The lines of a text and the offset where each one starts. A line ends at LF or CRLF. */
function splitLines(text) {
  const lines = [];
  const starts = [];
  const eol = /\r?\n/g;
  let from = 0;
  for (let m = eol.exec(text); m; m = eol.exec(text)) {
    starts.push(from);
    lines.push(text.slice(from, m.index));
    from = m.index + m[0].length;
  }
  starts.push(from);
  lines.push(text.slice(from));
  return { lines, starts };
}

/**
 * Splits a log into entries. An entry starts at a "### L-n" or "### G-n" heading outside a fenced block,
 * after the "## Entries" heading when there is one, and runs to the next "## " or "### " heading.
 * `openFence` is the line (from 1) of a code fence that is never closed, or null: everything after it is
 * inside the fence, so no entry there can be read.
 */
function parseEntries(text) {
  const { lines, starts } = splitLines(text.replace(/^\uFEFF/, ''));
  const fenced = [];
  const headings = [];
  let fence = null;
  let entriesAt = -1;
  lines.forEach((line, i) => {
    // A backtick fence has no backtick in its info string: "```x```" opens an inline code span instead.
    const m = /^ {0,3}(?:(`{3,})([^`]*)|(~{3,})(.*))$/.exec(line);
    const mark = m && (m[1] ?? m[3]);
    const info = m && (m[1] ? m[2] : m[4]);
    if (fence) {
      fenced[i] = true;
      if (mark && mark[0] === fence.char && mark.length >= fence.size && info.trim() === '') fence = null;
    } else if (mark) {
      fence = { char: mark[0], size: mark.length, line: i + 1 };
      fenced[i] = true;
    } else if (/^#{2,3}\s/.test(line)) {
      if (/^##\s+Entries\s*$/i.test(line)) entriesAt = i;
      headings.push(i);
    }
  });

  const all = [];
  headings.forEach((start, k) => {
    const m = /^### ([LG])-(\d+)(.*)$/.exec(lines[start].trimEnd());
    if (start < entriesAt || !m || (m[3] !== '' && !m[3].startsWith(SEP))) return;
    let end = headings[k + 1] ?? lines.length;
    while (end > start + 1 && lines[end - 1].trim() === '') end -= 1;
    all.push(makeEntry(lines, fenced, start, end, m));
  });
  return {
    lines,
    starts,
    entries: all.filter((e) => !e.placeholder),
    placeholders: all.filter((e) => e.placeholder),
    openFence: fence ? fence.line : null,
  };
}

function makeEntry(lines, fenced, start, end, [, kind, digits, rest]) {
  const segments = rest === '' ? [] : rest.slice(SEP.length).split(SEP);
  let date;
  let phase = null;
  let area;
  let title;
  if (kind === 'L' && segments.length >= 4) {
    [date, phase, area] = segments;
    title = segments.slice(3).join(SEP);
  } else {
    [date, area] = segments;
    title = segments.slice(2).join(SEP);
  }
  const fields = {};
  for (let i = start + 1; i < end; i += 1) {
    const f = fenced[i] ? null : /^- \*\*([^*:]+):\*\*\s*(.*)$/.exec(lines[i]);
    const name = f?.[1].trim().toLowerCase();
    if (f && !(name in fields)) fields[name] = f[2].trim();
  }
  return {
    kind,
    num: Number(digits),
    id: `${kind}-${digits}`,
    date: date ?? '',
    phase,
    area: area ?? '',
    title: title ?? '',
    fields,
    start,
    end,
    placeholder: kind === 'L' && date === PLACEHOLDER_DATE && EXAMPLE_FIELDS.every((name) => !fields[name]),
    raw: lines.slice(start, end).join('\n'),
  };
}

function statusOf(skill = '') {
  const lower = skill.trim().toLowerCase();
  const hit = STATUS_PREFIXES.find(([, prefix]) => lower.startsWith(prefix));
  return hit ? hit[0] : 'unclassified';
}

const scopeOf = (entry) => {
  const scope = (entry.fields.scope ?? '').toLowerCase();
  return scope === 'generic' || scope === 'project' ? scope : null;
};

const isDate = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};

function parseId(text) {
  const m = /^([LG])-?(\d+)$/i.exec(text.trim());
  return m && { kind: m[1].toUpperCase(), num: Number(m[2]) };
}

const byNumber = (a, b) => a.num - b.num;

// ---------------------------------------------------------------- command line

function parseArgs(argv, options) {
  const opts = {};
  const args = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') {
      args.push(...argv.slice(i + 1));
      break;
    }
    if (!arg.startsWith('--')) {
      args.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    if (!Object.hasOwn(options, name)) throw usageError(`Unknown option --${name}.`);
    if (!options[name]) {
      if (eq !== -1) throw usageError(`Option --${name} takes no value.`);
      opts[name] = true;
    } else {
      const value = eq === -1 ? argv[++i] : arg.slice(eq + 1);
      if (value === undefined || value === '') throw usageError(`Option --${name} needs a value.`);
      opts[name] = value;
    }
  }
  return { opts, args };
}

async function readStdin() {
  if (process.stdin.isTTY) return Buffer.alloc(0);
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function parseJson(text, source) {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new CliError(`${source} is not valid JSON (${e.message}). Fix it and run the command again.`);
  }
}

// ---------------------------------------------------------------- lessons: validation and format

const flatten = (value) => value.replace(/\s+/g, ' ').trim();
// A middle dot standing alone (the value is already flat) reads as the separator, also at either end of the value.
const noSeparator = (value) => value.split(' ').map((word) => (word === '·' ? '-' : word)).join(' ');
const pad = (n, width = 3) => String(n).padStart(width, '0');

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
}

/**
 * Checks one lesson as typed by the agent. `full` asks for every field of a log entry; without it only the
 * five fields that are shared are checked and the other fields are ignored (a scope of "project" is still reported).
 */
function normalizeLesson(raw, label, full) {
  const errors = [];
  const fail = (message) => errors.push(`${label}: ${message}`);
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('must be a JSON object.');
    return { errors };
  }
  const given = {};
  for (const [key, value] of Object.entries(raw)) {
    const name = key.toLowerCase();
    if (full && !FIELD_NAMES.includes(name)) fail(`unknown field "${key}"; the fields are ${FIELD_NAMES.join(', ')}.`);
    given[name] = value;
  }
  const text = (name, { required = false, fallback = '' } = {}) => {
    const value = given[name];
    if (value === undefined || value === null) {
      if (required) fail(`${name} is required.`);
      return fallback;
    }
    if (typeof value !== 'string') {
      fail(`${name} must be text.`);
      return fallback;
    }
    const flat = flatten(value);
    if (flat === '' && required) fail(`${name} must not be empty.`);
    return flat || fallback;
  };

  const lesson = {
    area: text('area', { required: true }).toLowerCase(),
    title: noSeparator(text('title', { required: true })),
    symptom: text('symptom', { required: true }),
    cause: text('cause', { required: true }),
    resolution: text('resolution', { required: true }),
    scope: text('scope', { required: full }).toLowerCase(),
  };
  if (lesson.area && !AREAS.includes(lesson.area)) {
    const meant = NEAR_MISSES[lesson.area];
    fail(`area "${lesson.area}" is not one of the 16 areas (${AREAS.join(', ')}).${meant ? ` Did you mean "${meant}"?` : ''}`);
  }
  if (full && lesson.scope && lesson.scope !== 'generic' && lesson.scope !== 'project') {
    fail('scope must be generic (holds in any OutSystems 11 project built through the MCP) or project (only this project).');
  }
  if (!full) return { errors, lesson };

  lesson.skill = text('skill', { required: true });
  const status = statusOf(lesson.skill);
  if (lesson.skill && status === 'unclassified') {
    fail(`skill must start with one of: ${STATUS_LIST}.`);
  } else if (status === 'covered' && !/^covered\s*\([^)]*\S[^)]*\)/i.test(lesson.skill)) {
    fail('skill "covered" must name the section in parentheses, for example "covered (SKILL.md section 3)".');
  }
  lesson.date = text('date', { fallback: today() });
  if (!isDate(lesson.date)) fail('date must be a real day written YYYY-MM-DD.');
  lesson.phase = noSeparator(text('phase'));
  lesson.cost = text('cost', { fallback: 'not recorded' });
  lesson.evidence = text('evidence', { fallback: 'none recorded' });
  lesson.slide = typeof given.slide === 'boolean'
    ? (given.slide ? 'yes' : 'no')
    : String(given.slide ?? '').trim().toLowerCase() || 'no';
  if (lesson.slide !== 'yes' && lesson.slide !== 'no') fail('slide must be yes or no.');
  return { errors, lesson };
}

function formatBlock(id, l) {
  return [
    `### ${[id, l.date, ...(l.phase ? [l.phase] : []), l.area, l.title].join(SEP)}`,
    `- **Symptom:** ${l.symptom}`,
    `- **Cause:** ${l.cause}`,
    `- **Resolution:** ${l.resolution}`,
    `- **Cost:** ${l.cost}`,
    `- **Skill:** ${l.skill}`,
    `- **Scope:** ${l.scope}`,
    `- **Evidence:** ${l.evidence}`,
    `- **Slide:** ${l.slide}`,
  ];
}

const FIELD_LINE = /^- \*\*[^*:]+:\*\*/;

/** The lines of the old template's example to cut: its note, its heading and its field lines, and the blank lines left over. */
function exampleLines({ lines }, example) {
  let from = example.start;
  let i = from - 1;
  while (i >= 0 && lines[i].trim() === '') i -= 1;
  if (i >= 0 && PLACEHOLDER_NOTE.test(lines[i])) from = i;
  // The heading and the field lines under it. Whatever else follows, such as text the user wrote, stays.
  let to = example.start + 1;
  for (let k = to; k < example.end; k += 1) {
    if (FIELD_LINE.test(lines[k])) to = k + 1;
    else if (lines[k].trim() !== '') break;
  }
  while (to < lines.length && lines[to].trim() === '' && (from === 0 || lines[from - 1].trim() === '')) to += 1;
  return [from, to];
}

/** The line ending the log uses at its end: the one that closes its last line of text, else the last one it has. */
function lineEndingOf(body, lastText) {
  const nl = lastText === -1 ? -1 : body.indexOf('\n', lastText);
  const at = nl !== -1 ? nl : body.lastIndexOf('\n');
  return at > 0 && body[at - 1] === '\r' ? '\r\n' : '\n';
}

/**
 * What to do to the log text to add the lessons. Nothing that is already there is changed, except for the cutting
 * of the example of the old template (`removedExample`, which asks for the whole file to be rewritten):
 * `addition` goes after the text as it is, with the blank line and the line ending that are missing.
 */
function planAppend(logText, lessons) {
  const bom = logText.startsWith('\uFEFF') ? '\uFEFF' : '';
  let body = logText.slice(bom.length);
  const parsed = parseEntries(body);
  if (parsed.openFence !== null) {
    throw new CliError(`The log has a code fence that opens at line ${parsed.openFence} and is never closed, so the entries after it are `
      + 'not read by this script, and a new entry would be hidden as well. Close the fence with a line of three backticks, '
      + 'and run add again. Nothing was written.');
  }

  // Cut from the end, so the offsets of the cuts that come first stay valid.
  const cuts = parsed.placeholders.map((example) => exampleLines(parsed, example)).sort((a, b) => b[0] - a[0]);
  for (const [from, to] of cuts) {
    body = body.slice(0, parsed.starts[from]) + body.slice(to < parsed.lines.length ? parsed.starts[to] : body.length);
  }

  let lastText = body.length - 1;
  while (lastText >= 0 && /\s/.test(body[lastText])) lastText -= 1;
  const eol = lineEndingOf(body, lastText);
  let lead = '';
  if (lastText === -1) {
    lead = body === '' || body.endsWith('\n') ? '' : eol;
  } else {
    const closes = body.indexOf('\n', lastText);
    const rest = closes === -1 ? null : body.slice(closes + 1);
    if (rest === null) lead = eol + eol;
    else if (rest === '') lead = eol;
    else lead = rest.endsWith('\n') ? '' : eol;
  }

  const first = Math.max(0, ...parsed.entries.filter((e) => e.kind === 'L').map((e) => e.num)) + 1;
  const ids = lessons.map((_, i) => `L-${pad(first + i)}`);
  const blocks = lessons.map((lesson, i) => formatBlock(ids[i], lesson));
  const addition = lead + blocks.map((block, i) => (i ? eol : '') + block.join(eol) + eol).join('');
  return { ids, blocks, addition, text: bom + body + addition, removedExample: cuts.length > 0 };
}

/** Puts the plan on disk. The log is appended to, or, to cut the example, replaced whole by a file written beside it. */
function commitPlan(file, original, plan) {
  if (!plan.removedExample) {
    try {
      fs.appendFileSync(file, plan.addition);
    } catch (e) {
      try {
        fs.truncateSync(file, original.length); // take back what was written before the failure
      } catch { /* the original error is the one to report */ }
      throw new CliError(`Could not write to ${file} (${e.code ?? e.message}). The log was left as it was; nothing was added.`);
    }
    return;
  }
  if (!Buffer.from(original.toString('utf8'), 'utf8').equals(original)) {
    throw new CliError(`The log is not valid UTF-8, so rewriting it to drop the example of the template would damage it. Save ${file} as UTF-8, `
      + 'or delete the example by hand, and run add again. Nothing was written.');
  }
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, plan.text, { flag: 'wx' });
    try {
      fs.chmodSync(temporary, fs.statSync(file).mode & 0o7777);
    } catch { /* keeping the permissions is a courtesy */ }
    fs.renameSync(temporary, file);
  } catch (e) {
    fs.rmSync(temporary, { force: true });
    throw new CliError(`Could not write ${file} (${e.code ?? e.message}). The log was left as it was; nothing was added.`);
  }
}

// ---------------------------------------------------------------- lock

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Runs `work` while holding "<log>.lock", created exclusively. A lock older than a minute is a crashed run's. */
function withLock(logFile, work) {
  const lock = `${logFile}.lock`;
  const wanted = process.env.O11_LESSONS_LOCK_WAIT_MS;
  const waitMs = wanted && Number.isFinite(Number(wanted)) ? Number(wanted) : LOCK_WAIT_MS;
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      fs.writeFileSync(lock, `${process.pid}\n`, { flag: 'wx' });
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    let age;
    try {
      age = Date.now() - fs.statSync(lock).mtimeMs;
    } catch {
      continue; // the holder finished between our two calls
    }
    if (age > LOCK_STALE_MS) {
      fs.rmSync(lock, { force: true });
    } else if (Date.now() >= deadline) {
      throw new CliError(`Another run holds the lock ${lock}. Wait for it to finish and try again; if no other run is active, delete that file.`);
    } else {
      sleep(50);
    }
  }
  try {
    return work();
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

// ---------------------------------------------------------------- commands

function toRow(entry) {
  const generic = entry.kind === 'G';
  return {
    id: entry.id,
    source: generic ? 'generic' : 'project',
    date: entry.date,
    phase: entry.phase,
    area: entry.area,
    title: entry.title,
    status: generic ? null : statusOf(entry.fields.skill),
    scope: generic ? 'generic' : scopeOf(entry),
    fields: entry.fields,
  };
}

function cmdPending({ opts, args }) {
  if (args.length) throw usageError(`pending takes no argument, got "${args[0]}".`);
  if (opts['project-only'] && opts['generic-only']) throw usageError('--project-only and --generic-only exclude each other.');
  const areas = opts.area ? opts.area.split(',').map((a) => a.trim().toLowerCase()).filter(Boolean) : null;
  if (areas && areas.length === 0) throw usageError('--area needs at least one area.');
  const wanted = (e) => !areas || areas.includes(e.area.toLowerCase());

  const sections = [];
  if (!opts['project-only']) {
    sections.push({ title: 'Generic lessons', entries: loadGeneric(opts).filter(wanted).sort(byNumber) });
  }
  if (!opts['generic-only']) {
    const log = openLog(opts);
    if (log) {
      const entries = readEntries(log).entries
        .filter((e) => e.kind === 'L' && PENDING.has(statusOf(e.fields.skill)) && wanted(e))
        .sort(byNumber);
      sections.push({ title: 'Project lessons to read', entries });
    } else {
      err(`note: ${noLogMessage(opts)} Only the generic lessons are listed.`);
    }
  }

  if (opts.json) {
    out(`${JSON.stringify(sections.flatMap((s) => s.entries.map(toRow)), null, 2)}\n`);
    return 0;
  }
  const lines = [];
  for (const { title, entries } of sections) {
    lines.push(`${title} (${entries.length})`);
    for (const e of entries) {
      if (opts.full) lines.push('', e.raw);
      else lines.push(`${e.id}${SEP}${e.area}${SEP}${e.title}`);
    }
  }
  out(`${lines.join('\n')}\n`);
  if (!opts.full) err('Run "lessons.mjs show <id>" to print a whole lesson.');
  return 0;
}

function cmdShow({ opts, args }) {
  if (args.length === 0) throw usageError('show needs at least one id, for example L-007 or G-001.');
  const wanted = args.map((arg) => ({ arg, id: parseId(arg) }));
  const generic = wanted.some((w) => w.id?.kind === 'G') ? loadGeneric(opts) : [];
  const log = openLog(opts);
  const project = log ? readEntries(log).entries.filter((e) => e.kind === 'L') : [];
  if (!log && !wanted.some((w) => w.id?.kind === 'L')) err(`note: ${noLogMessage(opts)} Only generic lessons can be shown.`);

  const printed = [];
  let code = 0;
  for (const { arg, id } of wanted) {
    const entry = id && (id.kind === 'G' ? generic : project).find((e) => e.num === id.num);
    if (entry) {
      printed.push(entry.raw);
    } else if (id?.kind === 'L' && !log) {
      err(noLogMessage(opts));
      code = 2;
    } else {
      err(`No lesson with the id "${arg}". Run "lessons.mjs pending" to list the lessons.`);
      code ||= 1;
    }
  }
  if (printed.length) out(`${printed.join('\n\n')}\n`);
  return code;
}

/** The command that prepares a lesson to share, as it can be typed from the folder where the script runs now. */
function shareCommand(id, opts) {
  const quote = (text) => (/\s/.test(text) ? `"${text}"` : text);
  const script = path.relative(process.cwd(), fileURLToPath(import.meta.url));
  return `node ${quote(script)} share ${id}${opts.log ? ` --log ${quote(opts.log)}` : ''}`;
}

async function cmdAdd({ opts, args }) {
  if (args.length) throw usageError(`add takes no argument, got "${args[0]}". The entries come from --file or from stdin.`);
  const log = requireLog(opts);
  const buffer = opts.file ? readBuffer(opts.file) : await readStdin();
  const input = decodeInput(buffer, opts.file || 'The input');
  if (input.trim() === '') throw usageError('There is nothing to add. Pass --file <entries.json>, or pipe the JSON on stdin.');

  const parsed = parseJson(input, opts.file || 'The input');
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const checked = list.map((raw, i) => normalizeLesson(raw, `entry ${i + 1}`, true));
  const problems = checked.flatMap((c) => c.errors);
  if (list.length === 0) problems.push('The list is empty: there is nothing to add.');
  if (problems.length) {
    throw new CliError(`${problems.join('\n')}\nNothing was written. Fix the entries and run add again.`);
  }
  const lessons = checked.map((c) => c.lesson);

  if (opts['dry-run']) {
    const plan = planAppend(log.text, lessons);
    out(`${plan.blocks.map((b) => b.join('\n')).join('\n\n')}\n`);
    if (plan.removedExample) err('note: the example entry of the template would be removed.');
    err('Dry run: nothing was written.');
    return 0;
  }

  // The log is read again under the lock: another run may have added entries since it was first read.
  const plan = withLock(log.file, () => {
    const original = fs.readFileSync(log.file);
    const result = planAppend(original.toString('utf8'), lessons);
    commitPlan(log.file, original, result);
    return result;
  });
  out(`${plan.ids.join(' ')}\n`);
  if (plan.removedExample) err('note: removed the example entry of the template.');
  lessons.forEach((lesson, i) => {
    if (lesson.scope === 'generic' && PENDING.has(statusOf(lesson.skill))) {
      err(`hint: ${plan.ids[i]} is generic and no skill covers it fully. Ask the user whether to share it with the kit maintainers; `
        + `only if they agree, run: ${shareCommand(plan.ids[i], opts)}`);
    }
  });
  return 0;
}

function cmdCheck({ opts, args }) {
  if (args.length) throw usageError(`check takes no argument, got "${args[0]}".`);
  const { text } = requireLog(opts);
  const { entries: all, placeholders, openFence } = parseEntries(text);
  const entries = all.filter((e) => e.kind === 'L');

  const problems = [];
  let errors = 0;
  let warnings = 0;
  const report = (entry, severity, what) => {
    if (severity === 'error') errors += 1;
    else warnings += 1;
    problems.push(`${entry.id}: ${severity}: ${what}`);
  };

  if (openFence !== null) {
    errors += 1;
    problems.push(`line ${openFence}: error: a code fence opens here and is never closed, so every entry after it is hidden from this script. Close it with a line of three backticks.`);
  }

  const firstLine = new Map();
  entries.forEach((entry, i) => {
    const f = entry.fields;
    if (firstLine.has(entry.num)) report(entry, 'error', `duplicate id, already used at line ${firstLine.get(entry.num)}.`);
    else firstLine.set(entry.num, entry.start + 1);
    if (i > 0 && entry.num < entries[i - 1].num) report(entry, 'error', `ids must increase, but ${entry.id} follows ${entries[i - 1].id}.`);
    for (const name of ['symptom', 'cause', 'resolution', 'skill']) {
      if (!f[name]) report(entry, 'error', `${name[0].toUpperCase()}${name.slice(1)} is missing.`);
    }

    const area = entry.area.toLowerCase();
    if (!AREAS.includes(area)) {
      const meant = NEAR_MISSES[area];
      report(entry, 'warning', `area "${entry.area}" is not one of the 16 areas${meant ? `; use "${meant}"` : ''}.`);
    }
    if (f.skill && statusOf(f.skill) === 'unclassified') {
      report(entry, 'warning', 'Skill does not start with a known status, so it counts as pending.');
    }
    if (!f.scope) report(entry, 'warning', 'Scope is missing (generic or project).');
    else if (!scopeOf(entry)) report(entry, 'warning', `Scope "${f.scope}" is not generic or project.`);
    for (const name of ['cost', 'evidence', 'slide']) {
      if (!f[name]) report(entry, 'warning', `${name[0].toUpperCase()}${name.slice(1)} is missing.`);
    }
    if (!isDate(entry.date)) report(entry, 'warning', `the date in the heading, "${entry.date}", is not a real day written YYYY-MM-DD.`);
  });

  out(`${[`${entries.length} entries, ${errors} errors, ${warnings} warnings`, ...problems].join('\n')}\n`);
  if (placeholders.length) err('note: the log still holds the example entry of the template. add removes it with the first real entry.');
  return errors > 0 || (opts.strict && warnings > 0) ? 1 : 0;
}

function sharedLesson(opts, args) {
  if (opts.file) {
    if (args.length) throw usageError('Give a lesson id or --file, not both.');
    const parsed = parseJson(decodeInput(readBuffer(opts.file), opts.file), opts.file);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    if (list.length !== 1) throw new CliError(`${opts.file} must hold exactly one lesson.`);
    const { errors, lesson } = normalizeLesson(list[0], 'lesson', false);
    if (errors.length) throw new CliError(`${errors.join('\n')}\nNothing was prepared. Fix ${opts.file} and run share again.`);
    if (lesson.scope === 'project') throw new CliError('This lesson has the scope "project": only generic lessons are shared with the kit.');
    return lesson;
  }

  if (args.length !== 1) throw usageError('share needs one L-id, or --file <lesson.json>.');
  const id = parseId(args[0]);
  if (!id || id.kind !== 'L') throw usageError(`"${args[0]}" is not a project lesson id; share takes an L-id such as L-007.`);
  const log = requireLog(opts);
  const entry = readEntries(log).entries.find((e) => e.kind === 'L' && e.num === id.num);
  if (!entry) throw new CliError(`No lesson with the id "${args[0]}" in ${log.file}.`);

  // A Scope line that begins with "project" is a project lesson, whatever else it says.
  const scope = scopeOf(entry);
  if (scope === 'project' || /^project\b/i.test(entry.fields.scope ?? '')) {
    throw new CliError(`${entry.id} has the scope "project": only generic lessons are shared with the kit.`);
  }
  if (!scope) err(`note: ${entry.id} has no valid Scope line. Share it only if it would hold in any OutSystems 11 project built through the MCP.`);
  const lesson = {
    area: entry.area,
    title: entry.title,
    symptom: entry.fields.symptom ?? '',
    cause: entry.fields.cause ?? '',
    resolution: entry.fields.resolution ?? '',
  };
  const missing = SHARED_FIELDS.filter((n) => !lesson[n]);
  if (missing.length) {
    throw new CliError(`${entry.id} has no ${missing.join(', ')}. Complete the entry with add, or write the lesson in a file and pass it with --file.`);
  }
  return lesson;
}

/** What a text holds that must not be shared, in the order of the text. A match inside another one is not reported twice. */
function guardHits(text) {
  const found = [];
  for (const [what, pattern] of GUARDS) {
    for (const m of text.matchAll(pattern)) found.push({ what, start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  for (const hit of found) {
    if (!kept.some((k) => k.start <= hit.start && hit.end <= k.end)) kept.push(hit);
  }
  return kept;
}

function cmdShare({ opts, args }) {
  const repo = opts.repo || process.env.O11_FLOW_KIT_REPO || DEFAULT_REPO;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw usageError(`The repository "${repo}" must be written owner/name.`);
  const lesson = sharedLesson(opts, args);

  const hits = SHARED_FIELDS.flatMap((field) => guardHits(lesson[field]).map(({ what, text }) => (
    `  ${field}: ${what} ("${text.length > 40 ? `${text.slice(0, 40)}...` : text}")`
  )));
  if (hits.length) {
    throw new CliError('This lesson holds details of the project and was not prepared:\n'
      + `${hits.join('\n')}\n`
      + 'Write a generalised version without them, save it as JSON with area, title, symptom, cause and resolution, '
      + 'and run: lessons.mjs share --file <lesson.json>');
  }

  const title = `Lesson: ${lesson.area}${SEP}${lesson.title}`;
  const body = [
    '## Area', '', lesson.area,
    '', '## Symptom', '', lesson.symptom,
    '', '## Cause', '', lesson.cause,
    '', '## Resolution', '', lesson.resolution,
    '', CLOSING_LINE,
  ].join('\n');
  const base = `https://github.com/${repo}/issues/new?title=${encodeURIComponent(title)}`;
  // No labels parameter: GitHub answers 404 to a visitor who may not label issues. The title prefix tells the maintainers what it is.
  let url = `${base}&body=${encodeURIComponent(body)}`;
  if (url.length > MAX_LINK_LENGTH) {
    url = base;
    err('The link is too long to carry the text. Open it, then paste the text printed above into the body of the issue.');
  }

  out(opts.json ? `${JSON.stringify({ repo, title, body, url }, null, 2)}\n` : `${title}\n\n${body}\n\n${url}\n`);
  return 0;
}

// ---------------------------------------------------------------- main

async function main(argv) {
  const [name, ...rest] = argv;
  if (name === undefined) throw usageError('No command given.');
  if (['--help', '-h'].includes(name)) return COMMANDS.help.run();
  if (!Object.hasOwn(COMMANDS, name)) throw usageError(`Unknown command "${name}".`);
  const command = COMMANDS[name];
  const { opts, args } = parseArgs(rest, { ...command.options, ...COMMON_OPTIONS });
  return opts.help ? COMMANDS.help.run() : command.run({ opts, args });
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (e) {
  if (e instanceof CliError) {
    err(e.message);
    if (e.showUsage) err(`\n${usage()}`);
    process.exitCode = e.code;
  } else if (typeof e?.code === 'string' && /^E[A-Z]+$/.test(e.code) && e.syscall) {
    // A file the script could not read, create or write: say which one, without a stack trace.
    err(`Cannot ${e.syscall}${e.path ? ` ${e.path}` : ''}: ${e.code}${e.message ? ` (${e.message})` : ''}.`);
    process.exitCode = 1;
  } else {
    throw e;
  }
}
