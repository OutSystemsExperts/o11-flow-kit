---
name: o11-rite-setup
description: Sets up "the rite" in the current project for building in OutSystems 11 through the Service Studio MCP. Writes AGENTS.md (seven rules), CLAUDE.md (the @AGENTS.md import) and docs/outsystems/lessons-log.md without overwriting anything, then checks that the Service Studio MCP server, the official servicestudio-mcp-oml skill and Superpowers are installed, and prints the exact command for whatever is missing. Use it once per project, right after installing the o11-rite-kit skills, or whenever the user types /o11-rite-setup, says "set up the rite", "set up the O11 kit", "configurar o kit", or asks which prerequisites are still missing.
---

# Set up the rite in this project

Do the three parts in order and report at the end. Never overwrite a file the project already has, never delete anything, and do not install anything yourself: the user runs the commands.

## 1. Write the project files

The three files are in the `assets/` folder next to this file. Work in the root of the project: the folder that holds `.claude/` or `.agents/`. Ask if it is not obvious.

1. `AGENTS.md`
   - Missing: copy `assets/AGENTS.md` as it is.
   - Present, and it already has the heading "Rules for building in OutSystems 11 through the Service Studio MCP": leave it alone.
   - Present without that heading: append the whole content of `assets/AGENTS.md` at the end, after one blank line. Do not edit the rules the project already had.
2. `CLAUDE.md`
   - Missing: copy `assets/CLAUDE.md` as it is.
   - Present with a line `@AGENTS.md`: leave it alone.
   - Present without it: add the line `@AGENTS.md` as the first line, followed by one blank line. Change nothing else.
3. `docs/outsystems/lessons-log.md`
   - Missing: create the folder and copy `assets/lessons-log.template.md` to that path.
   - Present: leave it alone.

## 2. Check the prerequisites

Check each row and note "ok" or "missing".

| # | What | How to check | If it is missing, the user runs |
|---|---|---|---|
| 1 | Service Studio 11.55.91 or later, with its MCP server started | You cannot see this from here: ask the user. | In Service Studio: open the module, **Edit > MCP Server**, **Start MCP Server**. |
| 2 | The `servicestudio` MCP server registered in the agent | Tools whose names start with `mcp__servicestudio__` are available, or `claude mcp list` names `servicestudio`. | In a terminal: `claude mcp add --transport http servicestudio http://127.0.0.1:41820/mcp --scope user` (with the URL the Service Studio dialog shows, if the port was changed). |
| 3 | The official skill `servicestudio-mcp-oml` | The skill is in your list of skills, or `servicestudio-mcp-oml/SKILL.md` exists under `~/.claude/skills/` or the project's `.claude/skills/`. | In a terminal: `git clone https://github.com/OutSystems/outsystems11-mcp.git`, then, inside that folder, `bash scripts/install.sh` (Windows PowerShell: `powershell -ExecutionPolicy Bypass -File scripts\install.ps1`). |
| 4 | Superpowers: brainstorming and the rest of the method | `superpowers:brainstorming` is in your list of skills. | Inside Claude Code: `/plugin install superpowers@claude-plugins-official`, then restart Claude Code. |
| 5 | The pitfalls skill | `outsystems-mcp-pitfalls` is in your list of skills. | In a terminal, in the project root: `npx skills add alexandreafc/o11-rite-kit`. |

Row 2: a server that is registered but not connected still counts as "ok". Say that Service Studio must be open with its MCP server started, and that `/mcp reconnect servicestudio` inside Claude Code reconnects it.

## 3. Report

Answer in the user's language, in a few lines:

- which of the three files you created, which you extended and which you left alone;
- the five prerequisites in the order of the table, each "ok" or "missing" with its command;
- the next step. When everything is ok: restart the agent so it loads `AGENTS.md`, open a **copy** of a module in Service Studio (the MCP write tools are a Beta feature), check the connection by asking for a summary of the open module, and start the first task with `/superpowers:brainstorming` followed by one sentence that describes something small.
