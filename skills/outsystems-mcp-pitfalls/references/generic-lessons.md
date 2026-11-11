# Generic lessons shipped with the kit

Lessons from real projects that hold in any OutSystems 11 project built through the Service Studio MCP and are
not folded into `SKILL.md` yet. Before you plan, read the ones for the areas you will touch. From the project root,
`node <this skill's folder>/scripts/lessons.mjs pending --area "ui,charts"` lists them and `show G-001` prints one.
Run from a folder outside the project, such as a user-level skills folder, the script does not find the project log
and lists only these lessons.

This file belongs to the kit: an update replaces it. Do not edit it in a project. Your own lessons go to the
project log, `docs/outsystems/lessons-log.md`. A `G` id is never renumbered or used again: when a lesson is folded
into `SKILL.md` its entry leaves this file, so the ids can have gaps.

Snapshot: 2026-11-11.

## Entry format

```
### G-NNN · YYYY-MM-DD · area · title
- **Symptom:** ...
- **Cause:** ...
- **Resolution:** ...
- **Origin:** free text, optional
```

`area` is one of: session, edit-loop, merge-publish, dependencies, ui, charts, theme, model, logic, tests,
environment, quota, collaboration, security, planning, review.

## Entries

### G-001 · 2026-10-27 · edit-loop · Syntax-check a generated C# lambda offline with the dotnet SDK's Roslyn compiler
- **Symptom:** A typo in a generated C# lambda is found only when `applyModelApiCode` rejects it, which costs a full round and about 15K tokens of warnings in the result.
- **Cause:** The Model API assemblies are not available offline, so the lambda cannot be compiled the normal way before it is sent.
- **Resolution:** Wrap the lambda as `Action<dynamic> F = <code>;` in a class, as `SKILL.md` section 7 says, and compile it with the Roslyn compiler that ships with the dotnet SDK (`dotnet <sdk>/Roslyn/bincore/csc.dll`, against the SDK's reference pack). A clean payload reports only semantic families: CS0246 (unknown Model API types), CS1977 (lambdas on a dynamic receiver) and CS0103; any other family, such as CS1525 or CS1026, is a real syntax error.
- **Origin:** case log L-086

### G-002 · 2026-10-27 · edit-loop · Read the live module back before an apply: earlier batches may not be there
- **Symptom:** The last batch of a multi-batch change is refused on apply: its payload checks for a Site Property it depends on, finds none and throws before it changes anything. The read-back fingerprints of the live actions equal the previous stage's expected ones, and many differ from what the current generators produce.
- **Cause:** Earlier stages changed the generators in the repository and nobody applied those changes, while the apply task described only the last batch and said the earlier ones were live. A change in a generator reaches the module only when it is applied.
- **Resolution:** Before every apply, read the live state back (the Site Property names through `runQuery`, and a throw-probe that returns the fingerprint of every action the generators touch) and diff it against what the current generators expect. The throw-probe saves nothing, so it is safe inside an open edit session (see `references/readback.md`). An apply task for a multi-batch change lists the whole ordered sequence of batches, not only the last one.
- **Origin:** case log L-128, L-130

### G-003 · 2026-10-28 · edit-loop · A check by exact name misses the suffixed copy that a name clash creates
- **Symptom:** A generator that re-creates a server action without deleting the old one leaves two actions in the module: the old one and a copy with a digit appended. A check that counts actions by their exact name still passes, and every caller keeps running the old action.
- **Cause:** The Model API never refuses a taken name: it appends a numeric suffix, without an error (the official servicestudio-mcp-oml skill, "Silent renames"). A count by exact name cannot see the copy.
- **Resolution:** Before the merge, probe for actions whose name is a known name followed by a digit, and stop when the probe finds one. A generator that re-creates elements deletes the old ones first and rebuilds their callers in the same edit session, because a re-created action orphans the call nodes of the old one (`SKILL.md` section 2).
- **Origin:** case log L-147

### G-004 · 2026-10-22 · ui · A dropdown fires OnChange when code assigns its variable or it falls back to the first option
- **Symptom:** The `OnChange` handler of a dropdown runs although the user picked nothing.
- **Cause:** The dropdown fires `OnChange` when a block's `OnParams` assigns its bound variable. It also falls back to the first option, and fires, while there is no current record yet, for example on a screen that creates a new one.
- **Resolution:** Use the guard that `references/reactive-ui.md` gives: act only when the selected value differs from the current one and the current one is greater than 0 (a real record). Check in the browser that the selector navigates only when the user picks another option. On a screen with no current record, such as a no-access state, that guard leaves the selector dead: give the selector a current value of its own there (`references/access-and-security.md`, access state at load).
- **Origin:** case log L-051; L-107 for the dead selector.

### G-005 · 2026-10-28 · ui · Access lost while a screen is open leaves a fetch's widgets on Loading, with only a toast
- **Symptom:** A user whose access is removed while a screen is open switches to another tab of it: a toast shows the server's "not found or no access" message, and the tab stays on "Loading...". The screen never switches to its no-access state.
- **Cause:** The tab's data action raises the access exception. Only the write flows catch exceptions in a handler that re-resolves access and switches to the no-access state; a fetch runs in no such flow, so its exception ends in the module's `OnException`, which only shows the message.
- **Resolution:** Unresolved. Proposed, not yet verified: in the module's `OnException`, recognise the access exception, re-resolve access and switch the screen to its no-access state.
- **Origin:** case log L-141

### G-006 · 2026-10-28 · ui · An expired session shows the platform's role message in the error band before Login
- **Symptom:** After the session expires, a write whose handler shows the exception message flashes a band with platform text that names the screen's role (of the form "<Role> role required"), and only then goes to Login.
- **Cause:** The platform rejects every server call of an expired session with a security exception whose message names the role the screen requires. An `AllExceptions` handler in the write flow catches that exception too and, when it shows any message, displays it in the band. The handler's reaction then starts with a server call that needs the session: that call fails again outside the handler, and only its exception reaches the module's `OnException`, which navigates to Login.
- **Resolution:** Unresolved. Proposed, not yet verified: add a `SecurityException` handler beside `AllExceptions` in the write flows that goes straight to Login, or shows a short "session expired, sign in again" message, so the platform text never reaches the user.
- **Origin:** case log L-143; L-103 for the reaction that reaches `OnException`.

### G-007 · 2026-10-28 · ui · Patch small UI changes in place instead of regenerating whole screens
- **Symptom:** Three small changes spread over four screens and one block would mean re-applying about 190K characters of generated code through the spec generator.
- **Cause:** The generator rebuilds a whole screen or block per spec, so a small change costs the whole payload, and retyping that volume raises the risk of silent drift and runs into the payload limits.
- **Resolution:** Apply a small in-place patch of a few thousand characters: find the widgets with `GetAllDescendantsOfType<ITextWidget>()` by their text, change them (swap a Text for an Expression in the same parent, say) and read everything back. Change the specs first and take the patch's values from them, so a rebuild from scratch gives the same result. A widget inside a Container has the container's content (`IContent`) as `Parent`, not the `IContainer`, so code that expects an `IContainer` parent fails.
- **Origin:** case log L-149

### G-008 · 2026-10-27 · theme · A visited link styled as a primary button shows primary text on a primary background
- **Symptom:** A link styled as a primary button (`btn-primary`) renders as an empty box in the primary colour. `getComputedStyle` reports white text on that background, the element is on top, and its text lies inside the box.
- **Cause:** The OutSystems UI base CSS has `a, a:visited { color: var(--color-primary) }`. For a visited link `a:visited` (specificity 0,1,1) beats `.btn-primary` (0,1,0), and browsers hide `:visited` styles from `getComputedStyle` for privacy, so the computed value looks right.
- **Resolution:** Unresolved. Proposed, not yet verified: append a fragment to the theme CSS that sets the button's text colour in the visited state too, such as `.btn-primary, .btn-primary:visited { color: var(--color-neutral-0); }`. Check `:hover`, `:focus` and `:active` in the browser as well: link buttons of the same project needed the override in those states too, because the base CSS colours `a:hover` with the primary colour. When a link looks empty but its computed style is fine, suspect `:visited`.
- **Origin:** case log L-136; the hover and focus states come from the theme CSS of the same project.

### G-009 · 2026-10-28 · logic · JavaScript toFixed and OutSystems Round disagree on rounding ties
- **Symptom:** A parity test between a JavaScript original and its OutSystems port fails on values that sit exactly on a rounding boundary: 11.95 rounded to one decimal is 11.9 in JavaScript and 12.0 in OutSystems. The gap is a full rounding step, so a tolerance of half a step does not absorb it, and the median of an even number of one-decimal values lands on such a tie about half the time.
- **Cause:** `toFixed` rounds the binary value of the double (11.95 is stored just below 11.95), while `Round` rounds the decimal value, half to even in client and server logic. The `Round` of an Aggregate rounds half away from zero on SQL Server and Oracle (half up on iDB2), so the same function gives different results depending on where it runs.
- **Resolution:** Use `Round` in logic at every place the original calls `toFixed`, also on values it then sums, averages or sorts, and never the `Round` of an Aggregate or an SQL query. Make the reference implementation that produces the expected values round an exact decimal tie half to even, as `Round` does in logic.
- **Origin:** case log L-034, L-155, L-158. The later entries correct the earliest, which advised rounding only once at the output and avoiding ties in the sample data; L-158 names the element meant by "never round in an aggregate". The tie rules of `Round` were checked against the public Math functions reference.

### G-010 · 2026-10-27 · tests · Prove a static check of generated flows by mutating a copy of the generator directory
- **Symptom:** A static check that imports the flow generator modules cannot be shown to catch a broken flow without editing the real generator files.
- **Cause:** The check reads the real generator modules next to it, and mutating a file in the repository to test the check is risky and easy to forget to revert.
- **Resolution:** Copy the whole generator directory to a temporary folder, apply one string replacement to the copy of the module under test (fail the run if it did not apply exactly once), run the copy's check and require a failing exit code. Repeat for each mutation, the subtle ones included (a wrong flag, a dropped session test, an extra read outside a branch): the check is proven only when every mutation is caught.
- **Origin:** case log L-116

### G-011 · 2026-10-27 · tests · Walk each role in its own isolated browser context
- **Symptom:** A walkthrough that checks access for several roles in one browser needs a logout and a new login, typed by the user, at every change of role, and cannot cover steps that involve two roles at once.
- **Cause:** All tabs of one browser context share the session cookie.
- **Resolution:** Open one tab per role, each in its own isolated browser context (with the Chrome DevTools MCP: `new_page` with `isolatedContext` set to a name per role). The user logs in once in each, and the agent drives the tabs side by side, which also makes the two-window steps possible.
- **Origin:** case log L-138

### G-012 · 2026-10-27 · tests · Reactive inputs ignore a value set by script unless the native setter is used
- **Symptom:** Setting `select.value` or `input.value` from a script and dispatching `change` does not trigger the screen's `OnChange`: a selector wired to navigate does not navigate.
- **Cause:** Reactive web apps render with React, which tracks an input's value through its own property, and a plain assignment bypasses that tracker.
- **Resolution:** Call the native setter, `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v)` (`HTMLSelectElement.prototype` for a select), then dispatch a bubbling `input` event, and also `change` for a select.
- **Origin:** case log L-139

### G-013 · 2026-10-28 · tests · A green run with fewer assertions is a regression
- **Symptom:** After the test runner is rebuilt from its generator with an exclude option, as the generator's documentation says, the suite is green but one suite has fewer assertions than in the previous run.
- **Cause:** The exclude option was a leftover from a time when one test could not compile, and the documentation that recommended it was never updated.
- **Resolution:** Rebuild the runner without the exclude and correct the documentation. `SKILL.md` section 7 says to track per-suite counts; after any rebuild of the runner, compare them with the previous run, not only the failures: a suite that lost assertions in a green run is a regression.
- **Origin:** case log L-146

### G-014 · 2026-10-28 · tests · In a test that cannot roll back, put the write the old code refuses first
- **Symptom:** In a test-first test that writes data in several steps, the old code refuses a later step. The red run would keep the earlier writes, and a later test that checks a starting count of the same data would then fail too.
- **Cause:** The test catches `AllExceptions` in a handler with Abort Transaction set to No, so a failing run keeps whatever it wrote before the failing step.
- **Resolution:** Order the steps so that the write the old code refuses comes first: the red run then fails before it changes anything. Do the other writes after it and undo them at the end of the test.
- **Origin:** case log L-148

### G-015 · 2026-10-27 · environment · zsh does not word-split an unquoted variable, so a flag list becomes one argument
- **Symptom:** A loop such as `for v in "" "--flag 1"; do cmd $v; done` passes `--flag 1` to the command as one argument in zsh, so every variant runs with the same effective arguments and silently prints the same output.
- **Cause:** zsh does not word-split the value of an unquoted variable, unlike bash.
- **Resolution:** Call each variant explicitly, or expand the variable with `${=var}`. Print something that differs per variant (an output length, a flag echoed back) so a silently ignored flag shows.
- **Origin:** case log L-080

### G-016 · 2026-10-27 · collaboration · Keep the read-back probe in the repository beside the expected fingerprints
- **Symptom:** The folder that holds the expected and the observed fingerprints lacks the C# probe that produced the observed ones, so the next agent has to dig it out of a 2 MB subagent transcript before it can verify anything.
- **Cause:** The probe was typed straight into the `applyModelApiCode` call, and only the expected side was saved.
- **Resolution:** Save the probe lambda as a file next to the script that produces the expected fingerprints and commit both, so the two sides of the comparison live together.
- **Origin:** case log L-129

### G-017 · 2026-10-27 · security · Decide the no-session case of every gate in one helper, behind an explicit switch
- **Symptom:** A read gate written as `Not Context.<Flag>` looks right but refuses the anonymous REST test runner and the timers. The opposite rule, "no session means system", gives full access to any anonymous caller that reaches the action: every gate passes, and a public pure `...For` variant believes whatever actor it is given.
- **Cause:** Without a session `GetUserId()` equals `NullIdentifier()` and a current-user context action returns every flag as False. "No session means system" was justified by listing the modules' REST APIs, which are token-protected, but the data actions of blocks can call a producer action too: they have no Roles in the generated model, only Public, and whether an anonymous request gets through them was never verified.
- **Resolution:** Build every gate, and the session binding of every pure `...For` variant, from one helper. With a session the gate checks the flag and the binding requires the actor to be the session's user; without one both allow only while an explicit switch is on (a Site Property that is True in development and in the environment that runs the tests, False before promotion). Cover the helper with the offline guard in both values of the switch, and probe the block endpoints with a request that carries no cookie before claiming that no anonymous endpoint reaches an action. `SKILL.md` section 7 and `references/access-and-security.md` (server side) state the short form of this rule: the actor is believed without a session only while the switch is on.
- **Origin:** case log L-117, L-126, L-128. L-126 qualifies L-117: no session counts as the system only while the switch is on. L-128 shows the pure variants rebuilt with the same switch, which qualifies L-075, where the actor was believed without a session.

### G-018 · 2026-10-27 · security · Choose the denial of a read model per caller: raise, or blank the sensitive fields
- **Symptom:** Closing read models to unauthorised roles needs a different denial for each: one view is reachable only from a restricted tab, another is also read by every role for a harmless field, a third is called by the layout on every page. One rule applied to all three breaks a screen.
- **Cause:** The right denial depends on who calls the read model, and the callers differ from view to view.
- **Resolution:** List the callers of each read model first. Raise a not-authorised exception where every caller needs the right, and blank only the sensitive fields where several roles legitimately read the view. A routine caller, such as a layout that reads the view on every page, calls it only when the user has the right, so the view can raise for everyone else. Do not answer a refused caller with an empty view: it looks like data, as an empty log reads as "nothing logged". Put the gate before the reads, so a refused call skips the query instead of filtering it down to nothing.
- **Origin:** case log L-118, L-123. The later entry corrects the earlier one, which returned the view's defaults to the routine caller: the view now raises, and the layout checks the right before it calls.

### G-019 · 2026-10-27 · security · Closing one read path is a half-fix when a sibling read model returns the same data
- **Symptom:** An action that lists the history of an entity is the obvious gap and gets gated, but another read model that was left alone still returns fields of the latest record, such as the e-mail address of whoever triggered it and its error message.
- **Cause:** Two read models expose overlapping fields of the same entity under different gates, so gating one by action name leaves the data readable through the other.
- **Resolution:** Audit by entity and by field, not by action name. Close fully the entities that have a single read path, and gather the remaining overlapping reads into one change that names the exact right each must check.
- **Origin:** case log L-119

### G-020 · 2026-10-27 · security · A read-model gate does nothing for a public entity: consumers can aggregate it directly
- **Symptom:** An audit finds every public read action of the producer behind its gate, yet most of the sensitive entities are public and exposed read-only (`ExposeReadOnly`).
- **Cause:** The entities were exposed so the Tests and UI modules could read them, and a gate inside a read model does nothing against a consumer module that aggregates the entity itself.
- **Resolution:** State the boundary in the module notes: the gates of the read models do not cover the entities that consumers can aggregate themselves. Keep the consumers' own aggregates to reference data such as static entities. Options to consider: a lint rule on the consumers' specs that enforces this, or making the sensitive entities private, so the read model is the only path.
- **Origin:** case log L-120

### G-021 · 2026-10-27 · security · Check a generated access gate by running its steps, not by matching its text
- **Symptom:** Ten mutations of a generated access gate left the offline guard green: a later assignment that sets the visibility flag back to True, a later raw assignment of a secret field, an SQL step or an aggregate before the gate, any extra step before the gate. The generators did not call the guard either.
- **Cause:** The guard matched fixed text at fixed positions and looked only at aggregate steps, so order, duplicates and a wrong flag were invisible to it, and nothing ran it before a payload was printed.
- **Resolution:** Write a small interpreter for the generator's step language (the one `SKILL.md` section 7 recommends) and run each gated flow as the system, as an anonymous caller, as an anonymous caller with a forged context and as each role, asserting what was read, written, called, raised and returned. Call the guard from the generator before it prints a payload, and commit a list of mutations that fails when a mutant survives or does not change the text it targets.
- **Origin:** case log L-124

### G-022 · 2026-10-27 · security · Mutants of an access guard must not be equivalent: forge the context and mutate every gate
- **Symptom:** Two mutants survive a mutation test of an offline access guard: one rewrites an anonymous-safe condition into an equivalent one, and one removes the signed-in term from only the first of two gates of the same flow.
- **Cause:** An anonymous context has every right flag False, so dropping the signed-in test changes nothing unless the context is forged; and when only one gate is mutated, the second gate (or another check of the flow) still denies the caller.
- **Resolution:** Add an actor that is anonymous but whose context claims to be an administrator, and make each mutation change every check of the flow at once. Treat each surviving mutant as a question: either it is equivalent, or the guard has a blind spot.
- **Origin:** case log L-125

### G-023 · 2026-10-27 · security · runQuery on Site Properties returns default values in clear text, tokens included
- **Symptom:** A read-back `runQuery` of the form `Root { SiteProperties { ... } }` that selects `DefaultValue` returns the default of every Site Property in clear text, tokens included, and the value lands in the agent's transcript.
- **Cause:** When the environment offers no Secret Site Properties, a token kept as a Site Property default lives in the model as plain text, so any model read that selects the default returns it.
- **Resolution:** Select only `Name`, `DataType` and `IsSecret` in Site Property queries, never `DefaultValue`. Treat a token whose value has appeared in a transcript as exposed, and rotate it before the module is promoted.
- **Origin:** case log L-132
