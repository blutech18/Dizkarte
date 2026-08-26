/**
 * Deterministic title → category classification for the posting flow.
 *
 * Typing "Help me move home" should bring up the removals questions without the
 * Client hunting for a category first. That is done with plain keyword rules —
 * no AI, no network call — and it only ever *selects a category*: the questions
 * themselves are defined in the database (`task_question_definitions`), fetched
 * per category, so rewording or adding a question is a data change.
 *
 * Each rule yields an ordered list of candidate slugs because the installed
 * taxonomy varies between environments (e.g. `removals` vs the older
 * `moving-hauling`). The caller resolves the first candidate that actually
 * exists in the live category list.
 *
 * Kept free of any `react-native` import so the rules are unit-testable under
 * plain Node, like `taskWizardSteps` and `taskDraftValue`.
 */

/** Ordered keyword rules; the first match wins. */
const RULES: ReadonlyArray<{
  readonly test: RegExp;
  readonly slugs: ReadonlyArray<string>;
}> = [
  // Specific trades first, so "assemble a wardrobe" is not caught by the
  // broader repairs rule below and "aircon repair" lands on appliances.
  {
    test: /\b(assembl\w*|flat[\s-]?pack\w*|ikea|put[\s-]?together)\b/i,
    slugs: ["furniture-assembly", "handyman"],
  },
  {
    test: /\b(move|moving|movers?|relocat\w*|removal\w*|haul\w*|shift(?:ing)?)\b/i,
    slugs: ["removals", "moving-hauling", "moving-help"],
  },
  {
    test: /\b(clean\w*|tidy\w*|housekeep\w*|declutter\w*|vacuum\w*)\b/i,
    slugs: ["cleaning", "home-cleaning"],
  },
  { test: /\b(paint\w*|repaint\w*)\b/i, slugs: ["painting", "handyman"] },
  {
    test: /\b(garden\w*|lawn\w*|mow\w*|weed\w*|hedge\w*|landscap\w*|prun\w*|yard\w*)\b/i,
    slugs: ["gardening", "yard-outdoor"],
  },
  {
    test: /\b(aircon|air[\s-]?con\w*|refrigerator|fridge|washing[\s-]?machine|appliance\w*|oven|microwave|water[\s-]?heater)\b/i,
    slugs: ["appliance-repair", "repairs-installations", "handyman"],
  },
  {
    test: /\b(copywrit\w*|copy|blog|article|content[\s-]?writ\w*|write[\s-]?up|proofread\w*)\b/i,
    slugs: ["copywriting"],
  },
  {
    test: /\b(data[\s-]?entry|spreadsheet|encod\w*|transcrib\w*|typing)\b/i,
    slugs: ["data-entry"],
  },
  {
    test: /\b(deliver\w*|courier|pick[\s-]?up|drop[\s-]?off|collect\w*|errand\w*|grocer\w*)\b/i,
    slugs: ["errands", "delivery-errands"],
  },
  {
    test: /\b(tutor\w*|lesson\w*|teach\w*|review\w*[\s-]?class|math|algebra)\b/i,
    slugs: ["tutoring"],
  },
  {
    test: /\b(computer|laptop|desktop|wi[\s-]?fi|internet|printer|router|software|reformat)\b/i,
    slugs: ["tech-support"],
  },
  // Broad repair/installation catch-all last.
  {
    test: /\b(fix|repair\w*|install\w*|mount\w*|hang|leak\w*|tap|faucet|plumb\w*|electric\w*|handy\w*|replace)\b/i,
    slugs: ["repairs-installations", "handyman", "basic-plumbing"],
  },
];

/**
 * Candidate category slugs for a task title, most specific first. Empty when
 * nothing matches, in which case the caller keeps whatever category is already
 * selected.
 */
export function categorySlugsForTitle(title: string): ReadonlyArray<string> {
  const text = (title ?? "").trim();
  if (text.length === 0) return [];
  for (const rule of RULES) {
    if (rule.test.test(text)) return rule.slugs;
  }
  return [];
}

/**
 * Resolve a title to a category id from the live catalogue, or null when the
 * title matches nothing available. `available` is the real
 * `listCategories()` result, so this can never invent a category id.
 */
export function categoryIdForTitle(
  title: string,
  available: ReadonlyArray<{ readonly id: string; readonly slug: string }>,
): string | null {
  for (const slug of categorySlugsForTitle(title)) {
    const match = available.find((category) => category.slug === slug);
    if (match) return match.id;
  }
  return null;
}

/**
 * The answer to record for a yes/no question. Stored as the same text the
 * Client saw, so the value needs no decoding to display.
 */
export const BOOLEAN_ANSWERS = ["Yes", "No"] as const;
