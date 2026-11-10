---
name: outsystems-mcp-pitfalls
description: Verified pitfalls and working recipes for building or converting an app in OutSystems 11 (Reactive) through the Service Studio MCP — edit sessions, applyModelApiCode, omlMerge/omlPublish, multi-module setups (Core Services / UI / Tests), Manage Dependencies, Reactive screens and charts generated from code, theme CSS, the REST test runner, test-first across modules, server-side access rules, handing large generated payloads to subagents, and keeping huge tool outputs out of context. Load it together with servicestudio-mcp-oml BEFORE planning or applying any Service Studio MCP change, before delegating MCP work to subagents, and again whenever something fails in a way the compiler did not warn about (publish blocked or denied, "OutSystems is not defined", chart repeating the first point, "No OML edit session is started", "Outdated Consumer" or "Potential Incompatible Consumer", merge refused, session token rejected, createSessionToken hanging, a payload truncated). Use it for any request such as converter/migrar um app para OutSystems, criar telas/blocos/gráficos Reactive por código, publicar pelo MCP, "deu erro no Service Studio", "o merge falhou", "dependências do módulo", "quem pode ver isso", even if the user never says "pitfall" or "lessons".
---

# OutSystems via Service Studio MCP — pitfalls that already cost us rounds

This skill is the delta on top of `servicestudio-mcp-oml` (which owns the Model API contract, the lambda wrapper
and the read tools). Everything here was hit for real while converting a React/Node app to OutSystems 11
Reactive, and each item says **why** it happens so you can recognise the same family of problem in new forms.
Items marked *(env)* depend on the user's environment: verify them once before relying on them.

Two lessons sit above all others:
- **"It compiled and saved" proves very little.** Several failures only show up at merge, at publish, in the
  browser, or for a role nobody logged in as. Plan a verification step for each, and never report a screen as
  done before it has loaded in the browser with a clean console.
- **A payload an agent typed is not the payload the generator produced.** The tool takes code inline only, so
  every apply is a transcription. Verify what landed in the model (read-back), not what you meant to send.

## 1. Preflight (do once per session, before the first write)

1. **Token.** `createSessionToken` opens an approval dialog inside Service Studio and the call blocks until the
   user answers: it moves to the background after 120 s and fails after 300 s with no other signal. Tell the user
   an approval is coming before you call. If it times out, retry at most twice, then ask whether they are at the
   machine with Studio open and no modal dialog in front (three silent attempts were lost that way). Pass
   `sessionToken` as a **top-level** argument on every call, including `omlPublish`, `omlRefreshReferences` and
   `getRoleExceptions`. A reconnect of the MCP client keeps the token; a Studio restart kills it (-32002), although the
   official skill says to reuse it: after a reconnect try the old token first, and ask for a new one only if rejected.
2. Tell the user once that the write tools are a Beta Feature (the servicestudio-mcp-oml skill requires it).
3. Check what the user is doing in Studio. Do not edit a module they have open for Manage Dependencies or any
   manual step; an open edit session of yours on that module conflicts with theirs. End it first.
4. Ask for **every manual step in one batch, early**: dependencies to tick, logins, modules to create, and
   **permission to publish**. Publishing has two gates: Studio's MCP write-permission dialog, and the agent
   harness's own permission for the `omlPublish` tool (a harness may classify it as a production deploy and deny
   it). Dependencies requested piecemeal sat pending for a whole phase. If a publish is denied, stop and ask: never
   route around a denial.
5. If the user announces a demo or any live use of the environment, freeze writes (no session start, apply, merge
   or publish on any module) until they say it is over. Reads (the test runner, git, docs) are fine.

## 2. The edit/publish loop (the order matters)

1. `startOmlEditSession {eSpaceName}` — required before `applyModelApiCode`; not in the older skill.
2. Probe what is unproven with a **small** throw-probe first (a few hundred characters that exercise only the risky
   members), before any large payload. One 2K probe settled three unproven members that would otherwise have
   cost whole 70K transcriptions.
3. `applyModelApiCode`, one or more. After **every** call read `validationMessages` for `type: "Error"`, probes
   included: a probe answered `PROBE:ok` while the model held 33 errors. Keep the last **non-empty**
   `mutatedOmlPath`; a probe returns `""` and must not replace it.
4. `omlMerge` with that path. It may take more than 2 minutes and move to the background: wait for the
   notification instead of re-calling.
5. `omlPublish` (top-level token). It ends the session.
6. **`startOmlEditSession` again before the next edit.** Write this step into every call list you propose or
   hand to an agent: in tests, agents recited merge and publish and forgot it.

- `omlMerge` is documented by the tool itself as NOT ending the session. One early observation suggested the
  opposite, so do not rely on either: if `applyModelApiCode` says "No OML edit session is started", start again.
- `omlRefreshReferences` **drops an unmerged chain**: merge first, then refresh.
- `endOmlEditSession` throws away unmerged edits, and answers `discardedChanges: true` even right after a full merge
  (that flag is about the working copy). After ending, check the live module with `getServerAction`/`getScreen`.
- A `startOmlEditSession` that times out at 300 s may have started anyway; retrying says "already started".
- A publish also kills the browser login of the test user, so ask them to log in again before UI checks.
- **Studio runs one operation at a time.** Never send publish/refresh/merge calls in a parallel batch: one came back
  `status: blocked` ("Service Studio is busy — a dialog may be open") and two stalled. If a call stalls for 300 s or
  says "busy", ask the user to look for an open dialog in Studio (a crash-report dialog that asks to send feedback
  blocked every MCP call here) before retrying, and treat a timed-out publish as unknown: republishing the same state
  is harmless.
- `omlPublish` "blocked / verification errors" is generic. The real reason is only visible in Service Studio:
  ask the user to read it rather than guessing.
- Never set `theme.IconLibrary`. It stamps a feature marker and `omlMerge` then refuses with "Update Service
  Studio to merge the module… Theme Icon Library not supported", reported only as `merged:false … See the log`.
  Leaving it null raises an `InvalidIconLibrary` **Error** in validationMessages after any stylesheet change: that
  one Error is harmless (merge and publish succeed); it is the only Error that may be accepted, and only when
  `LC_ALL=C grep -a -c 'IconLibrary' <out.oml>` is 0. An agent told "no Error before merge" will stop on it, so say so
  in its brief.
- An Error owned by a screen that a later batch of the same chain rewrites can be transient (a block gained a
  mandatory event; the old screen did not handle it yet). Judge the Error list at the end of the chain, not per step.
- To change one action of a large generated batch, **rebuild that action in place**. Re-applying a batch that
  deletes and re-creates the action orphans every call node that pointed at it.
- Let each generator check the shapes it depends on (parameter names in order, exact message texts owned by the
  tests) and refuse to run when they drift, before it changes anything.

## 3. Multi-module work (Core Services / UI / Tests)

- A module can only use another module's elements after the **user** ticks them in *Manage Dependencies*
  (Ctrl+Q, pick the producer, tick, Apply). You cannot do this through the MCP. After they confirm, run
  `omlRefreshReferences` in the consumer (merge any open chain first).
- Check what a consumer sees with a tiny probe that lists
  `eSpace.References.Named("<Producer>").ServerActions` names. `getActionNames` on **any** consumer module lists every
  referenced action, platform built-ins included (~12K tokens). Once, ticked elements were invisible to the MCP until
  Studio restarted: re-read after a restart before asking the user to repeat the step.
- Publishing the producer reports "Potential Incompatible Consumer" and leaves consumers "Outdated". For each
  consumer: `omlRefreshReferences`, then `omlPublish` (no edit session needed). Do the UI right after the producer to
  keep the inconsistent window short, then the Tests.
- Referenced entities are read-only for the consumer (no CRUD from the Tests module): get fixtures from a dataset
  loader in the producer.
- The Model API cannot reference the producer's **user exceptions** from a consumer (`IReference` has no exception
  collection). Catch `AllExceptions` in the consumer and decide by state; see `references/access-and-security.md`.
- Static-entity records of referenced modules are not visible to the sidecar (`OutSystemsUI` `MessageStatus.Info`
  "not found"): avoid such expressions, use your own CSS/JS.
- Shells first: publish empty action/structure/exception **signatures** in the producer so the user ticks the
  dependencies once, then fill the bodies behind them. A visibility decision (`Public = false`) must also go into the
  generator that creates the shell, or the next from-scratch build publishes it again; search every module for uses
  before hiding an element.

## 4. Reactive UI generated from code

Generate the UI from a small DSL/spec layer instead of hand-built lambdas: specs are the source of truth, a
generator emits the `applyModelApiCode` payload, and it updates screens/blocks **in place** so reruns are
idempotent. Wrap each spec in try/catch and rethrow `IN <spec>: <inner message>`, because sandbox exceptions
otherwise hide the cause ("target of an invocation"). Full list of widget/flow facts: `references/reactive-ui.md`.
The ones that bit hardest:

- **`List mapTo { X: List.Current.F }` repeats the FIRST item for every point** (it compiles and publishes!).
  The other `mapTo` forms are Invalid Expression and block publish. Build chart points with a For Each +
  Assign to a `DataPoint` local + `ListAppend`. A data action flow cannot hold the ListAppend, so fill the list in
  a screen action wired to the data action's `OnAfterFetch` (blocks fill a local list in `OnParams`).
- **Blocks whose client actions call OutSystems UI JS must declare `RequiredScripts` for `OutSystemsUI`**,
  otherwise a cold load throws "OutSystems is not defined" while a warm navigation works fine.
- **One spec per payload.** Each payload repeats the ~19K-character interpreter prelude; three specs in one 72K
  payload came back truncated.
- Client actions cannot hold Destination nodes; navigation chains live in screen actions.
- A placeholder's default content is evaluated in every screen's scope: never reference block locals there.
- Reserved/colliding names silently rename or break expressions: screen `Settings` -> `Settings2`; a node named
  `Roles` makes expressions fail with "Can't identify 'View' element"; duplicate local/input/node names become
  `X2`/`Add4` and break argument binding. Choose neutral, distinct names.
- Names are cut at 28 characters (attributes and index names) without an error. Read `.Name` back.
- An in-place generator does not delete inputs a spec no longer has: add an explicit cleanup step after the
  screens that pass them.
- Before using a Model API member you only assume exists, grep the official skill's `docs/*.Generated.cs`: one
  invented member in a shared interpreter template took down every batch, including those that never used it.
- Decimal values shown in the UI: wrap them in `Round(...)`; chart values are Decimal, so convert counts with `IntegerToDecimal(...)`.

## 5. Delegating MCP work to subagents

Generated payloads are 10–90K characters and have to be typed into the call, so cheap mechanical agents usually do
the applying. What held up:

- **Agents probe, apply, read back, validate and merge; the orchestrating session publishes** and runs the suite.
  The user's permission to publish lives in the main conversation: two subagent publishes were denied while the
  main session published fine. A sentence in an agent's prompt saying "the user allowed it" is not a grant.
- **One agent per module at a time.** Applies chain through the module's session pointer; two agents applying to
  the same module interleave their chains. Different modules in parallel are fine.
- **Payloads travel unchanged.** The agent generates to a file and passes the generator output as `input`, with
  `sessionToken` as the only other argument. No retyping, shortening or hand fixes: a retyped 35K payload changed one
  identifier, and a 250-character literal lost 12 characters. Build long literals in code (`new string('x', 250)`).
- **Verify by read-back fingerprint** (`references/readback.md`): a throw-probe reads every node of the rebuilt
  actions back, and a script compares those atoms with the ones the generator produced. Without it a drift costs a
  full cycle (merge, three publishes, the suite).
- **If a call comes back truncated, or the agent's response is stopped by a safety classifier: stop and report**
  the spec, its size and the exact message. Never resend the content reworded, split differently, encoded, or by
  another route; the orchestrator and the user decide.
- Brief each agent with the token, the exact module scope, what is already proven, the warnings that are accepted,
  the stop conditions, and ask for the lessons (symptom, cause, fix, cost) in its report.

## 6. Data model and logic

- Secret Site Properties may be unavailable *(env)*: `IsSecret = true` passes the sidecar and is blocked at
  publish ("Unavailable Feature"). Check before designing anything that stores keys or tokens.
- When the plan and the original app disagree, the original server code wins: read it before implementing
  formulas, role conditions and field visibility (three plan rules here differed from the source).
- A unique index on a single FK attribute duplicates the automatic `AutoIndex_<Attr>` (`InvalidEntityIndex_DupIndexes`):
  delete the auto index in the same lambda. Entities with many/large attributes want
  `UpdateBehavior = Optimized`. Static records accept literals only (`#2026-09-24#`, not `NewDate(...)`).
- `Records`/`Indexes` enumerate in arbitrary order: compare as sets. `OfType<IStaticEntity>()` matches every
  entity: use `EntityKind.ToString()`.
- Expressions have no regex: validate (an e-mail, say) by position in stages, with every `Substr` behind its own
  `If` so it never gets a negative length. There is no `NullTime()`: use `TextToTime("00:00:00")`.
- `Length`/`Substr` count an emoji as 1 character, `nvarchar` counts 2: truncate with a 4-character margin.
- When a write keeps an invariant ("exactly one Lead"), re-check it after every shortcut you add: skipping a step
  for the already-Lead case left two Leads in a corrupt project.
- REST: `DefaultValueBehavior.Send` is what makes zeros/empties appear in the JSON; `Aggregate.Count` is Long Integer.
- `IStartNode`/`IEndNode` are ambiguous when `OutSystems.Model.Logic.Nodes` is imported: qualify them.
  `imports` accepts `OutSystems.Model.*` only.

## 7. Tests and verification

- Test-first still works across modules: write the tests against the **shell** signatures, publish, and confirm
  they FAIL for the right reason (value mismatch, exception not raised, wrong exception). A compile or runtime error
  inside a test is a defect of the test. Then implement, republish, confirm PASS.
- When a rule changes behaviour, earlier tests that encoded the old behaviour break too: list them and rebuild them
  in the same step as the new tests (a Phase 1 test still expected a Viewer to see every project).
- Expose a token-protected REST test runner (`GET …/TestRunnerAPI/Run?Suite=All`, header `X-Test-Token`) so the
  agent can run the whole suite without Studio. Track **per-suite** counts, not only the total: a moved assert
  otherwise reads as a loss.
- The runner is anonymous, so rules of the current user get a pure `...For` variant that takes the actor. If that
  variant is public, bind it to the session: with a signed-in user the actor must be that user (else NotAuthorized);
  only without a session (runner, timers) is the actor believed. Otherwise any consumer module can act as anyone. The
  runner never runs the signed-in branch: add an offline structural check of the generated flow and prove it fails
  on a mutated copy.
- Offline checks that pay off: syntax-check the generated C# with the local dotnet SDK (wrap it as
  `Action<dynamic>`), and run your flow DSL through a small interpreter on the real test definitions, then
  mutation-test it.
- Verify in the real browser: load every screen by URL, read the console filtered to errors, and read chart
  series values (not just that a chart renders). Walk the access walkthrough **as each role** (the user logs in);
  make sure the dataset has every role it needs. Preview CSS by injecting a `<style>` first, publish after.
- Regenerate and re-apply the theme CSS after a CSS change (the OSUI base CSS overrides link colours and the theme
  MaxWidth caps `.main-content`); when only a new fragment was added, append it idempotently instead of resending a
  90K stylesheet.

## 8. Access control is the server's job

- Hiding a tab or a button is not access control. Each read model decides what it returns, **field by field**,
  from the original app's server code, not from the screen table. A secret split into parts (an e-mail and a token
  hint) needs a visibility rule for every part.
- For every role, state which calls the server refuses and which the UI only hides; treat an ungated read as a
  blocking server task, not a UI detail.
- UI patterns that held up (access state at load, writes that can remove the actor's own access, one
  `AllExceptions` handler and what it swallows, double submits): `references/access-and-security.md`.

## 9. Context and quota hygiene

- Huge outputs: `getTheme`, `getValidationMessages` (~40 warnings), the `applyModelApiCode` result (it carries the
  warnings too), `getActionNames` on any consumer module, browser `list_console_messages` with stack traces. Run them
  through a sandbox/script and surface only the derived answer. Tool results over ~30 KB are saved to a file by the
  harness: parse that file instead of pasting it again. To analyse a model read-only (indexes, aggregates, SQL
  usage) one throw-probe per module beats `getDataModel`: `references/read-only-analysis.md`.
- Shell traps that cost rounds (zsh): `cmd > file | head` writes to both the file and the pipe, so redirect first and
  read after; an unquoted glob that matches nothing aborts the whole command (`--include='*.mjs'`); `$REF:path`
  fails, write `${REF}:path`. Importing a generator module can print its lambda: silence the console during import.
- Hooks may redirect `curl`; use a small Node script for HTTP.

## 10. Safety and collaboration rules that held up

- Credentials: never type a password or accept a certificate warning in the browser. The user logs in (and
  accepts the cert) in the shared tab; you navigate afterwards. Keep tokens in a git-ignored `.env`-style file
  and never print or commit them.
- Do not probe the network/TLS of the environment without asking.
- Gate the work: get **visual approval** of all screens (with captures and a list of known simplifications)
  before building functional behaviour, so design rework is not mixed with logic.
- Before claiming something does not exist, check the remote branch/PRs, not only the local tree.

## When something fails and it is not listed here

Probe, do not re-read: `eSpace => { throw new Exception("PROBE:ok"); }` proves the session is healthy and returns
text; then bisect one risky member per call. Record the new finding in `references/` with the date and the
symptom so the next session does not repeat it.
