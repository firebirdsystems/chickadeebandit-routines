export const STARTER_TEMPLATES = [
  {
    title: "School Morning",
    category: "kids",
    description: "A calm checklist for getting out the door.",
    default_start_time: "07:00",
    steps: [
      ["Get dressed", "Clothes, socks, shoes, and weather gear.", 0, "kid", true],
      ["Eat breakfast", "Pack any leftovers or lunch items.", 20, "kid", true],
      ["Brush teeth and hair", "Bathroom reset before leaving.", 35, "kid", true],
      ["Backpack check", "Homework, water bottle, lunch, and activity gear.", 45, "parent", true]
    ]
  },
  {
    title: "Bedtime",
    category: "kids",
    description: "Evening wind-down steps.",
    default_start_time: "19:30",
    steps: [
      ["Pajamas", "Change clothes and put laundry away.", 0, "kid", true],
      ["Bathroom", "Brush teeth, wash face, use bathroom.", 10, "kid", true],
      ["Tomorrow prep", "Choose clothes and pack backpack.", 20, "kid", false],
      ["Read and lights out", "Books, water, final goodnight.", 30, "parent", true]
    ]
  },
  {
    title: "Weekly Reset",
    category: "household",
    description: "Quick household reset for the week ahead.",
    default_start_time: "16:00",
    steps: [
      ["Clear shared spaces", "Kitchen counter, entryway, and living room.", 0, "everyone", true],
      ["Review calendar", "Check events, rides, meals, and deadlines.", 20, "adult", true],
      ["Plan meals", "Pick easy meals and add missing grocery items.", 35, "adult", false],
      ["Laundry check", "Start what is needed for Monday.", 45, "everyone", false]
    ]
  },
  {
    title: "Travel Departure",
    category: "travel",
    description: "Final pass before leaving home.",
    default_start_time: "08:00",
    steps: [
      ["Documents and meds", "IDs, tickets, medications, chargers.", 0, "adult", true],
      ["House check", "Trash, thermostat, doors, windows, lights.", 15, "adult", true],
      ["Bags loaded", "Count bags and special items.", 25, "everyone", true],
      ["Final bathroom and water", "Last stop before getting in the car.", 35, "everyone", false]
    ]
  },
  {
    title: "Babysitter Night",
    category: "caregiver",
    description: "Share-safe evening instructions for a sitter.",
    default_start_time: "17:30",
    steps: [
      ["Dinner", "Meal plan, allergy notes, and cleanup expectations.", 0, "caregiver", true],
      ["Activities", "Approved games, screens, homework, or outdoor time.", 30, "caregiver", false],
      ["Bedtime routine", "Bathroom, pajamas, books, lights out.", 90, "caregiver", true],
      ["House close-up", "Doors locked, lights, pets, and parent update.", 150, "caregiver", true]
    ]
  },
  {
    title: "Pet Sitter",
    category: "caregiver",
    description: "Care steps for someone watching pets.",
    default_start_time: "18:00",
    steps: [
      ["Food and water", "Amounts, location, and cleanup.", 0, "caregiver", true],
      ["Walk or litter", "Route, leash, bags, litter, or yard notes.", 15, "caregiver", true],
      ["Medication", "Only include exact instructions when needed.", 30, "caregiver", false],
      ["Update owner", "Send photo or quick status note.", 45, "caregiver", false]
    ]
  }
];

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

export function canCompleteStep(step, member) {
  if (!member) return true;
  if (member.role === "adult") return true;
  return !step.assigned_member_id || step.assigned_member_id === member.id;
}

export function sortByOrder(rows) {
  return [...rows].sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
}

export function visibleTemplates(templates) {
  return templates.filter((template) => !template.archived_at);
}
