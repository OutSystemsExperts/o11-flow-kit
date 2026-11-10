# Read-back: proving what landed in the model

Verified 2026-10-27. Read this before delegating applies or after any apply whose payload an agent had to type.

## Why
`applyModelApiCode` takes the code inline, so an agent transcribes every payload. Two drifts happened in one day,
both plausible and both silent to the compiler: an identifier (`CopilotMessage.CopilotMessageId` instead of
`CopilotConversationId`, caught only because it was invalid) and a 250-character literal that arrived with 238. A
drift that stays valid is only caught by comparing what is in the model with what the generator emitted.

## Fingerprint recipe (server/client action flows)
1. After the real apply, send a throw-probe that walks every action you rebuilt and emits one "atom" per fact:
   - locals and parameters: name and type;
   - `IAssignNode.Assignments`: `Variable.Text = Value.Text`;
   - `IIfNode.Condition.Text`, the For Each list expression;
   - `IExecuteServerActionNode` (and client equivalents): node name, `Action.Name`, arguments sorted by
     `Parameter.Name` with `Value.Text`;
   - raise nodes: exception name (cast `Exception` to `OutSystems.Model.Logic.IUserException`; `IException` has no
     `Name`; compare `AllExceptions` by identity);
   - aggregates: max records (may be null), filters, sorts, joins, aggregated attributes.
   Sort the atoms ordinally (nodes enumerate in arbitrary order), hash them (FNV-1a 64 is enough) and return
   `name:count:hash` per action in the exception message.
2. A Node script derives the same atoms from the generated C# (or from the step literal the generator holds) and
   compares. Identical lists = verified. Normalise what Studio rewrites when it reads back: `Not` becomes `not`.
3. To find a drift, return the atoms of one action instead of its hash and diff them.

## Gotchas
- Expression text comes from `ToString()`: `"<text> [Value[ServiceStudio.Expressions.AbstractExpression]]"`. Cut at
  the first `" ["` (the suffix differs by property); `IExpression` has no `Length`.
- The sandbox rejects any `System` token (`System.Text.StringBuilder`) and reflection (`GetProperties`): build strings
  with `+` and `string.Join`, type-test with `as`.
- A throw-probe reads the working copy, saves nothing and returns `mutatedOmlPath: ""`: keep the path of the real
  apply for the merge. Its `validationMessages` describe the probe's own in-memory state (a probe that deletes an
  input shows errors that the real model does not have).
- After the merge and `endOmlEditSession`, read the live module with `getServerAction` / `getScreen` (code read-back,
  `includeJson: "Never"`).
- The module exception handler is not a client action: `getSerializedObjectByNameAndType` with `objectName: OnException`
  and `objectType: OutSystems.Model.UI.IOnExceptionAction`.
- Large dumps (127 KB for 25 actions) are saved to a file by the harness: parse that file with a script and keep only
  the verdict.
