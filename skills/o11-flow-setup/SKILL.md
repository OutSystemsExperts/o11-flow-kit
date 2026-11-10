---
name: o11-flow-setup
description: Sets up "the flow" in the current project for building in OutSystems 11 through the Service Studio MCP. Writes AGENTS.md (seven rules), CLAUDE.md (the @AGENTS.md import) and docs/outsystems/lessons-log.md without overwriting anything, then checks that the Service Studio MCP server, the official servicestudio-mcp-oml skill and Superpowers are installed, and prints the exact command for whatever is missing. Use it once per project, right after installing the o11-flow-kit skills, or whenever the user types /o11-flow-setup, says "set up the flow", "set up the O11 kit", "configurar o kit", or asks which prerequisites are still missing.
---

# Set up the flow in this project

Do the three parts in order and report at the end. Never overwrite a file the project already has, never delete anything, and do not install anything yourself: the user runs the commands.

## 1. Write the project files

**Where.** The project root is the directory this session was started in (its working directory). Use it as it is: do not walk up to a parent folder, and do not pick a subfolder of a monorepo on your own. Two cases stop you before you write anything:

- the working directory is the user's home folder, or a folder with no project in it (nothing but dot-folders): say so and ask where the project is;
- this skill was installed for the user (under the home folder) and not in a project: that is fine, the files still go to the working directory, never next to the skill.

**What.** The three files are in the `assets/` folder next to this file.

1. `AGENTS.md`
   - Missing: copy `assets/AGENTS.md` as it is.
   - Present, and it already holds these rules: leave it alone. It holds them if it has the heading "Rules for building in OutSystems 11 through the Service Studio MCP", or a rule that starts with "**Load the skills first.**" and one that starts with "**Signatures first.**".
   - Present without them: append the whole content of `assets/AGENTS.md` at the end, after one blank line. Do not edit the rules the project already had.
2. `CLAUDE.md`
   - Missing: copy `assets/CLAUDE.md` as it is.
   - Present, with a line that is exactly `@AGENTS.md` (the import, alone on its line): leave it alone. A sentence that only mentions `@AGENTS.md` is not the import.
   - Present without the import: add the line `@AGENTS.md`, followed by one blank line, at the top of the file; if the file starts with a front matter block (`---` … `---`), add it right after that block. Change nothing else.
3. `docs/outsystems/lessons-log.md`
   - Missing: create the folder and copy `assets/lessons-log.template.md` to that path.
   - Present: leave it alone.

Read each file back after you write it and compare it with its asset.

## 2. Check the prerequisites

Check each row and give it one of the states in the last column.

| # | What | How to check | If it is missing, the user runs | States |
|---|---|---|---|---|
| 1 | Service Studio 11.55.91 or later, with its MCP server started | You cannot see this from here: ask the user. | In Service Studio: open the module, **Edit > MCP Server**, **Start MCP Server**. | ok / not confirmed |
| 2 | The `servicestudio` MCP server, registered and answering | Connected: tools whose names start with `mcp__servicestudio__` are available. Registered only: `claude mcp list` names `servicestudio` but its tools are not available. | In a terminal: `claude mcp add --transport http servicestudio http://127.0.0.1:41820/mcp --scope user` (with the URL the Service Studio dialog shows, if the port was changed). | connected / registered, not connected / missing |
| 3 | The official skill `servicestudio-mcp-oml` | The skill is in your list of skills, or `servicestudio-mcp-oml/SKILL.md` exists in a folder your host reads skills from (`~/.claude/skills/`, the project's `.claude/skills/` or `.agents/skills/`). | In a terminal: `git clone https://github.com/OutSystems/outsystems11-mcp.git`, then, inside that folder, `bash scripts/install.sh` (Windows PowerShell: `powershell -ExecutionPolicy Bypass -File scripts\install.ps1`). | ok / missing |
| 4 | Superpowers: brainstorming and the rest of the method | `superpowers:brainstorming` is in your list of skills. | Inside Claude Code: `/plugin install superpowers@claude-plugins-official`, then restart Claude Code. | ok / missing |
| 5 | The pitfalls skill | `outsystems-mcp-pitfalls` is in your list of skills. | In a terminal, in the project root: `npx skills add alexandreafc/o11-flow-kit`. | ok / missing |

Row 2, "registered, not connected", is not ready: say that Service Studio must be open with a module and its MCP server started (row 1), and that `/mcp reconnect servicestudio` inside Claude Code reconnects it. Never report the set-up as complete while row 1 is "not confirmed" or row 2 is anything but "connected".

## 3. Report

Answer in the user's language, in a few lines:

- the folder you treated as the project root;
- which of the three files you created, which you extended and which you left alone;
- the five prerequisites in the order of the table, each with its state and, when it is not ready, its command;
- the next steps, in this order: **restart the agent**, so it loads `AGENTS.md` (a running session does not pick up the new files); open a **copy** of a module in Service Studio (the MCP write tools are a Beta feature); check the connection by asking for a summary of the open module, and approve the dialog Service Studio shows; then start the first task with `/superpowers:brainstorming` followed by one sentence that describes something small.
