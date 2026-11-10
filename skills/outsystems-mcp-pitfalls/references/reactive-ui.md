# Reactive UI facts verified through the Service Studio MCP

Verified 2026-10-21/22 on OutSystems 11 Reactive. Read before writing specs for screens, blocks and flows.

## Contents
- Flow and action rules
- Widgets and expressions
- Charts (Highcharts via the OSUI chart blocks)
- Blocks, scripts, layout
- Theme and CSS
- Warnings that are safe to accept

## Flow and action rules
- Client actions cannot hold Destination nodes ("Destination objects can't be children of Client Action
  objects"). Put navigation chains in screen actions or block actions.
- Data actions cannot run a Client Action. Anything that must run after a fetch (building chart points) goes in
  a screen action bound to the data action's `OnAfterFetch`.
- Local variables of identifier type accept only literal defaults; assign them in `OnInitialize`.
- Names of block locals, action inputs and flow nodes must be unique: a duplicate is silently renamed `X2` (a
  second call node `Add1` became `Add4`) and breaks the argument binding.
- The module exception handler (`OnException`) is an `IOnExceptionAction` (`eSpace.GlobalExceptionHandler`), not a
  client action: `getClientAction` and ModelQL do not find it; `getSerializedObjectByNameAndType` does.
- Verified 2026-10-27 by a small probe: an exception-handler node (`Exception = eSpace.AllExceptions`,
  `LogError = false`) in a block's screen action, `foreach` + `if` inside a client action, and
  `IInputParameter.Delete()` are accepted. A consumer cannot bind a handler to a producer's user exception.
- Event handlers need every action input bound (`hnd.SetArgumentValue(p, p.Name)`).
- `ClientActionWithScreenDataAccessesOnLifecycleEvent` (OnInit refreshing data actions) is an accepted warning.

## Widgets and expressions
- Classic Dropdown: `Values`/`Labels` are attribute NAMES of the list record, not expressions. DropdownSearch
  `OptionsList` uses `List mapTo { Value: List.Current.X, Label: List.Current.Y }` (that is a single-use case:
  option lists, not chart points, see below).
- Aggregate sort: `dbA.CreateSort().SetAttribute("Entity.Attr")` and
  `SortDirection = OutSystems.Model.Enumerations.Sort.Descending`.
- Table: header cells go under `table.HeaderRow`, row cells under `table.Row`.
- List element in expressions: `ListVar[0].Field` (not `.List[0]`); inside an aggregate `GetX.List.Current.<Entity>.<Attr>`.
- Rewrite an existing expression in place: read it with `widget.Value.ToString()` cut at the first `" ["`, then
  `SetValue` / `SetArgumentValue` / `SetVisible`.
- Class expression from a code: `="rag-" + ToLower(<expr>)`; read models may return capitalised codes
  (Green, Amber, Red), so lower-case before building CSS classes.

## Charts
- Symptom: every point shows the first item's value. Cause: `X mapTo { ... X.Current.F }` compiles to
  `getCurrent(callContext.iterationContext)` evaluated on the first item. Fix: For Each + Assign to a
  `DataPoint` local + `ListAppend` into a list typed `List of DataPoint`.
- In the module where this was verified the structure is called `Legacy_DataPoint`, not `DataPoint`: read the
  actual name from the model (`runQuery`/`getDataModel`) before writing the type, instead of assuming it.
- Single-series legends are hidden with CSS; custom tooltips and gradients were not worth the effort in the first
  pass. Record such simplifications in a visible list for the approval gate.

## Generated payloads
- One spec per payload: each one repeats the interpreter prelude (~19K characters); per-spec payloads here were
  12K to 73K, and a 72K payload of three specs came back truncated.
- In-place regeneration updates widgets and flows but does not delete block inputs a spec dropped: a cleanup spec
  applied after the screens that pass the input removes it.
- Keep the shared interpreter template free of members you have not verified: a step that only some specs use is
  still compiled for every batch, so emit it only when a batch needs it.
- A project selector bound to the screen's project fired `OnChange` by itself on load: navigate only when the
  selected value differs from the current project and is > 0.

## Blocks, scripts, layout
- Blocks whose client actions call OSUI JS (menus, layouts) need `RequiredScripts.Add(osui.Scripts.Named("OutSystemsUI"))`.
  `LoadOutSystemsUIScript` in `OnInitialize` did NOT fix "OutSystems is not defined".
- A placeholder's default content is copied into every screen and evaluated in the screen scope: put the menu
  block directly in the layout.
- `Settings` is reserved (renamed `Settings2`). A node named `Roles` collides with module roles.
- The empty template module has two warnings (`AnonymousAccess_NoPermissionsNoRoles` on Login and
  InvalidPermissions) until roles exist; do not count them as regressions.

## Theme and CSS
- Theme CSS is published with the module: regenerate and apply it after every CSS edit. When the change is a new
  fragment only, append it when its marker class is absent (a 1.2K payload instead of a 90K stylesheet); take the
  marker from a selector outside comments (a first version took `.mjs` from a comment).
- Never touch `theme.IconLibrary` (breaks `omlMerge`).
- Preview CSS in the logged-in browser first (inject a `<style>` with `evaluate_script`), then publish.

## Warnings that are safe to accept
`ClientActionWithScreenDataAccessesOnLifecycleEvent`; "List should have a single direct child";
`InvalidIconLibrary` when the theme stylesheet changes (see SKILL.md section 2).
