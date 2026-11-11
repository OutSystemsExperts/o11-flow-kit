# Lessons log: what went wrong, how it was solved

Running record of every mistake, dead end and fix met while building with the Service Studio MCP.
Entries are append-only. A wrong entry is corrected by a new one that says which id it supersedes.
Read the entries the skill has not absorbed before you plan (rule 2 of `AGENTS.md`).
Generic lessons shipped with the kit live in the `outsystems-mcp-pitfalls` skill (`references/generic-lessons.md`)
and are not copied here.

## Entry format

One heading, then one line per field. The heading is `### L-NNN · date · phase · area · title`, with the date
written YYYY-MM-DD and a space, a middle dot (·) and a space between the parts.
`phase` is optional: leave it out if you do not work in phases (`### L-NNN · date · area · title`).
Do not write ` · ` inside the phase or the title.
`area` is one of: session, edit-loop, merge-publish, dependencies, ui, charts, theme, model, logic, tests,
environment, quota, collaboration, security, planning, review.

- **Symptom:** what was seen (the exact message when short)
- **Cause:** why it happened ("unknown" if it was never established)
- **Resolution:** what finally worked, or "unresolved"
- **Cost:** rounds, time or quota lost, if known
- **Skill:** one of the values below, at the start of the line (a short note may follow)
  - covered (section): a skill already states the whole lesson, in the section you name. Nothing to read.
  - partial: a skill states only part of it, such as the symptom without the cause, or one variant. Read the entry.
  - missing from the official skill: the official skill should have said it and does not (or says it wrongly), and the pitfalls skill carries the correction. Nothing to read.
  - new in the skill: your own finding, not a gap in the official skill, added to the pitfalls skill. Nothing to read.
  - not in any skill yet: no skill states it. Read the entry.
- **Scope:** generic | project
  - generic: the lesson would hold in any OutSystems 11 project built through the Service Studio MCP.
  - project: it only makes sense in this project (its business rules, its data, its people, its environment).
- **Evidence:** the commit, file or tool output that shows it
- **Slide:** yes | no (whether it earns a slide when you present the lessons)

An example, in the form an entry takes under Entries:

```
### L-001 · 2026-11-11 · merge-publish · Refresh before merge dropped the edit chain
- **Symptom:** after `omlRefreshReferences`, the merge held none of the last three applies
- **Cause:** a refresh drops an unmerged chain
- **Resolution:** sent the three applies again, merged, then refreshed
- **Cost:** one round
- **Skill:** covered (outsystems-mcp-pitfalls, section 2)
- **Scope:** generic
- **Evidence:** the merge result and the read-back of the action
- **Slide:** no
```

## Adding an entry

In the project root, run `node <folder of the outsystems-mcp-pitfalls skill>/scripts/lessons.mjs add --file entries.json`.
`entries.json` is a scratch file (delete it afterwards) that holds one object, or an array of them, keyed by the
field names in lower case. `area`, `title`, `symptom`, `cause`, `resolution`, `skill` and `scope` are required;
`date` (today by default), `phase`, `cost`, `evidence` and `slide` (`yes` or `no`) are optional. The script checks
every entry and writes nothing if one is wrong; otherwise it gives each entry the next id, appends it under Entries
and prints the ids. Add `--dry-run` to see what it would write.

Without Node.js, append the entry by hand at the end of this file, after a blank line, in the format above: its id is
the highest L number under Entries plus one (L-001 for the first: the example above does not count), with at least
three digits.

## Entries
