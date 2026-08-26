import { describe, expect, it } from "vitest";
import {
  EMPTY_TASK_DRAFT_FORM,
  draftFormFromInput,
  timeOfDayLabel,
  validateTaskDraftForm,
} from "./taskDraftValue";
import type { DraftTaskInput } from "../../services/marketplace/types";

const VALID_FORM = {
  ...EMPTY_TASK_DRAFT_FORM,
  categoryId: "30000000-0000-4000-8000-000000000001",
  title: "Move a two-seater sofa",
  description: "Move one sofa from a second-floor apartment with stairs only.",
  budget: "1500",
  sameDay: true,
  landmark: "Cagayan de Oro City, Misamis Oriental",
  cityCode: "104305",
  barangayCode: "104305001",
  exactAddress: "Corrales Avenue, Cagayan de Oro City, Misamis Oriental",
  approximateLat: 8.482,
  approximateLng: 124.647,
  exactLat: 8.4828,
  exactLng: 124.6474,
};

describe("category answers on submit", () => {
  it("omits the answers key entirely when the form did not collect answers", () => {
    // What the single-page edit form does — stored answers must stay untouched.
    const result = validateTaskDraftForm({
      ...VALID_FORM,
      categoryAnswers: { "q-stairs": "At both places" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect("answers" in result.draft).toBe(false);
  });

  it("includes the answers when the wizard collected them", () => {
    const result = validateTaskDraftForm(
      { ...VALID_FORM, categoryAnswers: { "q-what": "House", "q-stairs": "At both places" } },
      { includeAnswers: true },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.answers).toEqual([
      { questionId: "q-what", answer: "House" },
      { questionId: "q-stairs", answer: "At both places" },
    ]);
  });

  it("trims answers and drops blank ones", () => {
    const result = validateTaskDraftForm(
      { ...VALID_FORM, categoryAnswers: { "q-what": "  House  ", "q-stairs": "   " } },
      { includeAnswers: true },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.answers).toEqual([{ questionId: "q-what", answer: "House" }]);
  });

  it("sends an empty list so a category change clears stale answers", () => {
    const result = validateTaskDraftForm(
      { ...VALID_FORM, categoryAnswers: {} },
      { includeAnswers: true },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.answers).toEqual([]);
  });

  it("keeps the description as the Client's own text, with no answers folded in", () => {
    const result = validateTaskDraftForm(
      { ...VALID_FORM, categoryAnswers: { "q-stairs": "At both places" } },
      { includeAnswers: true },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.description).toBe(VALID_FORM.description);
    expect(result.draft.description).not.toContain("At both places");
  });
});

describe("task draft location projection", () => {
  it("persists the Client's selected real coordinates instead of fixed defaults", () => {
    const result = validateTaskDraftForm(VALID_FORM);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.draft).toMatchObject({
      landmark: VALID_FORM.landmark,
      exactAddress: VALID_FORM.exactAddress,
      approximateLat: VALID_FORM.approximateLat,
      approximateLng: VALID_FORM.approximateLng,
      exactLat: VALID_FORM.exactLat,
      exactLng: VALID_FORM.exactLng,
    });
  });

  it("round-trips persisted coordinates back into the editable form", () => {
    const draft: DraftTaskInput = {
      categoryId: VALID_FORM.categoryId,
      title: VALID_FORM.title,
      description: VALID_FORM.description,
      budgetCentavos: 150_000,
      scheduledFor: null,
      sameDay: true,
      landmark: VALID_FORM.landmark,
      cityCode: "104305",
      barangayCode: "104305001",
      approximateLat: VALID_FORM.approximateLat,
      approximateLng: VALID_FORM.approximateLng,
      exactAddress: VALID_FORM.exactAddress,
      exactLat: VALID_FORM.exactLat,
      exactLng: VALID_FORM.exactLng,
      media: [],
    };

    expect(draftFormFromInput(draft)).toMatchObject({
      approximateLat: draft.approximateLat,
      approximateLng: draft.approximateLng,
      exactLat: draft.exactLat,
      exactLng: draft.exactLng,
    });
  });

  it("maps nested location validation failures to the editable location fields", () => {
    const result = validateTaskDraftForm({
      ...VALID_FORM,
      landmark: "",
      exactAddress: "",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.landmark).toBeTruthy();
    expect(result.errors.exactAddress).toBeTruthy();
  });
});

describe("task time of day", () => {
  it("persists the Client's chosen slot on submit", () => {
    const result = validateTaskDraftForm({ ...VALID_FORM, timeOfDay: "morning" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.timeOfDay).toBe("morning");
  });

  it("submits null when the Client is flexible within the day", () => {
    const result = validateTaskDraftForm({ ...VALID_FORM, timeOfDay: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.timeOfDay).toBeNull();
  });

  it("round-trips a stored slot back into the editable form", () => {
    const draft: DraftTaskInput = {
      categoryId: VALID_FORM.categoryId,
      title: VALID_FORM.title,
      description: VALID_FORM.description,
      budgetCentavos: 150_000,
      scheduledFor: null,
      sameDay: true,
      timeOfDay: "evening",
      landmark: VALID_FORM.landmark,
      cityCode: "104305",
      barangayCode: "104305001",
      approximateLat: VALID_FORM.approximateLat,
      approximateLng: VALID_FORM.approximateLng,
      exactAddress: VALID_FORM.exactAddress,
      exactLat: VALID_FORM.exactLat,
      exactLng: VALID_FORM.exactLng,
      media: [],
    };
    expect(draftFormFromInput(draft).timeOfDay).toBe("evening");
  });

  it("reads a draft saved before the field existed as flexible", () => {
    // Records that predate `time_of_day` carry no value at all.
    const legacy = {
      categoryId: VALID_FORM.categoryId,
      title: VALID_FORM.title,
      description: VALID_FORM.description,
      budgetCentavos: 150_000,
      scheduledFor: null,
      sameDay: true,
      landmark: VALID_FORM.landmark,
      cityCode: "104305",
      barangayCode: "104305001",
      approximateLat: VALID_FORM.approximateLat,
      approximateLng: VALID_FORM.approximateLng,
      exactAddress: VALID_FORM.exactAddress,
      exactLat: VALID_FORM.exactLat,
      exactLng: VALID_FORM.exactLng,
      media: [],
    } satisfies DraftTaskInput;
    expect(draftFormFromInput(legacy).timeOfDay).toBeNull();
  });

  it("labels each slot for display and treats no slot as no label", () => {
    expect(timeOfDayLabel("morning")).toBe("Morning");
    expect(timeOfDayLabel("midday")).toBe("Midday");
    expect(timeOfDayLabel("afternoon")).toBe("Afternoon");
    expect(timeOfDayLabel("evening")).toBe("Evening");
    expect(timeOfDayLabel(null)).toBeNull();
    expect(timeOfDayLabel(undefined)).toBeNull();
  });
});

describe("task location type", () => {
  it("defaults to an in-person task", () => {
    const result = validateTaskDraftForm(VALID_FORM);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.locationType).toBe("in_person");
  });

  it("persists an online task so the choice survives submit", () => {
    const result = validateTaskDraftForm({ ...VALID_FORM, locationType: "online" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.locationType).toBe("online");
  });

  it("reads a draft saved before the field existed as in-person", () => {
    const legacy = {
      categoryId: VALID_FORM.categoryId,
      title: VALID_FORM.title,
      description: VALID_FORM.description,
      budgetCentavos: 150_000,
      scheduledFor: null,
      sameDay: true,
      landmark: VALID_FORM.landmark,
      cityCode: "104305",
      barangayCode: "104305001",
      approximateLat: VALID_FORM.approximateLat,
      approximateLng: VALID_FORM.approximateLng,
      exactAddress: VALID_FORM.exactAddress,
      exactLat: VALID_FORM.exactLat,
      exactLng: VALID_FORM.exactLng,
      media: [],
    } satisfies DraftTaskInput;
    expect(draftFormFromInput(legacy).locationType).toBe("in_person");
  });
});

describe("removals drop-off", () => {
  it("persists the drop-off instead of discarding it", () => {
    const result = validateTaskDraftForm({
      ...VALID_FORM,
      dropoffLandmark: "Talomo, Davao City",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.dropoffLandmark).toBe("Talomo, Davao City");
  });

  it("treats a blank drop-off as an absence, not an empty label", () => {
    const result = validateTaskDraftForm({ ...VALID_FORM, dropoffLandmark: "   " });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.dropoffLandmark).toBeNull();
  });

  it("trims the stored label", () => {
    const result = validateTaskDraftForm({
      ...VALID_FORM,
      dropoffLandmark: "  Toril, Davao City  ",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.dropoffLandmark).toBe("Toril, Davao City");
  });

  it("round-trips a stored drop-off back into the editable form", () => {
    const draft: DraftTaskInput = {
      categoryId: VALID_FORM.categoryId,
      title: VALID_FORM.title,
      description: VALID_FORM.description,
      budgetCentavos: 150_000,
      scheduledFor: null,
      sameDay: true,
      landmark: VALID_FORM.landmark,
      dropoffLandmark: "Talomo, Davao City",
      cityCode: "104305",
      barangayCode: "104305001",
      approximateLat: VALID_FORM.approximateLat,
      approximateLng: VALID_FORM.approximateLng,
      exactAddress: VALID_FORM.exactAddress,
      exactLat: VALID_FORM.exactLat,
      exactLng: VALID_FORM.exactLng,
      media: [],
    };
    expect(draftFormFromInput(draft).dropoffLandmark).toBe("Talomo, Davao City");
    // A task with no drop-off must come back as an empty field, not "null".
    expect(draftFormFromInput({ ...draft, dropoffLandmark: null }).dropoffLandmark).toBe("");
  });
});
