# Rules for building in OutSystems 11 through the Service Studio MCP

Follow these seven rules in every session. Each one exists because skipping it cost real rounds.

1. **Load the skills first.** Before any brainstorming, plan or change through the MCP, load `outsystems-mcp-pitfalls` and the official `servicestudio-mcp-oml` skill. Load them again whenever something fails in a way the compiler did not warn about.
2. **Read the lessons the skill has not absorbed.** Open `docs/outsystems/lessons-log.md` and read every entry whose Skill field says "not in any skill yet" or "partial", before you plan. If the file does not exist, create it from `lessons-log.template.md` (in the `assets` folder of the `o11-flow-setup` skill). Add an entry whenever something costs you a round.
3. **Signatures first.** Publish (with the user's go-ahead) empty shells (action, structure and exception signatures) before any body. Everything else is written against those signatures.
4. **Manage Dependencies in one batch, once per task.** List every dependency the task needs and ask the user to tick them all in a single pass. Then, after merging any open chain, run `omlRefreshReferences` in each consumer.
5. **Test first, against the signatures.** Write the tests on the shells, publish (with the user's go-ahead), and confirm they fail for the right reason. Then implement, republish (with the user's go-ahead), and confirm they pass.
6. **Generate large Model API code.** Anything beyond a small probe (a few hundred characters) comes from scripts kept in git, one spec per payload; never hand-type a large lambda. How: SKILL.md section 4 of `outsystems-mcp-pitfalls`.
7. **Plan before you build, and let someone attack the plan.** Brainstorm, write the spec, then a plan whose tasks each carry their test (the Superpowers skills do this). Before any code, ask a second model, or a fresh subagent with no context from this chat, to try to break the spec and then the plan. Fix every critical, high and medium finding before you go on.
