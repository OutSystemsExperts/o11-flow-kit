# Lessons log: what went wrong, how it was solved

Running record of every mistake, dead end and fix met while building with the Service Studio MCP.
Entries are append-only. A wrong entry is corrected by a new one that says which id it supersedes.
Read the entries the skill has not absorbed before you plan (rule 2 of `AGENTS.md`).

## Entry format

One heading, then one line per field. The heading is `### L-NNN · date · phase · area · title`.
`phase` is optional: leave it out if you do not work in phases.
`area` is one of: session, edit-loop, merge-publish, dependencies, ui, charts, theme, model, logic, tests,
environment, quota, collaboration, security.

- **Symptom:** what was seen (the exact message when short)
- **Cause:** why it happened ("unknown" if it was never established)
- **Resolution:** what finally worked, or "unresolved"
- **Cost:** rounds, time or quota lost, if known
- **Skill:** exactly one of the values below, written on this line
  - covered (section): a skill already states the whole lesson, in the section you name. Nothing to read.
  - partial: a skill states only part of it, such as the symptom without the cause, or one variant. Read the entry.
  - missing from the official skill: the official skill should have said it and does not (or says it wrongly), and the pitfalls skill carries the correction. Nothing to read.
  - new in the skill: your own finding, not a gap in the official skill, added to the pitfalls skill. Nothing to read.
  - not in any skill yet: no skill states it. Read the entry.
- **Evidence:** the commit, file or tool output that shows it
- **Slide:** yes | no (whether it earns a slide when you present the lessons)

## Entries

Delete this example when you add your first entry.

### L-001 · YYYY-MM-DD · phase · area · short title
- **Symptom:**
- **Cause:**
- **Resolution:**
- **Cost:**
- **Skill:**
- **Evidence:**
- **Slide:**
