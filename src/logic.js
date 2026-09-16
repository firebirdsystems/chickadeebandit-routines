export const STARTER_TEMPLATES = [
  {
    title: "School Morning",
    category: "kids",
    description: "A calm checklist for getting out the door.",
    default_start_time: "07:00",
    steps: [
      ["Get dressed", "Clothes, socks, shoes, and weather gear.", 0, "kid", true, "👕"],
      ["Eat breakfast", "Pack any leftovers or lunch items.", 20, "kid", true, "🥣"],
      ["Brush teeth and hair", "Bathroom reset before leaving.", 35, "kid", true, "🪥"],
      ["Backpack check", "Homework, water bottle, lunch, and activity gear.", 45, "parent", true, "🎒"]
    ]
  },
  {
    title: "Bedtime",
    category: "kids",
    description: "Evening wind-down steps.",
    default_start_time: "19:30",
    steps: [
      ["Pajamas", "Change clothes and put laundry away.", 0, "kid", true, "🌙"],
      ["Bathroom", "Brush teeth, wash face, use bathroom.", 10, "kid", true, "🚿"],
      ["Tomorrow prep", "Choose clothes and pack backpack.", 20, "kid", false, "👟"],
      ["Read and lights out", "Books, water, final goodnight.", 30, "parent", true, "📚"]
    ]
  },
  {
    title: "Weekly Reset",
    category: "household",
    description: "Quick household reset for the week ahead.",
    default_start_time: "16:00",
    steps: [
      ["Clear shared spaces", "Kitchen counter, entryway, and living room.", 0, "everyone", true, "🧹"],
      ["Review calendar", "Check events, rides, meals, and deadlines.", 20, "adult", true, "📅"],
      ["Plan meals", "Pick easy meals and add missing grocery items.", 35, "adult", false, "🍽️"],
      ["Laundry check", "Start what is needed for Monday.", 45, "everyone", false, "🧺"]
    ]
  },
  {
    title: "Travel Departure",
    category: "travel",
    description: "Final pass before leaving home.",
    default_start_time: "08:00",
    steps: [
      ["Documents and meds", "IDs, tickets, medications, chargers.", 0, "adult", true, "🛂"],
      ["House check", "Trash, thermostat, doors, windows, lights.", 15, "adult", true, "🏠"],
      ["Bags loaded", "Count bags and special items.", 25, "everyone", true, "🧳"],
      ["Final bathroom and water", "Last stop before getting in the car.", 35, "everyone", false, "💧"]
    ]
  },
  {
    title: "Babysitter Night",
    category: "caregiver",
    description: "Share-safe evening instructions for a sitter.",
    default_start_time: "17:30",
    steps: [
      ["Dinner", "Meal plan, allergy notes, and cleanup expectations.", 0, "caregiver", true, "🍝"],
      ["Activities", "Approved games, screens, homework, or outdoor time.", 30, "caregiver", false, "🎲"],
      ["Bedtime routine", "Bathroom, pajamas, books, lights out.", 90, "caregiver", true, "🛏️"],
      ["House close-up", "Doors locked, lights, pets, and parent update.", 150, "caregiver", true, "🔒"]
    ]
  },
  {
    title: "Pet Sitter",
    category: "caregiver",
    description: "Care steps for someone watching pets.",
    default_start_time: "18:00",
    steps: [
      ["Food and water", "Amounts, location, and cleanup.", 0, "caregiver", true, "🐾"],
      ["Walk or litter", "Route, leash, bags, litter, or yard notes.", 15, "caregiver", true, "🦮"],
      ["Medication", "Only include exact instructions when needed.", 30, "caregiver", false, "💊"],
      ["Update owner", "Send photo or quick status note.", 45, "caregiver", false, "📸"]
    ]
  }
];

/**
 * Emoji offered by the step editor's icon picker. Kept small and concrete on
 * purpose: these are the pictures a pre-reader learns to recognise on the
 * kiosk tile grid, so the list favours unambiguous objects (a toothbrush, a
 * backpack) over abstractions. Any emoji typed by hand is still accepted.
 */
export const ROUTINE_ICONS = [
  "👕", "👟", "🎒", "🪥", "🚿", "🛁", "🧴", "💧",
  "🥣", "🍎", "🍽️", "🥪", "🍝", "☕", "💊", "🩺",
  "🛏️", "🌙", "📚", "🎲", "🎨", "🎵", "📅", "⏰",
  "🧹", "🧺", "🗑️", "🧽", "🏠", "🔒", "🐾", "🦮",
  "🚗", "🧳", "🛂", "📸", "✅", "⭐", "❤️", "🌞"
];

/** One emoji (or empty). Guards the picker's free-text escape hatch so a
 *  pasted paragraph can't become a tile label. */
export function normalizeIcon(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return [...text][0] ?? "";
}

/**
 * DEVICE-local, not household-local. The UI no longer calls this — every date
 * that is STORED or COMPARED goes through the SDK's hubToday(), which names the
 * HOUSEHOLD's calendar day and so agrees with the hub's own surfaces (glance,
 * kiosk, cron, `:today` in declared SQL). Kept because it is pure and tested,
 * and still fine for presentation. Do not reach for it to build a date you are
 * about to write or compare against a stored one.
 */
export function todayStr(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function completionSummary(steps) {
  const required = steps.filter((s) => Number(s.required) === 1);
  const doneRequired = required.filter((s) => s.status === "done").length;
  const done = steps.filter((s) => s.status === "done").length;
  const skipped = steps.filter((s) => s.status === "skipped").length;
  return {
    total: steps.length,
    done,
    skipped,
    required: required.length,
    doneRequired,
    isComplete: required.length > 0 && doneRequired === required.length
  };
}

/**
 * Who supervises runs: may start one (and so keep each step's assignee) and may
 * tick any step. That is the reach run_steps' `owner_only` policy grants: every
 * adult in a household, but only the admin (steward) in a shared space, where
 * the hub resolves supervision from `isAdmin` rather than from the adult role.
 *
 * Starting a run is gated on it, not on being an adult. A non-admin adult in a
 * space passes the runs table (`adult_writable`) but not run_steps, and the hub
 * rewrites the assignee of every step such a caller inserts to the caller — so
 * the run looked right until reload, then every step belonged to the starter.
 */
export function isRunSupervisor({ tenantKind = "household", isAdmin = false, adult = false } = {}) {
  return tenantKind === "household" ? adult === true : isAdmin === true;
}

export function canCompleteStep(step, member, supervisor = false) {
  if (!member) return true;
  if (supervisor) return true;
  // Mirror the run_steps row policy (owner_only on assigned_member_id, with the
  // supervisor bypass): anyone else may only complete a step assigned to them.
  // An unassigned step has no owner, so the server narrows that write to zero
  // rows — don't show a Done button that silently does nothing.
  return !!step.assigned_member_id && step.assigned_member_id === member.id;
}

export function sortByOrder(rows) {
  return [...rows].sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
}

export function visibleTemplates(templates) {
  return templates.filter((template) => !template.archived_at);
}

/**
 * Fields the in-app search matches against (see hub-sdk `searchMatch`).
 * Description and category count as well as the title — routines are
 * browsed as "the morning ones" once a household has a dozen.
 */
export function searchableFields(item) {
  return [item.title, item.description, item.category];
}

/**
 * A routine save or a run start goes to /api/db as ONE batch, which D1 runs as
 * one transaction. The endpoint caps a batch at 25 statements, and the client
 * used to split a longer list into several batches — so a template edit with
 * more than 22 steps committed the DELETE of its old steps in the first batch
 * and lost whatever a failed second batch carried.
 *
 * So steps are inserted several rows per statement and the step count is capped
 * where the worst case still fits one batch. D1 also refuses a statement with
 * more than 100 bound parameters: a step row binds 14, so 6 rows (84) leaves
 * room for anything the row-policy rewrite adds, and the edit's link-release
 * UPDATE binds one parameter per old step, which the cap keeps under it too.
 */
export const MAX_BATCH_STATEMENTS = 25;
export const ROWS_PER_INSERT = 6;
export const MAX_ROUTINE_STEPS = 80;

function multiRowInserts(table, columns, rows, toParams) {
  const statements = [];
  const tuple = `(${columns.map(() => "?").join(",")})`;
  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
    const chunk = rows.slice(i, i + ROWS_PER_INSERT);
    statements.push({
      sql: `INSERT INTO ${table} (${columns.join(",")}) VALUES ${chunk.map(() => tuple).join(",")}`,
      params: chunk.flatMap(toParams)
    });
  }
  return statements;
}

function assertStepCount(count) {
  if (count > MAX_ROUTINE_STEPS) {
    throw new RangeError(`A routine can have at most ${MAX_ROUTINE_STEPS} steps.`);
  }
}

const STEP_COLUMNS = ["id", "template_id", "title", "details", "icon", "timer_minutes", "suggested_offset_minutes", "assigned_member_id", "role_label", "required", "sort_order", "created_by_member_id", "created_at", "updated_at"];

/**
 * The batch that saves an edit to a template: update the template row, then
 * rebuild its steps (release any stray run links, delete every step, insert
 * the edited list).
 *
 * The rebuild is only correct if the DELETE reaches every old step. It does
 * not always: the step tables are `inherit_visibility`, whose UPDATE/DELETE
 * reach is the step's writer, widened by `adults_bypass` ONLY in a household
 * or roster space. In a general or coparenting space an adult editing a
 * template whose steps someone else wrote deletes nothing, and the inserts
 * still land (they need only a visible parent), so every save appended a full
 * copy of the steps. Likewise a non-steward's template UPDATE there changes
 * no row while the steps it carried were still added.
 *
 * So both writes carry `requireChanges`: a save that cannot reach the rows it
 * replaces is rolled back whole instead of half-applied. The step DELETE is
 * guarded only when there were steps to delete, since zero is then the right
 * count. The whole list fits one batch (see MAX_ROUTINE_STEPS), so the guards
 * and every insert commit or roll back together.
 *
 * The UPDATE also matches the `updated_at` this tab loaded (`loadedUpdatedAt`).
 * Matching the id alone let two open editors both pass the guard, and the later
 * save replaced the earlier one's title and — because the DELETE takes every
 * step of the template — its steps too, without a word. Any write that bumps
 * `updated_at` in between (another save, an archive) now makes this UPDATE
 * change nothing, and the batch rolls back. The column is plaintext, so the
 * equality can match.
 */
export function templateSaveStatements({ templateId, row, loadedUpdatedAt, doomedStepIds = [], stepRows = [], memberId }) {
  if (!templateId) throw new TypeError("templateSaveStatements edits an existing template; use templateCreatePlan for a new one.");
  if (typeof loadedUpdatedAt !== "string" || !loadedUpdatedAt) throw new TypeError("templateSaveStatements needs the updated_at the editor loaded.");
  assertStepCount(stepRows.length);
  const statements = [];
  statements.push({
    sql: "UPDATE app_routines__templates SET title=?, description=?, category=?, visibility=?, target_member_id=?, default_start_time=?, default_duration_minutes=?, updated_at=? WHERE id=? AND updated_at=?",
    params: [row.title, row.description, row.category, row.visibility, row.target_member_id, row.default_start_time, row.default_duration_minutes, row.updated_at, row.id, loadedUpdatedAt],
    requireChanges: true
  });
  // No run step links a template step any more: runs stop writing it and
  // migration 004 cleared the stored links. A tab still running an older
  // bundle can write one again, though, and the step DELETE would then fail
  // the foreign key on every later save. So release whatever links this saver
  // can reach, best effort and UNGUARDED — it matches no rows in the normal
  // case, and a household adult reaches every run step, so a stray link there
  // never blocks. What it cannot reach (another member's run step, in a
  // space) still fails the save, which is the residue of a stale client only.
  if (doomedStepIds.length) {
    statements.push({
      sql: `UPDATE app_routines__run_steps SET template_step_id = NULL WHERE template_step_id IN (${doomedStepIds.map(() => "?").join(",")})`,
      params: doomedStepIds
    });
  }
  statements.push({
    sql: "DELETE FROM app_routines__template_steps WHERE template_id=?",
    params: [row.id],
    ...(doomedStepIds.length ? { requireChanges: true } : {})
  });
  statements.push(...stepInserts(stepRows, memberId));
  return statements;
}

function stepInserts(stepRows, memberId) {
  return multiRowInserts("app_routines__template_steps", STEP_COLUMNS, stepRows, (step) => [
    step.id, step.template_id, step.title, step.details, step.icon, step.timer_minutes, step.suggested_offset_minutes,
    step.assigned_member_id, step.role_label, step.required, step.sort_order, memberId, step.created_at, step.updated_at
  ]);
}

/**
 * Creating a template takes TWO requests, not one batch. The step tables are
 * `inherit_visibility`, and the hub checks that each inserted step's template is
 * visible to the caller by reading D1 BEFORE the batch runs — so a batch that
 * inserts the template and its steps together is always refused ("Referenced
 * templates … is not visible to this member"). New Template and Add Starter
 * Templates both sent exactly that batch, and both failed every time.
 *
 * So the template goes first, on its own, then every step in one batch. If the
 * steps fail, `undo` removes the template again, so a failed create does not
 * leave a stepless routine behind (and a starter can be retried: installation
 * skips a title that already exists).
 */
export function templateCreatePlan({ row, stepRows = [], memberId }) {
  assertStepCount(stepRows.length);
  return {
    create: {
      sql: "INSERT INTO app_routines__templates (id,title,description,category,visibility,owner_member_id,target_member_id,default_start_time,default_duration_minutes,archived_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      params: [row.id, row.title, row.description, row.category, row.visibility, row.owner_member_id, row.target_member_id, row.default_start_time, row.default_duration_minutes, row.archived_at, row.created_at, row.updated_at]
    },
    steps: stepInserts(stepRows, memberId),
    undo: { sql: "DELETE FROM app_routines__templates WHERE id=?", params: [row.id] }
  };
}

/**
 * Whether a run started from this template must keep its words off the runs
 * table. `runs` stays read-open (`adult_writable`) because the kiosk checklist
 * joins it as the parent of run_steps, and the hub accepts only a read-open
 * table there. Everyone reads it, so copying an adults-only template's title,
 * caregiver label and notes into it published them to every child — on Today,
 * History, the agenda surface and the event bus.
 *
 * A restricted run therefore stores those three in run_details, which carries
 * the template's visibility under `owner_or_visibility`, and leaves them blank
 * on the run row with `restricted = 1`. Fails closed: anything but "everyone"
 * is restricted.
 */
export function isRestrictedVisibility(visibility) {
  return visibility !== "everyone";
}

const RUN_COLUMNS = ["id", "template_id", "title_snapshot", "run_date", "status", "started_by_member_id", "target_member_id", "caregiver_label", "notes", "started_at", "completed_at", "canceled_at", "restricted"];
const RUN_DETAIL_COLUMNS = ["id", "run_id", "started_by_member_id", "visibility", "title", "caregiver_label", "notes", "created_at"];
const RUN_STEP_COLUMNS = ["id", "run_id", "template_step_id", "title_snapshot", "details_snapshot", "icon_snapshot", "timer_minutes", "assigned_member_id", "role_label", "required", "sort_order", "status", "completed_by_member_id", "completed_at"];

/**
 * The rows a run start writes: the run, its private details when the template
 * is restricted, and a snapshot of every template step. One batch, so a failure
 * never leaves a run with half its steps.
 *
 * `template_step_id` stays NULL: nothing reads the link, and a stored one made
 * every later save of the template depend on reaching this row (see
 * migrations/004_retire_template_step_link.sql).
 */
export function buildRun({ template, steps = [], runId, memberId, runDate, targetMemberId = null, caregiverLabel = "", notes = "", now, stepId }) {
  assertStepCount(steps.length);
  const restricted = isRestrictedVisibility(template.visibility);
  const run = {
    id: runId, template_id: template.id,
    title_snapshot: restricted ? "" : template.title,
    run_date: runDate, status: "active", started_by_member_id: memberId, target_member_id: targetMemberId || null,
    caregiver_label: restricted ? "" : caregiverLabel,
    notes: restricted ? "" : notes,
    started_at: now, completed_at: null, canceled_at: null,
    restricted: restricted ? 1 : 0
  };
  const details = restricted
    ? { id: runId, run_id: runId, started_by_member_id: memberId, visibility: template.visibility, title: template.title, caregiver_label: caregiverLabel, notes, created_at: now }
    : null;
  const runSteps = steps.map((step) => ({
    id: stepId(), run_id: runId, template_step_id: null,
    title_snapshot: step.title, details_snapshot: step.details ?? "", icon_snapshot: step.icon ?? "",
    timer_minutes: step.timer_minutes ?? null, assigned_member_id: step.assigned_member_id || run.target_member_id,
    role_label: step.role_label ?? "", required: step.required, sort_order: step.sort_order,
    status: "pending", completed_by_member_id: null, completed_at: null
  }));
  const statements = [{
    sql: `INSERT INTO app_routines__runs (${RUN_COLUMNS.join(",")}) VALUES (${RUN_COLUMNS.map(() => "?").join(",")})`,
    params: RUN_COLUMNS.map((c) => run[c])
  }];
  if (details) {
    statements.push({
      sql: `INSERT INTO app_routines__run_details (${RUN_DETAIL_COLUMNS.join(",")}) VALUES (${RUN_DETAIL_COLUMNS.map(() => "?").join(",")})`,
      params: RUN_DETAIL_COLUMNS.map((c) => details[c])
    });
  }
  statements.push(...multiRowInserts("app_routines__run_steps", RUN_STEP_COLUMNS, runSteps, (row) => RUN_STEP_COLUMNS.map((c) => row[c])));
  return { run, details, runSteps, statements };
}

/**
 * The words to show for a run, from the run row joined to its details (the
 * reads alias them `detail_title`, `detail_caregiver_label`, `detail_notes`).
 * A restricted run whose details this viewer cannot read has no title to show;
 * `title` is null and the caller decides what stands in for it.
 */
export function runDisplay(run) {
  if (!Number(run.restricted)) {
    return { title: run.title_snapshot, caregiverLabel: run.caregiver_label ?? "", notes: run.notes ?? "", readable: true };
  }
  const readable = run.detail_title != null;
  return {
    title: readable ? run.detail_title : null,
    caregiverLabel: readable ? run.detail_caregiver_label ?? "" : "",
    notes: readable ? run.detail_notes ?? "" : "",
    readable
  };
}

/**
 * App events carry no audience: every member reads every payload, so a
 * restricted run publishes nothing — not its start, a step, or its completion
 * (and so raises no completion alert either).
 */
export function mayPublishRun(run) {
  return !Number(run.restricted);
}

/**
 * Whether a viewer is shown a run card at all. A restricted run whose details
 * they cannot read is still shown when they can see one of its steps (an adult
 * assigned it to them, and the kiosk shows it too), and to a supervisor, who
 * can finish, cancel and tick it. Otherwise it would be an empty card naming
 * nothing.
 */
export function showRunTo(run, visibleSteps, supervisor) {
  if (runDisplay(run).readable) return true;
  return supervisor || visibleSteps.length > 0;
}
