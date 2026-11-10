# Access rules across CS, UI and an anonymous test runner

Verified 2026-10-27 while implementing project access, project people and user roles. Read it before writing any
rule that depends on who the user is, and before the UI of such rules.

## Server side
- **Pure variant + wrapper.** The REST test runner has no session, so every rule of the current user exists twice:
  `<Rule>For(ActorEmail, ActorAppRoleId, ...)` holds the logic; `<Rule>(...)` only reads the current user's context
  (and Site Properties) and calls it. Tests call the pure variant; the browser walkthrough covers the wrappers.
- **Bind the pure variant to the session.** If it is public (it must be, for the Tests module to see it), any
  consumer module can pass `ActorAppRoleId = Admin`. First step of every write `...For`: if `GetUserId() <>
  NullIdentifier()`, require the actor to be the session's user (lower-cased e-mail, same app role, same bootstrap
  list), else `NotAuthorized`. Without a session (runner, timers) the actor is believed; that is acceptable only while
  no anonymous endpoint can reach the action (here the only exposed REST APIs are token-protected).
- **The signed-in branch is dead code for the runner.** Guard it with an offline structural check of the generated
  flow (does every write `...For` open with the binding?), and prove the check fails on a mutated copy.
- **Order of checks in a write:** the target exists and is visible to the actor (else `ProjectNotFound`, so a
  non-member cannot tell "missing" from "forbidden"), then permission (`NotAuthorized`), then input (`InvalidEmail`),
  then the data rule (`RuleViolation`, with a message that says which).
- **Read models gate field by field**, from the original server code: here people lists and credential fragments
  went to everyone who could view a project, while the source stripped them for non-editors. A secret split into
  parts needs a rule per part. Audit every public read for cross-project or cross-user data (logs without a project,
  user-role lists, AI configuration) and gate it the same way (no session = system).

## UI side
- **Hiding is not access control.** For each role write down which calls the server refuses and which the UI only
  hides. An ungated read is a server task that blocks closing the feature.
- **Access state at load:** one resolve action (here `Project_Resolve`) returns `HasAccess`; a denied explicit id
  becomes data project 0 and the screen shows the "not found or no access" slate. The layout must not read data with
  the denied id either, and the header needs its own shell project (the remembered one if visible, else the first
  visible one), or the project selector is dead on the slate.
- **After load**, a read model can still raise (access removed while the screen is open); it ends in the module's
  `OnException` (here: a toast with the server message; `SecurityException` goes to login).
- **Writes:** the consumer cannot reference the producer's user exceptions, so use one `AllExceptions` handler with
  `LogError = false` and show the exception message (never a stack). That handler also swallows `SecurityException`
  and `CommunicationException`: start the reaction with a server call that needs the session, so an expired session
  is raised again outside the handler and reaches `OnException`.
- **A write can remove the actor's own access** (an EM removing themselves). After every write, done or refused,
  re-resolve through the same verified path and switch to the slate if access is gone. Refresh only when the state
  really changed: an unconditional refresh after a refusal remounted the whole screen and reset its tabs.
- **Double submit on create-if-not-exists:** move the typed text to a pending local and empty the field at the
  start, so the existing enabling condition disables the button; give the text back if the write was refused. Avoid
  a busy flag that an unexpected exception can leave set.
- **Walkthrough:** a table role × screen × visible/editable compared with the server matrix, walked as each role by
  the user (the agent never types passwords). Check the dataset has every role the walkthrough needs, with logins.
