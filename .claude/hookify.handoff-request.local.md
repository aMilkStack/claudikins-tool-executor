---
name: handoff-request
enabled: true
event: prompt
pattern: .*
action: warn
---

# Claudikins ACM - Context Handoff Request

Context usage has reached **60%**.

**You MUST immediately use AskUserQuestion** to ask the user:

```
Question: "Context at 60%. Generate handoff summary and start fresh?"
Header: "Handoff"
Options:
  - "Yes, handoff now" - Generate summary and open new session
  - "Snooze 5 min" - Ask again in 5 minutes
  - "Dismiss" - Don't ask again this session
```

**After user responds:**

- **YES**: Run `bash /home/ethanlee/projects/claudikins-automatic-context-manager/scripts/run-handoff.sh` then delete `.claude/hookify.handoff-request.local.md`
- **SNOOZE**: Delete `.claude/hookify.handoff-request.local.md` and create snooze flag
- **DISMISS**: Delete `.claude/hookify.handoff-request.local.md`

Then proceed with whatever the user originally asked.
