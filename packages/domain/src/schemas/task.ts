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
});

/** Private exact location — never included in any public projection. */
export const privateLocationSchema = z.object({
  exactAddress: z.string().trim().min(1).max(500),
  exactLat: exactLatSchema,
  exactLng: exactLngSchema,
});

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
