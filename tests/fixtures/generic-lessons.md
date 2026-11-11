# Generic lessons

Lessons that hold in any OutSystems 11 project built through the Service Studio MCP.
The kit owns this file: an update replaces it.

```
### G-NNN · YYYY-MM-DD · area · title
- **Symptom:** ...
```

### G-003 · 2026-11-03 · charts · A chart series needs a name of its own
- **Symptom:** Two series drew the same line.
- **Cause:** Both series shared one name, so the second replaced the first.
- **Resolution:** Give every series a unique name.
- **Origin:** an internal conversion

### G-001 · 2026-11-01 · ui · A list inside a container loses its scroll
- **Symptom:** The list was cut off at the bottom of the screen.
- **Cause:** The container had a fixed height and hidden overflow.
- **Resolution:** Let the container grow, or give the list its own scroll.

### G-002 · 2026-11-02 · security · A server action is not an access rule
- **Symptom:** A user without the role still got the data.
- **Cause:** The check lived only in the screen.
- **Resolution:** Repeat the role check in the server action.
