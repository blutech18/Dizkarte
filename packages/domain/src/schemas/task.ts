import { z } from "zod";
import { MEDIA_LIMITS, MONEY_LIMITS, TEXT_LIMITS } from "@dizkarte/config";
import {
  approximateLatSchema,
  approximateLngSchema,
  exactLatSchema,
  exactLngSchema,
  isoDateTimeSchema,
  landmarkSchema,
  localityCodeSchema,
  paginationSchema,
} from "./common.js";
import { centavosSchema } from "../money.js";
import { idSchema } from "../ids.js";

/** Task posting, discovery, questions, and offers. */

export const taskMediaKindSchema = z.enum(["image", "video"]);

export const taskMediaSchema = z.object({
  storagePath: z.string().trim().min(1).max(512),
  kind: taskMediaKindSchema,
});

/** Public approximate location — structurally separated from exact address. */
export const publicLocationSchema = z.object({
  cityCode: localityCodeSchema,
  barangayCode: localityCodeSchema,
  landmark: landmarkSchema,
  approximateLat: approximateLatSchema,
  approximateLng: approximateLngSchema,
  /**
   * Where a removals/delivery task ends, at the same public precision as
   * `landmark` — an area label, never a street address. The exact drop-off, if
   * one is ever needed, belongs in the private location alongside
   * `exactAddress`; keeping this field area-level means publishing it cannot
   * leak a second precise address (requirement R4).
   */
  dropoffLandmark: landmarkSchema.nullable().optional(),
});

/** Private exact location — never included in any public projection. */
export const privateLocationSchema = z.object({
  exactAddress: z.string().trim().min(1).max(500),
  exactLat: exactLatSchema,
  exactLng: exactLngSchema,
});

/**
 * Whether the work happens at a place or can be done remotely.
 *
 * An online task still records the Client's own city/barangay: the locality is
 * what makes the task discoverable regionally, and `publicLocationSchema`
 * requires it. What changes is the meaning — for an online task the locality is
 * where the Client is, not where the Tasker must show up.
 */
export const taskLocationTypeSchema = z.enum(["in_person", "online"]);
export type TaskLocationType = z.infer<typeof taskLocationTypeSchema>;

/** Coarse preferred time of day, from the posting wizard's "I need a certain
 * time of day" option. Null/absent means the Client is flexible within the day. */
export const taskTimeOfDaySchema = z.enum(["morning", "midday", "afternoon", "evening"]);
export type TaskTimeOfDay = z.infer<typeof taskTimeOfDaySchema>;

export const createTaskSchema = z.object({
  categoryId: idSchema<"CategoryId">(),
  title: z.string().trim().min(5).max(TEXT_LIMITS.taskTitleMax),
  description: z.string().trim().min(20).max(TEXT_LIMITS.taskDescriptionMax),
  budgetCentavos: centavosSchema({
    min: MONEY_LIMITS.minTaskBudgetCentavos,
    max: MONEY_LIMITS.maxAmountCentavos,
  }),
  scheduledFor: isoDateTimeSchema.optional(),
  sameDay: z.boolean().default(false),
  timeOfDay: taskTimeOfDaySchema.nullable().optional(),
  locationType: taskLocationTypeSchema.default("in_person"),
  publicLocation: publicLocationSchema,
  privateLocation: privateLocationSchema,
  media: z.array(taskMediaSchema).max(MEDIA_LIMITS.maxTaskMediaCount).default([]),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = createTaskSchema.partial().extend({
  taskId: idSchema<"TaskId">(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const publishTaskSchema = z.object({
  taskId: idSchema<"TaskId">(),
});
export type PublishTaskInput = z.infer<typeof publishTaskSchema>;

// --- Discovery / search ---

export const taskSortSchema = z.enum(["newest", "highest_budget", "nearby"]);

export const taskSearchSchema = paginationSchema.extend({
  keyword: z.string().trim().max(120).optional(),
  cityCode: localityCodeSchema.optional(),
  barangayCode: localityCodeSchema.optional(),
  categoryId: idSchema<"CategoryId">().optional(),
  minBudgetCentavos: centavosSchema({ min: 0 }).optional(),
  maxBudgetCentavos: centavosSchema({ min: 0 }).optional(),
  scheduledFrom: isoDateTimeSchema.optional(),
  scheduledTo: isoDateTimeSchema.optional(),
  sameDayOnly: z.boolean().optional(),
  /**
   * Only tasks that have attracted no offer yet.
   *
   * A supply-side filter: it exists so a Tasker can find winnable work, which is
   * why it is not exposed as "hide popular tasks" to Clients.
   */
  noOffersOnly: z.boolean().optional(),
  // Distance filter only applies when a map provider is configured.
  nearLat: approximateLatSchema.optional(),
  nearLng: approximateLngSchema.optional(),
  radiusKm: z.number().min(0.5).max(100).optional(),
  sort: taskSortSchema.default("newest"),
});
export type TaskSearchInput = z.infer<typeof taskSearchSchema>;

// --- Questions ---

export const askQuestionSchema = z.object({
  taskId: idSchema<"TaskId">(),
  body: z.string().trim().min(1).max(TEXT_LIMITS.questionBodyMax),
});
export type AskQuestionInput = z.infer<typeof askQuestionSchema>;

// --- Offers ---

export const submitOfferSchema = z.object({
  taskId: idSchema<"TaskId">(),
  amountCentavos: centavosSchema({
    min: 1,
    max: MONEY_LIMITS.maxAmountCentavos,
  }),
  message: z.string().trim().min(1).max(TEXT_LIMITS.offerMessageMax),
  etaText: z.string().trim().min(1).max(200),
  availabilityText: z.string().trim().min(1).max(200),
  experienceText: z.string().trim().min(1).max(500),
});
export type SubmitOfferInput = z.infer<typeof submitOfferSchema>;
