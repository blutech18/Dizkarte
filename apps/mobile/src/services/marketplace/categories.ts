/**
 * Synthetic category directory mirroring `supabase/seed.sql` slugs.
 *
 * IDs are deterministic UUID-shaped placeholders for development/test only —
 * the real category catalog is served from the `categories` table once
 * Supabase wiring lands (task 9). Kept mobile-local so this pass does not
 * touch migrations/seed data.
 */
import type { TaskQuestionDefinition, TaskQuestionInputKind } from "./types";

export type SyntheticCategory = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
};

export const SYNTHETIC_CATEGORIES: ReadonlyArray<SyntheticCategory> = [
  { id: "30000000-0000-4000-8000-000000000001", slug: "home-cleaning", name: "Home Cleaning" },
  { id: "30000000-0000-4000-8000-000000000002", slug: "handyman", name: "Handyman & Repairs" },
  {
    id: "30000000-0000-4000-8000-000000000003",
    slug: "appliance-repair",
    name: "Appliance Repair",
  },
  { id: "30000000-0000-4000-8000-000000000004", slug: "moving-hauling", name: "Moving & Hauling" },
  { id: "30000000-0000-4000-8000-000000000005", slug: "gardening", name: "Gardening & Lawn" },
  { id: "30000000-0000-4000-8000-000000000006", slug: "tutoring", name: "Tutoring" },
  { id: "30000000-0000-4000-8000-000000000007", slug: "errands", name: "Errands & Delivery" },
  { id: "30000000-0000-4000-8000-000000000008", slug: "tech-support", name: "Tech Support" },
];

export function categoryName(categoryId: string): string {
  return SYNTHETIC_CATEGORIES.find((c) => c.id === categoryId)?.name ?? "Uncategorized";
}

/**
 * Category-guided question definitions, mirroring the sets seeded by
 * `supabase/migrations/0038_task_question_definitions_and_answers.sql` for these
 * same slugs. Kept in step with the migration so the synthetic repository
 * answers the same shape the real database does.
 */
type SeedQuestion = {
  readonly slug: string;
  readonly code: string;
  readonly label: string;
  readonly inputKind: TaskQuestionInputKind;
  readonly options?: ReadonlyArray<string>;
  readonly placeholder?: string;
  readonly required?: boolean;
};

const SEED_QUESTIONS: ReadonlyArray<SeedQuestion> = [
  // Moving & Hauling
  {
    slug: "moving-hauling",
    code: "what_moving",
    label: "What are you moving?",
    inputKind: "select",
    options: ["A few items", "Apartment", "House"],
    required: true,
  },
  {
    slug: "moving-hauling",
    code: "stairs",
    label: "Are there stairs?",
    inputKind: "select",
    options: ["No", "At pickup", "At delivery", "At both places"],
    required: true,
  },
  {
    slug: "moving-hauling",
    code: "key_items",
    label: "What key items are you moving?",
    inputKind: "text",
    placeholder: "e.g. 2-seater sofa, fridge, 10 boxes",
    required: true,
  },
  {
    slug: "moving-hauling",
    code: "vehicle",
    label: "Do you need a vehicle?",
    inputKind: "select",
    options: ["Just labour", "Labour + vehicle", "Not sure"],
  },

  // Home Cleaning
  {
    slug: "home-cleaning",
    code: "property_type",
    label: "What type of place is it?",
    inputKind: "select",
    options: ["House", "Apartment / Condo", "Office"],
    required: true,
  },
  {
    slug: "home-cleaning",
    code: "bedrooms",
    label: "How many bedrooms?",
    inputKind: "select",
    options: ["Studio", "1", "2", "3", "4+"],
    required: true,
  },
  {
    slug: "home-cleaning",
    code: "bathrooms",
    label: "How many bathrooms?",
    inputKind: "select",
    options: ["1", "2", "3+"],
    required: true,
  },
  {
    slug: "home-cleaning",
    code: "clean_type",
    label: "What type of clean?",
    inputKind: "select",
    options: ["Standard", "Deep clean", "Move-out / End of lease"],
    required: true,
  },
  {
    slug: "home-cleaning",
    code: "supplies",
    label: "Will you provide cleaning supplies?",
    inputKind: "boolean",
  },

  // Handyman & Repairs
  {
    slug: "handyman",
    code: "job_type",
    label: "What needs doing?",
    inputKind: "select",
    options: [
      "Mount or hang something",
      "Install a fixture",
      "Repair something",
      "Assemble furniture",
      "Painting",
      "Other",
    ],
    required: true,
  },
  {
    slug: "handyman",
    code: "key_items",
    label: "What needs work?",
    inputKind: "text",
    placeholder: 'e.g. wall-mount a 55" TV on concrete',
    required: true,
  },
  {
    slug: "handyman",
    code: "surface",
    label: "What surface or wall type?",
    inputKind: "select",
    options: ["Drywall / plaster", "Concrete / masonry", "Timber", "Not sure"],
  },
  {
    slug: "handyman",
    code: "materials",
    label: "Are materials or parts provided?",
    inputKind: "boolean",
  },

  // Appliance Repair
  {
    slug: "appliance-repair",
    code: "appliance",
    label: "Which appliance?",
    inputKind: "select",
    options: ["Aircon", "Refrigerator", "Washing machine", "Oven / Stove", "Water heater", "Other"],
    required: true,
  },
  {
    slug: "appliance-repair",
    code: "issue",
    label: "What is the problem?",
    inputKind: "text",
    placeholder: "e.g. not cooling, leaking water",
    required: true,
  },
  {
    slug: "appliance-repair",
    code: "brand",
    label: "Brand and model (if known)",
    inputKind: "text",
    placeholder: "e.g. Samsung WA75",
  },
  {
    slug: "appliance-repair",
    code: "unit_age",
    label: "How old is the unit?",
    inputKind: "select",
    options: ["Under 1 year", "1-3 years", "3-5 years", "5+ years", "Not sure"],
  },

  // Gardening & Lawn
  {
    slug: "gardening",
    code: "yard_size",
    label: "How big is the area?",
    inputKind: "select",
    options: ["Small", "Medium", "Large"],
    required: true,
  },
  {
    slug: "gardening",
    code: "service",
    label: "What do you need done?",
    inputKind: "select",
    options: ["Mowing", "Weeding", "Hedge or pruning", "Landscaping", "General cleanup"],
    required: true,
  },
  {
    slug: "gardening",
    code: "green_waste",
    label: "Do you need green waste removed?",
    inputKind: "boolean",
  },
  { slug: "gardening", code: "tools", label: "Are tools provided?", inputKind: "boolean" },

  // Tutoring
  {
    slug: "tutoring",
    code: "subject",
    label: "What subject?",
    inputKind: "text",
    placeholder: "e.g. Grade 8 Algebra",
    required: true,
  },
  {
    slug: "tutoring",
    code: "level",
    label: "What level?",
    inputKind: "select",
    options: ["Elementary", "Junior High", "Senior High", "College", "Adult"],
    required: true,
  },
  {
    slug: "tutoring",
    code: "mode",
    label: "In person or online?",
    inputKind: "select",
    options: ["In person", "Online", "Either"],
    required: true,
  },
  {
    slug: "tutoring",
    code: "frequency",
    label: "How often?",
    inputKind: "select",
    options: ["One-off session", "Weekly", "A few times a week"],
  },

  // Errands & Delivery
  {
    slug: "errands",
    code: "errand_type",
    label: "What do you need?",
    inputKind: "select",
    options: ["Delivery", "Pickup", "Grocery run", "Queue or line up", "Other"],
    required: true,
  },
  {
    slug: "errands",
    code: "route",
    label: "Pickup and drop-off areas",
    inputKind: "text",
    placeholder: "e.g. Quezon City to Makati",
    required: true,
  },
  {
    slug: "errands",
    code: "item_size",
    label: "How big is the item?",
    inputKind: "select",
    options: ["Small parcel", "Large item", "Multiple items", "Not applicable"],
  },
  {
    slug: "errands",
    code: "vehicle",
    label: "Vehicle needed?",
    inputKind: "select",
    options: ["Motorcycle", "Car", "Van or truck", "Not sure"],
  },

  // Tech Support
  {
    slug: "tech-support",
    code: "device",
    label: "What device?",
    inputKind: "select",
    options: ["Laptop", "Desktop PC", "Printer", "Wi-Fi / Network", "Phone / Tablet", "Other"],
    required: true,
  },
  {
    slug: "tech-support",
    code: "issue",
    label: "What is the problem?",
    inputKind: "text",
    placeholder: "e.g. will not connect to Wi-Fi",
    required: true,
  },
  {
    slug: "tech-support",
    code: "platform",
    label: "Operating system",
    inputKind: "select",
    options: ["Windows", "macOS", "Linux", "Android", "iOS", "Not sure"],
  },
  {
    slug: "tech-support",
    code: "onsite",
    label: "Does it need an on-site visit?",
    inputKind: "boolean",
  },
];

/** Deterministic ids and category resolution, built once from the seed list. */
export const SYNTHETIC_CATEGORY_QUESTIONS: ReadonlyArray<TaskQuestionDefinition> =
  SEED_QUESTIONS.map((question, index) => {
    const category = SYNTHETIC_CATEGORIES.find((c) => c.slug === question.slug);
    return {
      id: `31000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      categoryId: category?.id ?? "",
      code: question.code,
      label: question.label,
      inputKind: question.inputKind,
      options: question.options ?? [],
      placeholder: question.placeholder ?? null,
      required: question.required ?? false,
      // Match the migration's 10-based spacing within each category.
      sortOrder:
        (SEED_QUESTIONS.slice(0, index).filter((q) => q.slug === question.slug).length + 1) * 10,
    };
  });

/** The question set for one category id, in display order. */
export function syntheticQuestionsForCategory(
  categoryId: string,
): ReadonlyArray<TaskQuestionDefinition> {
  return SYNTHETIC_CATEGORY_QUESTIONS.filter((q) => q.categoryId === categoryId)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
