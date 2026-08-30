import type { BadgeTone } from "@/components/ui/StatusBadge";

export type VerificationDecision = "APPROVED" | "REJECTED" | "RESUBMISSION_REQUIRED";

/**
 * Filterable case statuses in queue order (work first, then closed cases).
 * DRAFT is excluded: an unsubmitted case is not review work.
 */
export const VERIFICATION_STATUS_OPTIONS = [
  "SUBMITTED",
  "IN_REVIEW",
  "RESUBMISSION_REQUIRED",
  "APPROVED",
  "REJECTED",
] as const;

export type VerificationDecisionOption = {
  readonly decision: VerificationDecision;
  readonly label: string;
  readonly title: string;
  readonly description: string;
  readonly emphasis: "primary" | "secondary" | "destructive";
};

export function verificationStatusTone(status: string): BadgeTone {
  switch (status) {
    case "APPROVED":
      return "success";
    case "REJECTED":
      return "error";
    case "RESUBMISSION_REQUIRED":
      return "warning";
    case "IN_REVIEW":
      return "info";
    default:
      return "neutral";
  }
}

export function verificationStatusLabel(status: string): string {
  switch (status) {
    case "SUBMITTED":
      return "Awaiting review";
    case "IN_REVIEW":
      return "In review";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    case "RESUBMISSION_REQUIRED":
      return "Awaiting resubmission";
    default:
      return status;
  }
}

/**
 * True while a case is still part of the queue's workload. APPROVED and
 * REJECTED are final, so elapsed-time figures stop being meaningful for them.
 */
export function isVerificationCaseOpen(status: string): boolean {
  return status !== "APPROVED" && status !== "REJECTED";
}

const APPROVE: VerificationDecisionOption = {
  decision: "APPROVED",
  label: "Approve identity",
  title: "Approve identity verification",
  description:
    "Marks the identity as verified and unlocks marketplace actions that require identity approval. The decision and reason are audited.",
  emphasis: "primary",
};

const REQUEST_DOCUMENTS: VerificationDecisionOption = {
  decision: "RESUBMISSION_REQUIRED",
  label: "Request new documents",
  title: "Request corrected documents",
  description:
    "Returns the case to the applicant with your reason. They can submit corrected documents for a new review.",
  emphasis: "secondary",
};

const REJECT: VerificationDecisionOption = {
  decision: "REJECTED",
  label: "Reject verification",
  title: "Reject identity verification",
  description:
    "Closes this verification case without approving the identity. This is a final decision for the current case.",
  emphasis: "destructive",
};

/**
 * The database accepts decisions only from SUBMITTED or IN_REVIEW. In
 * particular, RESUBMISSION_REQUIRED is waiting on the applicant; rendering the
 * old decision buttons there produced only INVALID_STATE errors (or a same-state
 * no-op), so every surface derives its actions from this function.
 */
export function verificationDecisionsFor(
  status: string,
): ReadonlyArray<VerificationDecisionOption> {
  return status === "SUBMITTED" || status === "IN_REVIEW"
    ? [APPROVE, REQUEST_DOCUMENTS, REJECT]
    : [];
}
