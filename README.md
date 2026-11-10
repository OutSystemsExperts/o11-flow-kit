# o11-rite-kit

A starter kit for building in **OutSystems 11** with an AI coding agent, through the Service Studio MCP server. It gives the agent a routine to follow (the rite), seven house rules, and a skill with the pitfalls that already cost real rounds.

```
npx skills add alexandreafc/o11-rite-kit
```

> A personal kit, shared as is. It is not an OutSystems product. The MCP server and the official skill belong to OutSystems: see [OutSystems/outsystems11-mcp](https://github.com/OutSystems/outsystems11-mcp).

## The rite

One task at a time, nine steps, in order:

| # | Step | What happens |
|---|---|---|
| 1 | brainstorm | The agent asks before it builds: questions with options, not guesses. |
| 2 | spec | What and why, before any Flow. You approve it. |
| 3 | adversarial | Someone who did not write the spec tries to break it; later, the plan too. |
| 4 | plan | Small tasks, each born with its test. You approve it. |
| 5 | test ✗ red | The tests are written against empty signatures and must fail on values, not on a compile error. |
| 6 | MCP applies | A script generates the body, the agent sends it through the MCP and reads back what landed. |
| 7 | publish | The producer module first, then a refresh and a publish of each consumer. |
| 8 | test ✓ green | The same suite, now passing. |
| 9 | review | Reviewer agents read the generated code; a human decides what is published. |

Two human touches remain today, and the plan knows when each one comes: approving the MCP session token in Service Studio, and ticking the dependencies in Manage Dependencies, one batch per consumer module.

## Set up, in order

Seven steps. Steps 1 to 4 are once per machine, steps 5 and 6 are once per project, and step 7 is your first task. Each step says where you type it.

Before you start you need [Claude Code](https://code.claude.com/docs) installed and signed in. Service Studio runs on your machine, so Claude Code has to run on that same machine: the terminal, the Desktop app or an IDE, not the web version.

### 1. Service Studio

Install or update to **Service Studio 11.55.91 or later**. Open the module you want to work on, go to **Edit > MCP Server** and click **Start MCP Server**. The server does not start by itself: you start it in each session.

Start on a copy of a module, not on production. The MCP read tools are Generally Available; the write tools are a Beta feature.

### 2. Connect Claude Code to it

In a terminal:

```
claude mcp add --transport http servicestudio http://127.0.0.1:41820/mcp --scope user
```

If you changed the port, use the URL the Service Studio dialog shows.

### 3. The official skill: `servicestudio-mcp-oml`

In a terminal:

```
git clone https://github.com/OutSystems/outsystems11-mcp.git
cd outsystems11-mcp
bash scripts/install.sh
```

On Windows PowerShell the last line is:

```
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

This is the path the OutSystems repository documents. It copies the skill, its `docs/` folder included, to your user skills folder. The pitfalls skill of this kit is a delta on top of it and searches that `docs/` folder.

### 4. Superpowers: brainstorming and the rest of the method

Inside Claude Code, not in a terminal:

```
/plugin install superpowers@claude-plugins-official
```

Restart Claude Code, then type `/plugin` to check that `superpowers` is listed. Other hosts install it differently: see the [Superpowers README](https://github.com/obra/superpowers).

### 5. This kit

In a terminal, in the root of your project:

```
npx skills add alexandreafc/o11-rite-kit
```

It installs two skills into the project, under `.claude/skills/`: `outsystems-mcp-pitfalls` and `o11-rite-setup`. It also writes `skills-lock.json`, which records where they came from: commit it with the skills. The installer asks which skills and which agents to install for; run by an agent, it does not ask. To skip the questions and install for Claude Code only:

```
npx skills add alexandreafc/o11-rite-kit -a claude-code -y
```

It needs a recent Node.js: see the [skills CLI](https://github.com/vercel-labs/skills). With no Node.js, see [Without Node](#without-node).

### 6. Set it up

Inside Claude Code, in the project:

```
/o11-rite-setup
```

You can also just say "set up the rite". The skill writes three files and never overwrites one you already have:

| File | What it is |
|---|---|
| `AGENTS.md` | The seven rules. If you already have one, the rules are added at the end. |
| `CLAUDE.md` | One line, `@AGENTS.md`, so Claude Code loads the same rules. If you already have one, the line is added at the top. |
| `docs/outsystems/lessons-log.md` | Your own lessons log, from the template. |

Then it checks steps 1 to 5 and tells you the command for whatever is still missing.

**Restart Claude Code after it**, so the new `AGENTS.md` loads: a session that was already running does not pick the files up.

### 7. Your first task

Check the connection first. With a module open in Service Studio, ask Claude Code:

> Summarize the module open in Service Studio.

Service Studio shows a dialog that asks whether the agent may connect: approve it. That is the first human touch, and now you know it is coming. If a summary comes back, you are ready. If the connection does not come up, check that the MCP server is started in Service Studio and run `/mcp reconnect servicestudio` in Claude Code. Then start with one small task, a single rule or a single screen:

```
/superpowers:brainstorming I need a rule for who can see a project
```

Walk the nine steps once. When the agent surprises you, write the lesson in your log the same day.

Tip: you can type the terminal commands of steps 2, 3 and 5 inside Claude Code by starting the line with `!`.

## The seven rules

The full text is in [`skills/o11-rite-setup/assets/AGENTS.md`](skills/o11-rite-setup/assets/AGENTS.md).

1. Load the skills first.
2. Read the lessons the skill has not absorbed.
3. Signatures first.
4. Manage Dependencies in one batch, once per task.
5. Test first, against the signatures.
6. Generate large Model API code with scripts kept in git.
7. Plan before you build, and let someone attack the plan.

## What is in this repository

| Path | What it is |
|---|---|
| `skills/outsystems-mcp-pitfalls/` | The skill: `SKILL.md` and `references/`. What already went wrong, with the reason for each item. |
| `skills/o11-rite-setup/` | The setup skill. Its `assets/` folder holds `AGENTS.md`, `CLAUDE.md` and `lessons-log.template.md`. |

## A light adversarial gate

Before the agent writes any code, ask someone who did not write the spec or the plan to try to break it. Two ways, pick one:

1. A second model. Open a different model or assistant, paste the spec (later the plan), and ask:

   ```
   Act as an adversary. Here is a spec for a change to an OutSystems 11 module.
   Try to break it: what is missing, ambiguous or wrong? Which assumption is
   weakest? Is this the right approach at all, not only is it well written?
   List findings as critical, high, medium or low.
   ```

2. A fresh subagent. In Claude Code, ask: "Start a new subagent with no context from this chat. Give it only the spec file and the codebase, and tell it to attack the spec." Do the same with the plan.

Fix every critical, high and medium finding, then continue. Run the gate twice: once on the spec, once on the plan, before the tests and the code.

## Hosts

Verified in this case: Claude Code with `@AGENTS.md`. GitHub Copilot, Codex, Cursor, Kiro: per their docs, not tested here.

What the vendors' documentation says (read on 2026-11-01), so you know where the skills go:

| Host | Reads `AGENTS.md` | Reads skills from |
|---|---|---|
| Claude Code | Through the `@AGENTS.md` import in `CLAUDE.md` (recent versions also read `AGENTS.md` alone when there is no `CLAUDE.md`) | `.claude/skills` |
| GitHub Copilot | Yes | `.claude/skills` (also `.github/skills`, `.agents/skills`) |
| Cursor | Yes | `.claude/skills` (also `.agents/skills`, `.cursor/skills`) |
| Codex | Yes | `.agents/skills` |
| Kiro | Yes | `.kiro/skills`; custom agents load skills only through a `skill://` entry in `resources` |

The skills installer of step 5 knows these locations: pick your agent when it asks, or name it, for example `npx skills add alexandreafc/o11-rite-kit -a codex`. The official skill of step 3 installs for Claude Code only; for another host, copy its folder by hand as the OutSystems repository explains.

## Without Node

Clone this repository next to your project and copy the two skill folders by hand:

```
git clone https://github.com/alexandreafc/o11-rite-kit.git
mkdir -p <project>/.claude/skills
cp -R o11-rite-kit/skills/outsystems-mcp-pitfalls o11-rite-kit/skills/o11-rite-setup <project>/.claude/skills/
```

Then continue at step 6.

## Updating and removing

```
npx skills update
npx skills remove outsystems-mcp-pitfalls o11-rite-setup
```

Removing the skills leaves `AGENTS.md`, `CLAUDE.md` and your lessons log in place.

## The skill is a snapshot

This skill is a snapshot taken on 2026-11-01. The lessons log it came from keeps growing, and not every lesson is in the skill yet: keep your own log and read it before planning.
