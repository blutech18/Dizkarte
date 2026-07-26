import { z } from "zod";
import { MONEY_LIMITS, TEXT_LIMITS } from "@dizkarte/config";
import { reasonSchema } from "./common.js";
import { centavosSchema } from "../money.js";
import { idempotencyKeySchema, idSchema } from "../ids.js";

/** Withdrawal, refund, and support/report/ticket input schemas. */

export const requestWithdrawalSchema = z.object({
  payoutMethodId: idSchema<"PayoutMethodId">(),
  amountCentavos: centavosSchema({ min: 1, max: MONEY_LIMITS.maxAmountCentavos }),
  idempotencyKey: idempotencyKeySchema,
});
export type RequestWithdrawalInput = z.infer<typeof requestWithdrawalSchema>;

export const adminRefundSchema = z.object({
  paymentIntentId: idSchema<"PaymentIntentId">(),
  amountCentavos: centavosSchema({ min: 1, max: MONEY_LIMITS.maxAmountCentavos }),
  reason: reasonSchema,
  idempotencyKey: idempotencyKeySchema,
});
export type AdminRefundInput = z.infer<typeof adminRefundSchema>;

export const adminFreezeSchema = z.object({
  bookingId: idSchema<"BookingId">(),
  reason: reasonSchema,
  idempotencyKey: idempotencyKeySchema,
});
export type AdminFreezeInput = z.infer<typeof adminFreezeSchema>;

// --- Reports, tickets, disputes assignment ---

export const createReportSchema = z.object({
  resourceType: z.enum(["task", "user", "message", "offer", "booking"]),
  resourceId: z.string().uuid(),
  category: z.enum(["fraud", "harassment", "inappropriate", "safety", "spam", "other"]),
  narrative: z.string().trim().min(10).max(TEXT_LIMITS.taskDescriptionMax),
  evidenceStoragePaths: z.array(z.string().trim().min(1).max(512)).max(10).default([]),
});
export type CreateReportInput = z.infer<typeof createReportSchema>;

export const createSupportTicketSchema = z.object({
  subject: z.string().trim().min(3).max(TEXT_LIMITS.taskTitleMax),
  narrative: z.string().trim().min(10).max(TEXT_LIMITS.taskDescriptionMax),
  category: z.enum(["account", "payment", "task", "safety", "other"]),
});
export type CreateSupportTicketInput = z.infer<typeof createSupportTicketSchema>;

export const ticketMessageSchema = z.object({
  ticketId: idSchema<"SupportTicketId">(),
  body: z.string().trim().min(1).max(TEXT_LIMITS.messageBodyMax),
});
export type TicketMessageInput = z.infer<typeof ticketMessageSchema>;

export const assignCaseSchema = z.object({
  resourceType: z.enum(["report", "dispute", "ticket", "verification"]),
  resourceId: z.string().uuid(),
  assigneeId: idSchema<"UserId">(),
  idempotencyKey: idempotencyKeySchema,
});
export type AssignCaseInput = z.infer<typeof assignCaseSchema>;
