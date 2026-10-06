# Routines

A [Chickadee Bandit](https://chickadeebandit.com/app-library/routines) app.

Reusable household playbooks for Chickadee Bandit.

Routines lets a household create templates for repeated flows like school mornings, bedtime, weekly resets, travel departure, babysitter nights, and pet-sitter instructions. A template can be started as a live routine run, and each run snapshots its steps so later template edits do not rewrite history.

## Features

- Template library with ordered checklist steps.
- Live routine runs with required/optional steps.
- Caregiver packets with explicit, share-safe fields.
- Starter templates for common household routines.
- App events for routine started, step completed, and routine completed.

**Template steps and audience rows answer to the template's owner.** Both
tables declare `parent_owner_actions: ["update", "delete"]`, so the member who
owns a template can reorder, correct or remove a step or audience row that
someone else added to it. In a household every adult already reaches every
template, so this matters in shared spaces: the steward can add a step to a
participant's template, and without the opt-in the owner was the one member who
could not maintain it. Ownership reaches only that template's rows, grants no
new read or insert access, and other participant adults are still kept out.

## Development

```bash
npm test
npm run build
```
