import { beforeEach, describe, expect, it } from "vitest";

// A development-shaped public config must resolve before any module under test
// calls `getAppConfig()`. These mirror `.env.example` (safe placeholders only)
// and never touch the real project — the whole journey runs against the
// deterministic in-memory synthetic repository, with no network or provider I/O.
process.env.EXPO_PUBLIC_DIZKARTE_ENV ??= "development";
process.env.EXPO_PUBLIC_SUPABASE_URL ??= "https://synthetic-test.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??= "synthetic-test-anon-key";
// The factory now defaults to the real Supabase adapter; this journey is the
// deterministic in-memory one, so it opts into the synthetic adapter.
process.env.EXPO_PUBLIC_MARKETPLACE_ADAPTER = "synthetic";

import { __resetAppConfigForTests } from "../../lib/config";
import { isEligibleTasker, isIdentityVerified, type MobileSession } from "../session-types";
import { __resetMarketplaceRepositoryForTests, createMarketplaceRepository } from "./factory";
import type { MobileMarketplacePort } from "./port";

// Synthetic actor ids recognized by the in-memory marketplace repository's
// actor directory (client = ...002, tasker = ...003). The auth layer itself is
// now real Supabase Auth and is exercised by integration tests, not here — this
// suite covers the synthetic marketplace lifecycle in isolation.
const CLIENT_ID = "10000000-0000-4000-8000-000000000002";
const TASKER_ID = "10000000-0000-4000-8000-000000000003";
// A registered-but-unrelated third party (never a booking participant).
const OTHER_USER_ID = "10000000-0000-4000-8000-000000000099";

const clientSession: MobileSession = {
  userId: CLIENT_ID,
  email: "client@dev.dizkarte.invalid",
  displayName: "Maria Santos",
  capabilities: ["CLIENT"],
  accountStatus: "active",
  verificationStatus: "APPROVED",
  taskerApplicationStatus: null,
  synthetic: true,
};

const taskerSession: MobileSession = {
  userId: TASKER_ID,
  email: "tasker@dev.dizkarte.invalid",
  displayName: "Ramon Bautista",
  capabilities: ["TASKER"],
  accountStatus: "active",
  verificationStatus: "APPROVED",
  taskerApplicationStatus: "APPROVED",
  synthetic: true,
};

function draft(overrides: Partial<Parameters<MobileMarketplacePort["saveDraftTask"]>[1]> = {}) {
  return {
    categoryId: "30000000-0000-4000-8000-000000000001",
    title: "Fix leaking sink",
    description: "The kitchen sink has been leaking for two days and needs a repair visit.",
    budgetCentavos: 50000,
    scheduledFor: null,
    sameDay: true,
    landmark: "Near SM North EDSA",
    cityCode: "137404",
    barangayCode: "137404001",
    approximateLat: 14.657,
    approximateLng: 121.032,
    exactAddress: "123 Test Street, Quezon City",
    exactLat: 14.6575,
    exactLng: 121.0322,
    media: [],
    ...overrides,
  };
}

/**
 * End-to-end synthetic lifecycle.
 *
 * Walks one continuous journey and asserts the platform's cross-cutting
 * authority invariants COMPOSE in sequence (the existing unit suite asserts
 * them in isolation): register/sign-in -> identity-verification gate ->
 * publish -> discovery/question/offer -> conflict-safe selection -> payment
 * authority separation (client checkout is never authoritative; only the
 * webhook confirms) -> post-payment unlock of exact address + chat ->
 * completion requested only by the Tasker -> release only by the Client ->
 * blind bilateral reviews -> derived ledger + fail-closed payout ->
 * support-ticket submission. No live payment/map/push behavior is claimed.
 */
describe("Dizkarte synthetic end-to-end lifecycle", () => {
  let repo: MobileMarketplacePort;

  beforeEach(() => {
    __resetAppConfigForTests();
    __resetMarketplaceRepositoryForTests();
    repo = createMarketplaceRepository();
  });

  it("runs register -> verify -> publish -> offer -> pay -> chat -> complete -> review -> support", async () => {
    // --- 1. Capability gates (domain helpers) -------------------------------
    // A brand-new, unverified user is neither identity-verified nor an eligible
    // Tasker — capabilities are always server-issued, never self-asserted.
    const freshSession: MobileSession = {
      userId: "10000000-0000-4000-8000-000000000001",
      email: "brand-new@dev.dizkarte.invalid",
      displayName: "Brand New User",
      capabilities: [],
      accountStatus: "active",
      verificationStatus: "DRAFT",
      taskerApplicationStatus: null,
      synthetic: true,
    };
    expect(isIdentityVerified(freshSession)).toBe(false);
    expect(isEligibleTasker(freshSession)).toBe(false);

    // The verified Client and the approved Tasker pass their respective gates.
    const clientId = clientSession.userId;
    const taskerId = taskerSession.userId;
    expect(isIdentityVerified(clientSession)).toBe(true);
    expect(isEligibleTasker(taskerSession)).toBe(true);

    // --- 2. Task creation and the identity-verification publish gate --------
    const savedTask = await repo.saveDraftTask(clientId, draft());
    expect(savedTask.status).toBe("DRAFT");

    // Before verification/Admin approval, publishing is refused (NOT_VERIFIED)
    // and the task stays a private DRAFT.
    const prematurePublish = await repo.publishTask(savedTask.id, clientId, false);
    expect(prematurePublish.ok).toBe(false);
    if (!prematurePublish.ok) expect(prematurePublish.reason).toBe("NOT_VERIFIED");
    expect((await repo.getOwnedTask(savedTask.id, clientId))?.status).toBe("DRAFT");

    // Once the signed-in Client is verified, the owner may publish.
    const published = await repo.publishTask(
      savedTask.id,
      clientId,
      isIdentityVerified(clientSession),
    );
    if (!published.ok) throw new Error("expected verified publish to succeed");
    const task = published.task;

    // --- 3. Discovery exposes only the approximate public projection -------
    const feed = await repo.searchOpenTasks({ page: 1, pageSize: 100 });
    const feedItem = feed.items.find((i) => i.id === task.id);
    if (!feedItem) throw new Error("expected the published task in the public feed");
    expect("exactAddress" in feedItem).toBe(false);
    expect("exactLat" in feedItem).toBe(false);
    expect("clientId" in feedItem).toBe(false);

    const publicTask = await repo.getPublicTask(task.id);
    expect(publicTask).not.toBeNull();

    // --- 4. Tasker question + offer ----------------------------------------
    const question = await repo.askQuestion(
      task.id,
      taskerId,
      taskerSession.displayName,
      "Is the shut-off valve accessible?",
    );
    expect(question.body).toBe("Is the shut-off valve accessible?");

    const offer = await repo.submitOffer(task.id, taskerId, taskerSession.displayName, {
      amountCentavos: 45000,
      message: "I can fix this today.",
      etaText: "2 hours",
      availabilityText: "This afternoon",
      experienceText: "6 years plumbing experience.",
    });
    expect(offer.status).toBe("SUBMITTED");

    // A Tasker sees only their own offer; the owner sees all; a stranger none.
    expect((await repo.listOffers(task.id, taskerId)).length).toBe(1);
    expect((await repo.listOffers(task.id, clientId)).length).toBe(1);

    // --- 5. Selection + payment authority separation -----------------------
    // Only the owner may select; selection creates a PAYMENT_PENDING booking.
    const selection = await repo.selectOffer(task.id, offer.id, clientId, "e2e-select");
    if (!selection.ok) throw new Error("expected selection to succeed");
    const bookingId = selection.bookingId;

    // Pre-payment: exact address is hidden and no conversation exists yet.
    expect((await repo.getBooking(bookingId, clientId))?.exactAddress).toBeNull();
    expect(await repo.getConversationForBooking(bookingId, clientId)).toBeNull();

    // Client-side checkout completion is NEVER authoritative on its own.
    const checkout = await repo.createCheckoutSession(bookingId, clientId);
    await repo.simulateCheckout(checkout.providerReference, "success");
    expect((await repo.getBooking(bookingId, clientId))?.status).toBe("PAYMENT_PENDING");

    // Only the authoritative webhook step confirms the booking.
    const webhook = await repo.processAuthoritativeWebhook(checkout.providerReference);
    expect(webhook?.status).toBe("CONFIRMED");
    expect((await repo.getBooking(bookingId, clientId))?.status).toBe("CONFIRMED");

    // --- 6. Post-payment unlock: exact address + gated chat ----------------
    expect((await repo.getBooking(bookingId, clientId))?.exactAddress).not.toBeNull();
    const conversation = await repo.getConversationForBooking(bookingId, clientId);
    expect(conversation).not.toBeNull();
    if (!conversation) throw new Error("expected a conversation");

    const message = await repo.sendMessage(conversation.id, clientId, "On my way!", "e2e-msg-1");
    expect(message.deliveryStatus).toBe("sent");
    // A non-participant can never post into the conversation.
    await expect(
      repo.sendMessage(conversation.id, OTHER_USER_ID, "hi", "e2e-intruder"),
    ).rejects.toThrow();

    // --- 7. Completion requested only by Tasker; released only by Client ---
    await repo.startWork(bookingId, taskerId);

    const clientCannotComplete = await repo.requestCompletion(
      { bookingId, note: "done?", evidence: [] },
      clientId,
    );
    expect(clientCannotComplete.ok).toBe(false);

    const taskerCompletes = await repo.requestCompletion(
      {
        bookingId,
        note: "Sink repaired and tested.",
        evidence: [{ kind: "note", note: "No leaks." }],
      },
      taskerId,
    );
    expect(taskerCompletes.ok).toBe(true);

    // The Tasker cannot release funds to themselves.
    const taskerCannotRelease = await repo.confirmCompletion(bookingId, taskerId);
    expect(taskerCannotRelease.ok).toBe(false);

    // Only the Client confirms completion, which releases the held funds.
    const clientReleases = await repo.confirmCompletion(bookingId, clientId);
    expect(clientReleases.ok).toBe(true);
    expect((await repo.getBooking(bookingId, clientId))?.status).toBe("COMPLETED");

    // --- 8. Blind bilateral reviews ----------------------------------------
    await repo.submitReview({ bookingId, score: 5, comment: "Fast and tidy." }, clientId);
    const beforeCounterpart = await repo.getReviewPair(bookingId, clientId);
    expect(beforeCounterpart?.myReview).not.toBeNull();
    expect(beforeCounterpart?.counterpartReview).toBeNull();

    await repo.submitReview({ bookingId, score: 5, comment: "Clear instructions." }, taskerId);
    const afterCounterpart = await repo.getReviewPair(bookingId, clientId);
    expect(afterCounterpart?.counterpartReview).not.toBeNull();
    expect(afterCounterpart?.bothSubmitted).toBe(true);

    // --- 9. Derived ledger + fail-closed payout ----------------------------
    const ledger = await repo.getLedgerSummary(taskerId);
    expect(ledger.derived).toBe(true);
    expect(ledger.availableCentavos).toBeGreaterThan(0);

    // No approved payout provider is configured -> the request fails closed
    // rather than fabricating a payout.
    const withdrawal = await repo.requestWithdrawal(taskerId, ledger.availableCentavos);
    expect(withdrawal.ok).toBe(false);
    if (!withdrawal.ok) expect(withdrawal.reason).toBe("PROVIDER_UNAVAILABLE");

    // --- 10. Support ticket (reporter-scoped) ------------------------------
    await repo.submitSupportTicket({
      reporterId: clientId,
      subjectType: "booking",
      subjectId: bookingId,
      category: "quality",
      narrative: "Wanted to flag a minor follow-up question about the repair.",
      evidence: [],
    });
    expect((await repo.listMySupportTickets(clientId)).length).toBe(1);
    // The ticket is never visible to an unrelated user.
    expect((await repo.listMySupportTickets(taskerId)).length).toBe(0);
  }, 30_000);
});
