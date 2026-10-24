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
- A nanny or sitter signed in as a household guest can start a routine and
  tick its steps; the household sees where it stands.

**Who starts and ticks a routine.** `runs` is `owner_or_visibility` with its
`visibility` column locked at `everyone`. In a household every member reads
every run; in a roster space the hub's star topology applies, so a member who
is not the steward reads the steward's runs and their own. Any member who can
see a template may start a run of it, stamped with who did (the hub does not
check the template on insert). Inside a row policy a guest and a child are the
same principal, so a child's app SQL can insert a run too; the page offers
Start only to whoever supervises runs (every adult in a household, the steward
in a space) and to a guest, and a child keeps a read-only card. Writes follow
reads (`write_visibility_scoped`), and every column a run is written through
is `writable_by: ["adult", "owner"]`, so in a household or a general or
co-parenting space any adult may change any run they read, while a child or
guest changes only the runs they started; a roster space narrows a
non-steward's writes to their own rows, so there only the steward and the
starter close a run; `started_by_member_id`,
`visibility` and `step_count` are never rewritten, and only an adult removes a
run. `run_steps` stays `owner_only` on the assignee, and the hub forces every
step a non-supervisor inserts to themselves, so a guest's run is assigned to
the guest whole: the sitter ticks the steps, and the children get no kiosk
tiles or Done buttons of their own for that run. The run records its
`step_count` at the start, frozen after; the page lets someone who does not
supervise finish only when the steps they read are all of them (a step
someone else holds leaves the finish to whoever manages routines; a run with no
recorded count is never whole to them). A guest cannot finish a run a parent
started for her, even when every step is hers: start bedtime from the sitter's
own login so she can finish it; a run a parent starts is finished by an adult. A child
could still add a step to a run, which that count does not catch; that is
accepted. The kiosk checklist still joins `runs` as the parent of `run_steps`;
the hub accepts that because the locked visibility column makes the table
read-open. A guest never sees an adults-only template, so never starts a run
of one. Deploy the hub first: this needs a hub that accepts an
`owner_or_visibility` checklist parent.

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
