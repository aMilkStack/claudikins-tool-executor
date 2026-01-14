---
name: te-doctor
description: Diagnose Tool Executor issues - run tests, check health, troubleshoot
argument-hint: "[test|health|reset]"
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Skill
---

# Tool Executor Diagnostics

Load the te-doctor skill and help diagnose issues with the Tool Executor.

Based on the argument:
- "test" → Run `npm test` and report results
- "health" → Check build status, registry integrity, workspace state
- "reset" → Guide through full reset (clean + reinstall + rebuild)
- No argument → Run quick health check (build + test)

Always provide actionable next steps based on findings.
