# Lessons log: Orders portal

Running record of what went wrong while building the Orders portal. Entries are append-only.

## Entry format

```
### L-NNN · date · phase · area · title
- Symptom:    what was seen
- Skill:      covered (section) | partial | missing from the official skill | new in our skill | not in any skill yet
```

The headings and fields above are an example, not entries.

## Entries

### L-001 · 2026-10-02 · Phase 0 · session · applyModelApiCode fails without an edit session
- **Symptom:** The first write answered 'No OML edit session is started'.
- **Cause:** The server needs startOmlEditSession per module before the first apply.
- **Resolution:** Start an edit session per module and end it when the task is done.
- **Cost:** two rounds
- **Skill:** new in our skill (SKILL.md section 2) · official: missing
- **Evidence:** notes of 2026-10-02
- **Slide:** yes

### L-002 · 2026-10-02 · Phase 0 · testing · A test of the Customer entity wrote without reading first
- **Symptom:** The test passed against an empty table.
- **Cause:** The oracle was built from the same code it checked.
- **Resolution:** Take the expected values from a fixture written by hand.
- **Cost:** not recorded
- **Skill:** covered (SKILL.md section 5) · official: missing
- **Evidence:** the Orders test module
- **Slide:** no

### L-003 · 2026-10-05 · Phase 1 · reactive-ui · Edit · publish loop: the screen kept the old layout
- **Symptom:** After a publish the Orders screen still showed the old layout.
- **Cause:** unknown
- **Resolution:** Hard-reload the browser, then check the published version.
- **Cost:** one round
- **Skill:** partial (SKILL.md section 3 asks for a reload but not the version check)
- **Evidence:** screenshot
- **Slide:** no

### L-004 · 2026-10-05 · Phase 1 · planning · A plan step swapped two oracles
- **Symptom:** Two tests expected each other's values.
- **Cause:** The plan listed the oracles in the wrong order.
- **Resolution:** Name the OutSystems element in each plan step.
- **Cost:** one round
- **Skill:** planning checklist: an oracle that generates its own expected values proves nothing
- **Evidence:** plan review
- **Slide:** no

### L-005 · 2026-10-07 · Phase 1-2 · security · Customer rows were readable by any logged-in role
- **Symptom:** A user without the Sales role listed every Customer.
- **Cause:** The aggregate had no role check on the server.
- **Resolution:** Check the role inside the server action that feeds the screen.
- **Cost:** half a day
- **Skill:** not in any skill yet (add to SKILL.md section 7)
- **Evidence:** getRoleExceptions output
- **Slide:** yes

### L-006 · 2026-10-08 · Phase 2 · data-model · Orders.Status was an Integer and a Text at once
- **Symptom:** Merge refused with a type clash on Orders.Status.
- **Cause:** Two modules declared the attribute with different types.
- **Resolution:** One module owns the entity; the other consumes it.
- **Cost:** one round
- **Skill:** missing from the official skill
- **Evidence:** merge output
- **Slide:** no

### L-007 · 2026-10-09 · Phase 2 · edit-loop · A second Skill line is ignored
- **Symptom:** The entry carries two Skill lines.
- **Cause:** The first line is the one that counts.
- **Resolution:** Keep one line.
- **Cost:** none
- **Skill:** partial
- **Skill:** covered (SKILL.md section 4)
- **Evidence:** this fixture
- **Slide:** no

## Appendix

### L-099 · 2026-10-09 · Phase 2 · ui · This heading sits after another section
- **Symptom:** It is still an entry: only what follows the Entries heading counts, and the Appendix heading ends the entry before it.
- **Cause:** none
- **Resolution:** none
- **Skill:** partial
