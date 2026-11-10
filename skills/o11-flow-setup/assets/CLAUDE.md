@AGENTS.md

When both files exist, Claude Code reads `CLAUDE.md` only, so this import loads the shared rules once and every tool follows the same file. With no `CLAUDE.md`, recent Claude Code versions read `AGENTS.md` on their own. The import is what works in every version and session.
