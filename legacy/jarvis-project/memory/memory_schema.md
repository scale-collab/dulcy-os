

# Memory Schema

This file defines how Jarvis should understand and maintain operational memory.

Jarvis memory is divided into different memory types. Each memory type has a different purpose and should not be mixed with the others.

---

## Memory Types

### 1. Tasks
File: `tasks.md`

Tasks are actionable work items that need to be completed.

Use tasks for:
- integrations to build
- bugs to fix
- workflows to create
- client work to complete
- operational projects with clear action required

Do not use tasks for:
- general reminders
- preferences
- passive notes
- background context

### Task Format

```markdown
### Task Name
- Status: Not started | In Progress | Waiting | Completed | Cancelled
- Owner: Alexander
- Priority: Low | Medium | High | Critical
- Description:
- Next action:
- Due date:
```

### Task Status Definitions

- Not started: The task exists but work has not begun.
- In Progress: The task is actively being worked on.
- Waiting: The task is blocked or waiting on someone/something.
- Completed: The task is done.
- Cancelled: The task is no longer relevant.

---

### 2. Reminders
File: `reminders.md`

Reminders are lightweight things Jarvis should remember, but they are not necessarily actionable tasks.

Use reminders for:
- future considerations
- preferences
- known issues to keep in mind
- recurring cautions
- general notes

Do not use reminders for:
- work that clearly needs to be completed
- project tasks
- deliverables

### Reminder Format

```markdown
### Reminder Name
- Date added:
- Context:
- Reminder:
- Related project:
- Priority: Low | Medium | High | Critical
```

---

### 3. Active Projects
File: `active_projects.md`

Projects are ongoing initiatives with multiple steps or long-term objectives.

Use projects for:
- Jarvis AI Operating System
- client fulfillment systems
- major integrations
- product/service development
- internal operations improvements

### Project Format

```markdown
### Project Name
- Status: Active | Paused | Waiting | Completed | Cancelled
- Priority: Low | Medium | High | Critical
- Owner:
- Objective:
- Current phase:
- Current blockers:
- Important notes:
- Next action:
```

---

### 4. Decisions
File: `decisions.md`

Decisions are important choices that should be remembered so Jarvis understands why the system or business operates a certain way.

Use decisions for:
- architecture choices
- business strategy choices
- pricing decisions
- workflow decisions
- policy decisions

### Decision Format

```markdown
### Decision Name
- Date:
- Decision owner:
- Context:
- Decision made:
- Reasoning:
- Expected outcome:
- Follow-up actions:
```

---

### 5. Goals
File: `goals.md`

Goals are desired outcomes or targets.

Use goals for:
- revenue targets
- operational targets
- founder goals
- Jarvis development goals
- company growth goals

Goals should inform prioritization but should not be treated as tasks unless a specific action is required.

---

## Priority Definitions

- Low: Useful but not urgent.
- Medium: Important but not immediately urgent.
- High: Important and should be prioritized soon.
- Critical: Urgent and important.

---

## Memory Rules

1. Do not mix memory types.
2. Tasks must be actionable.
3. Reminders should not be treated as tasks.
4. Completed tasks should stay in memory unless Alexander asks to archive or delete them.
5. When updating memory, preserve the existing structure.
6. When unsure whether something is a task or reminder, ask one clarifying question.
7. Use the company brand name Dulcy unless legal context requires Dulcy Media LLC.
8. Never claim memory was updated unless the file was actually changed.