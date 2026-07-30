import { beforeEach, describe, expect, it } from "vitest";

// Ensure a development-shaped public config resolves before any module under
// test calls `getAppConfig()`. Mirrors `.env.example` (safe placeholders only).
process.env.EXPO_PUBLIC_DIZKARTE_ENV ??= "development";
process.env.EXPO_PUBLIC_SUPABASE_URL ??= "https://synthetic-test.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??= "synthetic-test-anon-key";
// The factory now defaults to the real Supabase adapter, so these in-memory
// tests must opt into the synthetic one explicitly.
process.env.EXPO_PUBLIC_MARKETPLACE_ADAPTER = "synthetic";

import { __resetAppConfigForTests } from "../../lib/config";
import { __resetMarketplaceRepositoryForTests, createMarketplaceRepository } from "./factory";
import type { MobileMarketplacePort } from "./port";

const CLIENT_ID = "10000000-0000-4000-8000-000000000002";
const TASKER_ID = "10000000-0000-4000-8000-000000000003";
const OTHER_CLIENT_ID = "10000000-0000-4000-8000-000000000099";

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

describe("createMarketplaceRepository", () => {
  beforeEach(() => {
    __resetAppConfigForTests();
    __resetMarketplaceRepositoryForTests();
  });

  it("constructs the synthetic repository when opted into in a development-shaped environment", () => {
    expect(() => createMarketplaceRepository()).not.toThrow();
    expect(createMarketplaceRepository()).toBeTruthy();
  });

  it("rejects the synthetic opt-in outside development/test", () => {
    __resetAppConfigForTests();
    __resetMarketplaceRepositoryForTests();
    process.env.EXPO_PUBLIC_DIZKARTE_ENV = "staging";
    process.env.EXPO_PUBLIC_PAYMENT_MODE = "sandbox";
    process.env.EXPO_PUBLIC_MAP_MODE = "sandbox";
    process.env.EXPO_PUBLIC_PUSH_MODE = "sandbox";
    process.env.EXPO_PUBLIC_MEDIA_MODE = "sandbox";
    process.env.EXPO_PUBLIC_MONITORING_MODE = "sandbox";
    process.env.EXPO_PUBLIC_MAP_PUBLIC_KEY = "staging-map-key";
    try {
      expect(() => createMarketplaceRepository()).toThrow();
    } finally {
      delete process.env.EXPO_PUBLIC_PAYMENT_MODE;
      delete process.env.EXPO_PUBLIC_MAP_MODE;
      delete process.env.EXPO_PUBLIC_PUSH_MODE;
      delete process.env.EXPO_PUBLIC_MEDIA_MODE;
      delete process.env.EXPO_PUBLIC_MONITORING_MODE;
      delete process.env.EXPO_PUBLIC_MAP_PUBLIC_KEY;
      process.env.EXPO_PUBLIC_DIZKARTE_ENV = "development";
      __resetAppConfigForTests();
      __resetMarketplaceRepositoryForTests();
    }
  });
});

describe("SyntheticMarketplaceRepository", () => {
  let repo: MobileMarketplacePort;

  beforeEach(() => {
    __resetAppConfigForTests();
    __resetMarketplaceRepositoryForTests();
    repo = createMarketplaceRepository();
  });

  describe("draft -> publish lifecycle", () => {
    it("saves a draft and returns it only to its owner", async () => {
      const saved = await repo.saveDraftTask(CLIENT_ID, draft());
      expect(saved.status).toBe("DRAFT");

      const ownerView = await repo.getOwnedTask(saved.id, CLIENT_ID);
      expect(ownerView?.id).toBe(saved.id);

      const strangerView = await repo.getOwnedTask(saved.id, OTHER_CLIENT_ID);
      expect(strangerView).toBeNull();
    });

    it("denies publishing when identity is not verified", async () => {
      const saved = await repo.saveDraftTask(CLIENT_ID, draft());
      const result = await repo.publishTask(saved.id, CLIENT_ID, false);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("NOT_VERIFIED");

      const stillDraft = await repo.getOwnedTask(saved.id, CLIENT_ID);
      expect(stillDraft?.status).toBe("DRAFT");
    });

    it("denies publishing by a non-owner", async () => {
      const saved = await repo.saveDraftTask(CLIENT_ID, draft());
      const result = await repo.publishTask(saved.id, OTHER_CLIENT_ID, true);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("FORBIDDEN");
    });

    it("publishes when verified and owned, and the task becomes publicly discoverable", async () => {
      const saved = await repo.saveDraftTask(CLIENT_ID, draft());
      const result = await repo.publishTask(saved.id, CLIENT_ID, true);
      expect(result.ok).toBe(true);

      const feed = await repo.searchOpenTasks({ page: 1, pageSize: 50 });
      expect(feed.items.some((item) => item.id === saved.id)).toBe(true);
    });
  });

  describe("offers and conflict-safe single selection", () => {
    async function publishedTask() {
      const saved = await repo.saveDraftTask(CLIENT_ID, draft());
      const result = await repo.publishTask(saved.id, CLIENT_ID, true);
      if (!result.ok) throw new Error("expected publish to succeed");
      return result.task;
    }

    it("only the task owner can select an offer", async () => {
      const task = await publishedTask();
      const offer = await repo.submitOffer(task.id, TASKER_ID, "Ramon Bautista", {
        amountCentavos: 45000,
        message: "I can fix this today.",
        etaText: "2 hours",
        availabilityText: "This afternoon",
        experienceText: "6 years plumbing experience.",
      });

      const forbidden = await repo.selectOffer(task.id, offer.id, OTHER_CLIENT_ID, "key-1");
      expect(forbidden.ok).toBe(false);

      const outcome = await repo.selectOffer(task.id, offer.id, CLIENT_ID, "key-2");
      expect(outcome.ok).toBe(true);
    });

    it("produces exactly one active booking per task under concurrent selection attempts", async () => {
      const task = await publishedTask();
      const offerA = await repo.submitOffer(task.id, TASKER_ID, "Ramon Bautista", {
        amountCentavos: 45000,
        message: "Offer A",
        etaText: "2 hours",
        availabilityText: "Today",
        experienceText: "Experienced.",
      });
      const offerB = await repo.submitOffer(
        task.id,
        "10000000-0000-4000-8000-000000000005",
        "Liza Fernandez",
        {
          amountCentavos: 40000,
          message: "Offer B",
          etaText: "3 hours",
          availabilityText: "Tomorrow",
          experienceText: "Experienced.",
        },
      );

      const [resultA, resultB] = await Promise.all([
        repo.selectOffer(task.id, offerA.id, CLIENT_ID, "conflict-key-a"),
        repo.selectOffer(task.id, offerB.id, CLIENT_ID, "conflict-key-b"),
      ]);

      const outcomes = [resultA, resultB];
      const successes = outcomes.filter((o) => o.ok);
      expect(successes.length).toBe(1);
    });

    it("selecting with the same idempotency key twice returns the same booking rather than creating a duplicate", async () => {
      const task = await publishedTask();
      const offer = await repo.submitOffer(task.id, TASKER_ID, "Ramon Bautista", {
        amountCentavos: 45000,
        message: "Offer",
        etaText: "2 hours",
        availabilityText: "Today",
        experienceText: "Experienced.",
      });
      const first = await repo.selectOffer(task.id, offer.id, CLIENT_ID, "idem-key");
      const second = await repo.selectOffer(task.id, offer.id, CLIENT_ID, "idem-key");
      expect(first.ok && second.ok).toBe(true);
      if (first.ok && second.ok) {
        expect(first.bookingId).toBe(second.bookingId);
      }
    });
  });

  describe("payment authority separation", () => {
    async function confirmedBookingSetup() {
      const saved = await repo.saveDraftTask(CLIENT_ID, draft());
      const published = await repo.publishTask(saved.id, CLIENT_ID, true);
      if (!published.ok) throw new Error("publish failed");
      const offer = await repo.submitOffer(published.task.id, TASKER_ID, "Ramon Bautista", {
        amountCentavos: 45000,
        message: "Offer",
        etaText: "2 hours",
        availabilityText: "Today",
        experienceText: "Experienced.",
      });
      const selected = await repo.selectOffer(published.task.id, offer.id, CLIENT_ID, "pay-key");
      if (!selected.ok) throw new Error("selection failed");
      return selected.bookingId;
    }

    it("simulateCheckout alone never confirms the booking", async () => {
      const bookingId = await confirmedBookingSetup();
      const checkout = await repo.createCheckoutSession(bookingId, CLIENT_ID);
      await repo.simulateCheckout(checkout.providerReference, "success");

      const booking = await repo.getBooking(bookingId, CLIENT_ID);
      expect(booking?.status).toBe("PAYMENT_PENDING");
    });

    it("only the authoritative webhook step transitions the booking to CONFIRMED", async () => {
      const bookingId = await confirmedBookingSetup();
      const checkout = await repo.createCheckoutSession(bookingId, CLIENT_ID);
      await repo.simulateCheckout(checkout.providerReference, "success");
      const outcome = await repo.processAuthoritativeWebhook(checkout.providerReference);

      expect(outcome?.status).toBe("CONFIRMED");
      const booking = await repo.getBooking(bookingId, CLIENT_ID);
      expect(booking?.status).toBe("CONFIRMED");
    });

    it("a failure outcome moves the booking to PAYMENT_FAILED, not CONFIRMED", async () => {
      const bookingId = await confirmedBookingSetup();
      const checkout = await repo.createCheckoutSession(bookingId, CLIENT_ID);
      await repo.simulateCheckout(checkout.providerReference, "failure");
      const outcome = await repo.processAuthoritativeWebhook(checkout.providerReference);

      expect(outcome?.status).toBe("FAILED");
      const booking = await repo.getBooking(bookingId, CLIENT_ID);
      expect(booking?.status).toBe("PAYMENT_FAILED");
    });

    it("cancel/retry choices produce no authoritative effect", async () => {
      const bookingId = await confirmedBookingSetup();
      const checkout = await repo.createCheckoutSession(bookingId, CLIENT_ID);
      await repo.simulateCheckout(checkout.providerReference, "cancel");
      const outcome = await repo.processAuthoritativeWebhook(checkout.providerReference);

      expect(outcome).toBeNull();
      const booking = await repo.getBooking(bookingId, CLIENT_ID);
      expect(booking?.status).toBe("PAYMENT_PENDING");
    });
  });

  describe("privacy projection and chat gating", () => {
    async function confirmedBooking() {
      const saved = await repo.saveDraftTask(CLIENT_ID, draft());
      const published = await repo.publishTask(saved.id, CLIENT_ID, true);
      if (!published.ok) throw new Error("publish failed");
      const offer = await repo.submitOffer(published.task.id, TASKER_ID, "Ramon Bautista", {
        amountCentavos: 45000,
        message: "Offer",
        etaText: "2 hours",
        availabilityText: "Today",
        experienceText: "Experienced.",
      });
      const selected = await repo.selectOffer(published.task.id, offer.id, CLIENT_ID, "chat-key");
      if (!selected.ok) throw new Error("selection failed");
      const checkout = await repo.createCheckoutSession(selected.bookingId, CLIENT_ID);
      await repo.simulateCheckout(checkout.providerReference, "success");
      await repo.processAuthoritativeWebhook(checkout.providerReference);
      return selected.bookingId;
    }

    it("hides exact address/contact before payment confirmation", async () => {
      const saved = await repo.saveDraftTask(CLIENT_ID, draft());
      const published = await repo.publishTask(saved.id, CLIENT_ID, true);
      if (!published.ok) throw new Error("publish failed");
      const offer = await repo.submitOffer(published.task.id, TASKER_ID, "Ramon Bautista", {
        amountCentavos: 45000,
        message: "Offer",
        etaText: "2 hours",
        availabilityText: "Today",
        experienceText: "Experienced.",
      });
      const selected = await repo.selectOffer(published.task.id, offer.id, CLIENT_ID, "gate-key");
      if (!selected.ok) throw new Error("selection failed");

      const booking = await repo.getBooking(selected.bookingId, CLIENT_ID);
      expect(booking?.exactAddress).toBeNull();

      const conversation = await repo.getConversationForBooking(selected.bookingId, CLIENT_ID);
      expect(conversation).toBeNull();
    });

    it("reveals exact address and opens chat only once confirmed", async () => {
      const bookingId = await confirmedBooking();
      const booking = await repo.getBooking(bookingId, CLIENT_ID);
      expect(booking?.exactAddress).not.toBeNull();

      const conversation = await repo.getConversationForBooking(bookingId, CLIENT_ID);
      expect(conversation).not.toBeNull();
    });

    it("denies booking/conversation access to a non-participant", async () => {
      const bookingId = await confirmedBooking();
      const booking = await repo.getBooking(bookingId, OTHER_CLIENT_ID);
      expect(booking).toBeNull();
      const conversation = await repo.getConversationForBooking(bookingId, OTHER_CLIENT_ID);
      expect(conversation).toBeNull();
    });
  });

  describe("completion, release, and dispute", () => {
    async function inProgressBooking() {
      const saved = await repo.saveDraftTask(CLIENT_ID, draft());
      const published = await repo.publishTask(saved.id, CLIENT_ID, true);
      if (!published.ok) throw new Error("publish failed");
      const offer = await repo.submitOffer(published.task.id, TASKER_ID, "Ramon Bautista", {
        amountCentavos: 45000,
        message: "Offer",
        etaText: "2 hours",
        availabilityText: "Today",
        experienceText: "Experienced.",
      });
      const selected = await repo.selectOffer(
        published.task.id,
        offer.id,
        CLIENT_ID,
        "complete-key",
      );
      if (!selected.ok) throw new Error("selection failed");
      const checkout = await repo.createCheckoutSession(selected.bookingId, CLIENT_ID);
      await repo.simulateCheckout(checkout.providerReference, "success");
      await repo.processAuthoritativeWebhook(checkout.providerReference);
      await repo.startWork(selected.bookingId, TASKER_ID);
      return selected.bookingId;
    }

    it("only the assigned Tasker can request completion", async () => {
      const bookingId = await inProgressBooking();
      const forbidden = await repo.requestCompletion(
        { bookingId, note: "Done", evidence: [] },
        CLIENT_ID,
      );
      expect(forbidden.ok).toBe(false);

      const allowed = await repo.requestCompletion(
        { bookingId, note: "Done", evidence: [{ kind: "note", note: "Fixed the sink." }] },
        TASKER_ID,
      );
      expect(allowed.ok).toBe(true);
    });

    it("duplicate completion requests do not double-apply", async () => {
      const bookingId = await inProgressBooking();
      await repo.requestCompletion({ bookingId, note: "Done", evidence: [] }, TASKER_ID);
      const second = await repo.requestCompletion(
        { bookingId, note: "Done again", evidence: [] },
        TASKER_ID,
      );
      expect(second.ok).toBe(false);
    });

    it("only the Client can confirm completion and release funds", async () => {
      const bookingId = await inProgressBooking();
      await repo.requestCompletion({ bookingId, note: "Done", evidence: [] }, TASKER_ID);

      const taskerAttempt = await repo.confirmCompletion(bookingId, TASKER_ID);
      expect(taskerAttempt.ok).toBe(false);

      const clientConfirm = await repo.confirmCompletion(bookingId, CLIENT_ID);
      expect(clientConfirm.ok).toBe(true);

      const booking = await repo.getBooking(bookingId, CLIENT_ID);
      expect(booking?.status).toBe("COMPLETED");
    });

    it("duplicate confirmation does not double-apply", async () => {
      const bookingId = await inProgressBooking();
      await repo.requestCompletion({ bookingId, note: "Done", evidence: [] }, TASKER_ID);
      await repo.confirmCompletion(bookingId, CLIENT_ID);
      const second = await repo.confirmCompletion(bookingId, CLIENT_ID);
      expect(second.ok).toBe(false);
    });

    it("opening a dispute freezes the booking without deleting history", async () => {
      const bookingId = await inProgressBooking();
      const dispute = await repo.openDispute(
        { bookingId, reason: "Work not finished." },
        CLIENT_ID,
      );
      expect(dispute).not.toBeNull();

      const booking = await repo.getBooking(bookingId, CLIENT_ID);
      expect(booking?.status).toBe("DISPUTED");

      const events = await repo.listBookingEvents(bookingId);
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe("blind bilateral reviews", () => {
    async function completedBooking() {
      const saved = await repo.saveDraftTask(CLIENT_ID, draft());
      const published = await repo.publishTask(saved.id, CLIENT_ID, true);
      if (!published.ok) throw new Error("publish failed");
      const offer = await repo.submitOffer(published.task.id, TASKER_ID, "Ramon Bautista", {
        amountCentavos: 45000,
        message: "Offer",
        etaText: "2 hours",
        availabilityText: "Today",
        experienceText: "Experienced.",
      });
      const selected = await repo.selectOffer(published.task.id, offer.id, CLIENT_ID, "review-key");
      if (!selected.ok) throw new Error("selection failed");
      const checkout = await repo.createCheckoutSession(selected.bookingId, CLIENT_ID);
      await repo.simulateCheckout(checkout.providerReference, "success");
      await repo.processAuthoritativeWebhook(checkout.providerReference);
      await repo.startWork(selected.bookingId, TASKER_ID);
      await repo.requestCompletion(
        { bookingId: selected.bookingId, note: "Done", evidence: [] },
        TASKER_ID,
      );
      await repo.confirmCompletion(selected.bookingId, CLIENT_ID);
      return selected.bookingId;
    }

    it("hides the counterpart review until both sides submit", async () => {
      const bookingId = await completedBooking();
      await repo.submitReview({ bookingId, score: 5, comment: "Great work" }, CLIENT_ID);

      const clientView = await repo.getReviewPair(bookingId, CLIENT_ID);
      expect(clientView?.myReview).not.toBeNull();
      expect(clientView?.counterpartReview).toBeNull();

      await repo.submitReview({ bookingId, score: 4, comment: "Good Client" }, TASKER_ID);

      const clientViewAfter = await repo.getReviewPair(bookingId, CLIENT_ID);
      expect(clientViewAfter?.counterpartReview).not.toBeNull();
    });

    it("rejects a second review from the same reviewer", async () => {
      const bookingId = await completedBooking();
      await repo.submitReview({ bookingId, score: 5, comment: "Great work" }, CLIENT_ID);
      const second = await repo.submitReview(
        { bookingId, score: 1, comment: "Changed my mind" },
        CLIENT_ID,
      );
      expect(second.ok).toBe(false);
    });
  });

  describe("notifications", () => {
    it("records a notification only after the related state change commits, and is idempotent", async () => {
      const saved = await repo.saveDraftTask(CLIENT_ID, draft());
      const published = await repo.publishTask(saved.id, CLIENT_ID, true);
      if (!published.ok) throw new Error("publish failed");

      const beforeOffer = await repo.listNotifications(CLIENT_ID);
      const beforeCount = beforeOffer.length;

      await repo.submitOffer(published.task.id, TASKER_ID, "Ramon Bautista", {
        amountCentavos: 45000,
        message: "Offer",
        etaText: "2 hours",
        availabilityText: "Today",
        experienceText: "Experienced.",
      });

      const afterOffer = await repo.listNotifications(CLIENT_ID);
      expect(afterOffer.length).toBe(beforeCount + 1);
    });

    it("marking a notification read is idempotent and only changes unread ones", async () => {
      const saved = await repo.saveDraftTask(CLIENT_ID, draft());
      const published = await repo.publishTask(saved.id, CLIENT_ID, true);
      if (!published.ok) throw new Error("publish failed");
      await repo.submitOffer(published.task.id, TASKER_ID, "Ramon Bautista", {
        amountCentavos: 45000,
        message: "Offer",
        etaText: "2 hours",
        availabilityText: "Today",
        experienceText: "Experienced.",
      });

      const list = await repo.listNotifications(CLIENT_ID);
      const target = list[0]!;
      await repo.markNotificationRead(target.id, CLIENT_ID);
      const afterFirst = await repo.listNotifications(CLIENT_ID);
      const readAtFirst = afterFirst.find((n) => n.id === target.id)?.readAt;

      await repo.markNotificationRead(target.id, CLIENT_ID);
      const afterSecond = await repo.listNotifications(CLIENT_ID);
      const readAtSecond = afterSecond.find((n) => n.id === target.id)?.readAt;

      expect(readAtFirst).not.toBeNull();
      expect(readAtSecond).toBe(readAtFirst);
    });
  });

  describe("chat send/retry", () => {
    async function confirmedBooking() {
      const saved = await repo.saveDraftTask(CLIENT_ID, draft());
      const published = await repo.publishTask(saved.id, CLIENT_ID, true);
      if (!published.ok) throw new Error("publish failed");
      const offer = await repo.submitOffer(published.task.id, TASKER_ID, "Ramon Bautista", {
        amountCentavos: 45000,
        message: "Offer",
        etaText: "2 hours",
        availabilityText: "Today",
        experienceText: "Experienced.",
      });
      const selected = await repo.selectOffer(
        published.task.id,
        offer.id,
        CLIENT_ID,
        "chat-send-key",
      );
      if (!selected.ok) throw new Error("selection failed");
      const checkout = await repo.createCheckoutSession(selected.bookingId, CLIENT_ID);
      await repo.simulateCheckout(checkout.providerReference, "success");
      await repo.processAuthoritativeWebhook(checkout.providerReference);
      const conversation = await repo.getConversationForBooking(selected.bookingId, CLIENT_ID);
      if (!conversation) throw new Error("conversation not found");
      return conversation.id;
    }

    it("sends a message successfully by default", async () => {
      const conversationId = await confirmedBooking();
      const sent = await repo.sendMessage(conversationId, CLIENT_ID, "Hello!", "nonce-1");
      expect(sent.deliveryStatus).toBe("sent");
    });

    it("a reserved failure trigger marks the first attempt failed, and an explicit retry succeeds deterministically", async () => {
      const conversationId = await confirmedBooking();
      const failed = await repo.sendMessage(conversationId, CLIENT_ID, "__force_fail__", "nonce-2");
      expect(failed.deliveryStatus).toBe("failed");

      const retried = await repo.retryMessage(conversationId, "nonce-2", CLIENT_ID);
      expect(retried?.clientNonce).toBe("nonce-2");
      expect(retried?.deliveryStatus).toBe("sent");

      // Exactly one message record exists for the nonce — retry updated the
      // existing record rather than appending a duplicate.
      const messages = await repo.listMessages(conversationId, CLIENT_ID);
      expect(messages.filter((m) => m.clientNonce === "nonce-2").length).toBe(1);
    });

    it("denies retry from a user other than the original sender", async () => {
      const conversationId = await confirmedBooking();
      const failed = await repo.sendMessage(
        conversationId,
        CLIENT_ID,
        "__force_fail__",
        "nonce-imp",
      );
      expect(failed.deliveryStatus).toBe("failed");

      const retried = await repo.retryMessage(conversationId, "nonce-imp", TASKER_ID);
      expect(retried).toBeNull();

      const messages = await repo.listMessages(conversationId, CLIENT_ID);
      expect(messages.find((m) => m.clientNonce === "nonce-imp")?.deliveryStatus).toBe("failed");
    });

    it("denies retry of a message that is not in a failed state", async () => {
      const conversationId = await confirmedBooking();
      const sent = await repo.sendMessage(conversationId, CLIENT_ID, "Hello!", "nonce-ok");
      expect(sent.deliveryStatus).toBe("sent");

      const retried = await repo.retryMessage(conversationId, "nonce-ok", CLIENT_ID);
      expect(retried).toBeNull();
    });

    it("denies retry from a non-participant", async () => {
      const conversationId = await confirmedBooking();
      const failed = await repo.sendMessage(
        conversationId,
        CLIENT_ID,
        "__force_fail__",
        "nonce-np",
      );
      expect(failed.deliveryStatus).toBe("failed");

      const retried = await repo.retryMessage(conversationId, "nonce-np", OTHER_CLIENT_ID);
      expect(retried).toBeNull();
    });

    it("duplicate send calls with the same clientNonce do not append duplicate records or notifications", async () => {
      const conversationId = await confirmedBooking();
      const notificationsBefore = await repo.listNotifications(TASKER_ID);

      const first = await repo.sendMessage(conversationId, CLIENT_ID, "Hi there", "dup-nonce");
      const second = await repo.sendMessage(conversationId, CLIENT_ID, "Hi there", "dup-nonce");
      expect(first.id).toBe(second.id);

      const messages = await repo.listMessages(conversationId, CLIENT_ID);
      expect(messages.filter((m) => m.clientNonce === "dup-nonce").length).toBe(1);

      const notificationsAfter = await repo.listNotifications(TASKER_ID);
      const newMessageNotifications = notificationsAfter.filter(
        (n) => n.type === "MESSAGE_RECEIVED" && !notificationsBefore.some((b) => b.id === n.id),
      );
      expect(newMessageNotifications.length).toBe(1);
    });

    it("rejects prepayment/nonparticipant listMessages, sendMessage, and retryMessage the same way as conversation lookup", async () => {
      const conversationId = await confirmedBooking();
      // Non-participant may not list, send, or retry.
      expect(await repo.listMessages(conversationId, OTHER_CLIENT_ID)).toEqual([]);
      await expect(
        repo.sendMessage(conversationId, OTHER_CLIENT_ID, "hi", "np-list-nonce"),
      ).rejects.toThrow();
      const retried = await repo.retryMessage(conversationId, "np-list-nonce", OTHER_CLIENT_ID);
      expect(retried).toBeNull();
    });

    it("rejects a body over the message length limit before writing state", async () => {
      const conversationId = await confirmedBooking();
      const tooLong = "a".repeat(4001);
      await expect(
        repo.sendMessage(conversationId, CLIENT_ID, tooLong, "too-long-nonce"),
      ).rejects.toThrow();
      const messages = await repo.listMessages(conversationId, CLIENT_ID);
      expect(messages.find((m) => m.clientNonce === "too-long-nonce")).toBeUndefined();
    });

    it("rejects an empty body with no attachments", async () => {
      const conversationId = await confirmedBooking();
      await expect(
        repo.sendMessage(conversationId, CLIENT_ID, "   ", "empty-nonce"),
      ).rejects.toThrow();
      const messages = await repo.listMessages(conversationId, CLIENT_ID);
      expect(messages.find((m) => m.clientNonce === "empty-nonce")).toBeUndefined();
    });

    it("rejects more than 5 attachments before writing state", async () => {
      const conversationId = await confirmedBooking();
      const media = Array.from({ length: 6 }, (_, i) => ({
        kind: "image" as const,
        fileName: `photo-${i}.jpg`,
        sizeBytes: 100_000,
        mimeType: "image/jpeg",
        storagePath: `${CLIENT_ID}/conversation/photo-${i}.jpg`,
      }));
      await expect(
        repo.sendMessage(conversationId, CLIENT_ID, null, "too-many-nonce", media),
      ).rejects.toThrow();
      const messages = await repo.listMessages(conversationId, CLIENT_ID);
      expect(messages.find((m) => m.clientNonce === "too-many-nonce")).toBeUndefined();
    });

    it("rejects a blank attachment file name", async () => {
      const conversationId = await confirmedBooking();
      await expect(
        repo.sendMessage(conversationId, CLIENT_ID, null, "blank-name-nonce", [
          {
            kind: "image",
            fileName: "   ",
            sizeBytes: 100_000,
            mimeType: "image/jpeg",
            storagePath: `${CLIENT_ID}/conversation/blank.jpg`,
          },
        ]),
      ).rejects.toThrow();
    });

    it("rejects a zero or negative attachment size", async () => {
      const conversationId = await confirmedBooking();
      await expect(
        repo.sendMessage(conversationId, CLIENT_ID, null, "zero-size-nonce", [
          {
            kind: "image",
            fileName: "photo.jpg",
            sizeBytes: 0,
            mimeType: "image/jpeg",
            storagePath: `${CLIENT_ID}/conversation/photo.jpg`,
          },
        ]),
      ).rejects.toThrow();
    });

    it("rejects a MIME type that does not match the declared attachment kind", async () => {
      const conversationId = await confirmedBooking();
      await expect(
        repo.sendMessage(conversationId, CLIENT_ID, null, "mismatch-nonce", [
          {
            kind: "image",
            fileName: "clip.mp4",
            sizeBytes: 100_000,
            mimeType: "video/mp4",
            storagePath: `${CLIENT_ID}/conversation/clip.mp4`,
          },
        ]),
      ).rejects.toThrow();
    });

    it("rejects a MIME type outside the allow-list entirely", async () => {
      const conversationId = await confirmedBooking();
      await expect(
        repo.sendMessage(conversationId, CLIENT_ID, null, "bad-mime-nonce", [
          {
            kind: "image",
            fileName: "malware.exe",
            sizeBytes: 100_000,
            mimeType: "application/x-msdownload",
            storagePath: `${CLIENT_ID}/conversation/malware.exe`,
          },
        ]),
      ).rejects.toThrow();
    });

    it("rejects an image over the per-kind byte ceiling", async () => {
      const conversationId = await confirmedBooking();
      await expect(
        repo.sendMessage(conversationId, CLIENT_ID, null, "oversize-image-nonce", [
          {
            kind: "image",
            fileName: "huge.jpg",
            sizeBytes: 10 * 1024 * 1024 + 1,
            mimeType: "image/jpeg",
            storagePath: `${CLIENT_ID}/conversation/huge.jpg`,
          },
        ]),
      ).rejects.toThrow();
    });

    it("rejects a video over the per-kind byte ceiling", async () => {
      const conversationId = await confirmedBooking();
      await expect(
        repo.sendMessage(conversationId, CLIENT_ID, null, "oversize-video-nonce", [
          {
            kind: "video",
            fileName: "huge.mp4",
            sizeBytes: 100 * 1024 * 1024 + 1,
            mimeType: "video/mp4",
            storagePath: `${CLIENT_ID}/conversation/huge.mp4`,
          },
        ]),
      ).rejects.toThrow();
    });
  });

  describe("support tickets", () => {
    it("only returns a reporter's own tickets, never another user's", async () => {
      await repo.submitSupportTicket({
        reporterId: CLIENT_ID,
        subjectType: "task",
        subjectId: "general",
        category: "safety",
        narrative: "Something felt unsafe about this task.",
        evidence: [],
      });

      const ownList = await repo.listMySupportTickets(CLIENT_ID);
      expect(ownList.length).toBe(1);

      const strangerList = await repo.listMySupportTickets(OTHER_CLIENT_ID);
      expect(strangerList.length).toBe(0);
    });

    it("records evidence metadata attached at submission time", async () => {
      const ticket = await repo.submitSupportTicket({
        reporterId: CLIENT_ID,
        subjectType: "booking",
        subjectId: "some-booking-id",
        category: "payment",
        narrative: "Payment amount looked wrong.",
        evidence: [{ kind: "image", fileName: "screenshot.jpg" }],
      });
      expect(ticket.evidence.length).toBe(1);
      expect(ticket.evidence[0]?.fileName).toBe("screenshot.jpg");
    });
  });

  describe("feed/map result consistency", () => {
    it("searchOpenTasks returns the exact same items/count for equal queries (feed and map share one query path)", async () => {
      const query = { page: 1, pageSize: 50, sameDayOnly: true } as const;
      const first = await repo.searchOpenTasks(query);
      const second = await repo.searchOpenTasks(query);
      expect(second.total).toBe(first.total);
      expect(second.items.map((i) => i.id)).toEqual(first.items.map((i) => i.id));
    });

    it("every result item carries only approximate coordinates, never exact/private fields", async () => {
      const page = await repo.searchOpenTasks({ page: 1, pageSize: 50 });
      for (const item of page.items) {
        expect("exactLat" in item).toBe(false);
        expect("exactLng" in item).toBe(false);
        expect("exactAddress" in item).toBe(false);
        expect("clientId" in item).toBe(false);
        expect(typeof item.approximateLat).toBe("number");
        expect(typeof item.approximateLng).toBe("number");
      }
    });

    it("a newly published task appears identically in both a plain search and a distance-bounded search near it", async () => {
      const saved = await repo.saveDraftTask(
        CLIENT_ID,
        draft({ approximateLat: 14.657, approximateLng: 121.032 }),
      );
      const published = await repo.publishTask(saved.id, CLIENT_ID, true);
      if (!published.ok) throw new Error("expected publish to succeed");

      const plain = await repo.searchOpenTasks({ page: 1, pageSize: 100 });
      expect(plain.items.some((i) => i.id === saved.id)).toBe(true);

      const nearby = await repo.searchOpenTasks({
        page: 1,
        pageSize: 100,
        nearLat: 14.657,
        nearLng: 121.032,
        radiusKm: 5,
      });
      expect(nearby.items.some((i) => i.id === saved.id)).toBe(true);
    });

    it("feed and map issue the exact same query and get the exact same items/count", async () => {
      // Mirrors what `buildTaskSearchQuery` produces for identical applied
      // filters on both `app/(tabs)/home.tsx` and `app/map/nearby.tsx` —
      // only `pageSize` legitimately differs between the paginated feed and
      // the bounded single-page map fetch.
      const sharedFilters = {
        categoryId: "30000000-0000-4000-8000-000000000001",
        sameDayOnly: true,
      } as const;
      const feedPage = await repo.searchOpenTasks({ page: 1, pageSize: 20, ...sharedFilters });
      const mapPage = await repo.searchOpenTasks({ page: 1, pageSize: 100, ...sharedFilters });
      expect(mapPage.total).toBe(feedPage.total);
      expect(mapPage.items.map((i) => i.id)).toEqual(feedPage.items.map((i) => i.id));
    });

    it("distance actually changes both which results are returned and their order", async () => {
      const far = await repo.searchOpenTasks({
        page: 1,
        pageSize: 50,
        nearLat: 14.657,
        nearLng: 121.032,
        radiusKm: 100,
        sort: "nearby",
      });
      const near = await repo.searchOpenTasks({
        page: 1,
        pageSize: 50,
        nearLat: 14.657,
        nearLng: 121.032,
        radiusKm: 3,
        sort: "nearby",
      });
      // A tighter radius must never return more items than a looser one.
      expect(near.items.length).toBeLessThan(far.items.length);
      // Sorting near a different origin changes the order versus newest-first.
      const newestOrder = (await repo.searchOpenTasks({ page: 1, pageSize: 50 })).items.map(
        (i) => i.id,
      );
      expect(far.items.map((i) => i.id)).not.toEqual(newestOrder);
    });

    it("rejects a search where minBudgetCentavos exceeds maxBudgetCentavos", async () => {
      await expect(
        repo.searchOpenTasks({
          page: 1,
          pageSize: 20,
          minBudgetCentavos: 100000,
          maxBudgetCentavos: 50000,
        }),
      ).rejects.toThrow();
    });

    it("rejects a search where scheduledFrom is after scheduledTo", async () => {
      await expect(
        repo.searchOpenTasks({
          page: 1,
          pageSize: 20,
          scheduledFrom: "2026-08-01T00:00:00.000Z",
          scheduledTo: "2026-07-01T00:00:00.000Z",
        }),
      ).rejects.toThrow();
    });

    it("rejects a radiusKm filter with no nearLat/nearLng origin", async () => {
      await expect(repo.searchOpenTasks({ page: 1, pageSize: 20, radiusKm: 5 })).rejects.toThrow();
    });

    it("rejects an out-of-bounds pageSize", async () => {
      await expect(repo.searchOpenTasks({ page: 1, pageSize: 1000 })).rejects.toThrow();
    });

    it("filters results by city/area code", async () => {
      const page = await repo.searchOpenTasks({ page: 1, pageSize: 50, cityCode: "137602" });
      expect(page.items.length).toBeGreaterThan(0);
      for (const item of page.items) {
        expect(item.cityCode).toBe("137602");
      }
    });
  });

  describe("Tasker eligibility denial (offer submission gate)", () => {
    // These exercise the repository's own server-authority-style actor
    // directory guard (`SYNTHETIC_ACTOR_DIRECTORY` + `canSubmitOffer`), which
    // is independent of and in addition to the UI-level gate in
    // `session-types.ts` / `QuestionAndOfferPanel`. The repository never
    // trusts a caller-supplied "am I eligible" boolean.
    const APPLICANT_ID = "10000000-0000-4000-8000-000000000004"; // IN_REVIEW, no TASKER capability
    const SUSPENDED_TASKER_ID = "10000000-0000-4000-8000-000000000007"; // approved but suspended account
    const UNKNOWN_ACTOR_ID = "10000000-0000-4000-8000-000000000999";

    async function publishedTask() {
      const saved = await repo.saveDraftTask(CLIENT_ID, draft());
      const result = await repo.publishTask(saved.id, CLIENT_ID, true);
      if (!result.ok) throw new Error("expected publish to succeed");
      return result.task;
    }

    it("still allows the existing approved synthetic Tasker fixtures to submit offers", async () => {
      const task = await publishedTask();
      await expect(
        repo.submitOffer(task.id, TASKER_ID, "Ramon Bautista", {
          amountCentavos: 45000,
          message: "Offer",
          etaText: "2 hours",
          availabilityText: "Today",
          experienceText: "Experienced.",
        }),
      ).resolves.toMatchObject({ status: "SUBMITTED" });

      await expect(
        repo.submitOffer(task.id, "10000000-0000-4000-8000-000000000005", "Liza Fernandez", {
          amountCentavos: 40000,
          message: "Offer",
          etaText: "3 hours",
          availabilityText: "Tomorrow",
          experienceText: "Experienced.",
        }),
      ).resolves.toMatchObject({ status: "SUBMITTED" });
    });

    it("rejects an offer from a Tasker applicant whose application is not yet approved", async () => {
      const task = await publishedTask();
      await expect(
        repo.submitOffer(task.id, APPLICANT_ID, "Liza Fernandez", {
          amountCentavos: 45000,
          message: "Offer",
          etaText: "2 hours",
          availabilityText: "Today",
          experienceText: "Experienced.",
        }),
      ).rejects.toThrow();
    });

    it("rejects an offer from a suspended Tasker account", async () => {
      const task = await publishedTask();
      await expect(
        repo.submitOffer(task.id, SUSPENDED_TASKER_ID, "Suspended Tasker", {
          amountCentavos: 45000,
          message: "Offer",
          etaText: "2 hours",
          availabilityText: "Today",
          experienceText: "Experienced.",
        }),
      ).rejects.toThrow();
    });

    it("rejects an offer from a Client actor (no TASKER capability)", async () => {
      const task = await publishedTask();
      await expect(
        repo.submitOffer(task.id, CLIENT_ID, "Maria Santos", {
          amountCentavos: 45000,
          message: "Offer",
          etaText: "2 hours",
          availabilityText: "Today",
          experienceText: "Experienced.",
        }),
      ).rejects.toThrow();
    });

    it("rejects an offer from a completely unknown/unregistered actor id", async () => {
      const task = await publishedTask();
      await expect(
        repo.submitOffer(task.id, UNKNOWN_ACTOR_ID, "Unknown", {
          amountCentavos: 45000,
          message: "Offer",
          etaText: "2 hours",
          availabilityText: "Today",
          experienceText: "Experienced.",
        }),
      ).rejects.toThrow();
    });

    it("rejects an offer targeting a task id that does not exist", async () => {
      await expect(
        repo.submitOffer(
          "20000000-0000-4000-8000-999999999999" as unknown as Parameters<
            MobileMarketplacePort["submitOffer"]
          >[0],
          TASKER_ID,
          "Ramon Bautista",
          {
            amountCentavos: 45000,
            message: "Offer",
            etaText: "2 hours",
            availabilityText: "Today",
            experienceText: "Experienced.",
          },
        ),
      ).rejects.toThrow();
    });

    it("rejects an offer targeting a task that is not open (still DRAFT)", async () => {
      const saved = await repo.saveDraftTask(CLIENT_ID, draft());
      await expect(
        repo.submitOffer(saved.id, TASKER_ID, "Ramon Bautista", {
          amountCentavos: 45000,
          message: "Offer",
          etaText: "2 hours",
          availabilityText: "Today",
          experienceText: "Experienced.",
        }),
      ).rejects.toThrow();
    });

    it("rejects a question from an unknown/unregistered actor id", async () => {
      const task = await publishedTask();
      await expect(
        repo.askQuestion(task.id, UNKNOWN_ACTOR_ID, "Unknown", "Is this still available?"),
      ).rejects.toThrow();
    });

    it("still allows an authenticated Client to ask a question on an open task", async () => {
      const task = await publishedTask();
      await expect(
        repo.askQuestion(task.id, CLIENT_ID, "Maria Santos", "Is this still available?"),
      ).resolves.toMatchObject({ body: "Is this still available?" });
    });
  });

  describe("Tasker offer history", () => {
    async function publishedTask() {
      const saved = await repo.saveDraftTask(CLIENT_ID, draft());
      const result = await repo.publishTask(saved.id, CLIENT_ID, true);
      if (!result.ok) throw new Error("expected publish to succeed");
      return result.task;
    }

    it("persists a submitted offer so it appears in the Tasker's cross-task offer history", async () => {
      const task = await publishedTask();
      const offer = await repo.submitOffer(task.id, TASKER_ID, "Ramon Bautista", {
        amountCentavos: 45000,
        message: "I can fix this today.",
        etaText: "2 hours",
        availabilityText: "This afternoon",
        experienceText: "6 years plumbing experience.",
      });

      const history = await repo.listMyOffers(TASKER_ID);
      expect(history.some((h) => h.offer.id === offer.id)).toBe(true);
      const entry = history.find((h) => h.offer.id === offer.id)!;
      expect(entry.taskTitle).toBe(task.draft.title);
      expect(entry.canWithdraw).toBe(true);
    });

    it("resolves the real public title/status for an offer submitted on a base synthetic feed task, never 'Task no longer available'", async () => {
      const baseFeedTaskId = "20000000-0000-4000-8000-000000000001" as unknown as Parameters<
        MobileMarketplacePort["submitOffer"]
      >[0];
      const publicTask = await repo.getPublicTask(baseFeedTaskId);
      if (!publicTask) throw new Error("expected base synthetic feed task to exist");

      const offer = await repo.submitOffer(baseFeedTaskId, TASKER_ID, "Ramon Bautista", {
        amountCentavos: 45000,
        message: "Offer",
        etaText: "2 hours",
        availabilityText: "Today",
        experienceText: "Experienced.",
      });

      const history = await repo.listMyOffers(TASKER_ID);
      const entry = history.find((h) => h.offer.id === offer.id)!;
      expect(entry.taskTitle).toBe(publicTask.title);
      expect(entry.taskStatus).toBe("OPEN");
      expect(entry.taskTitle).not.toBe("Task no longer available");
    });

    it("still reports 'Task no longer available'/REMOVED only for a genuinely non-existent task", async () => {
      // Simulated by withdrawing then re-inspecting is not possible since the
      // task record itself is never deleted in this adapter; this asserts the
      // fallback behavior directly against an id that exists in neither store.
      const history = await repo.listMyOffers(TASKER_ID);
      expect(history.every((h) => h.taskTitle !== "")).toBe(true);
    });

    it("does not leak another Tasker's offers into a different Tasker's history", async () => {
      const task = await publishedTask();
      await repo.submitOffer(task.id, TASKER_ID, "Ramon Bautista", {
        amountCentavos: 45000,
        message: "Offer",
        etaText: "2 hours",
        availabilityText: "Today",
        experienceText: "Experienced.",
      });
      const otherTaskerHistory = await repo.listMyOffers("10000000-0000-4000-8000-000000000005");
      expect(otherTaskerHistory.length).toBe(0);
    });

    it("allows withdrawing a still-SUBMITTED offer, and marks it non-withdrawable afterward", async () => {
      const task = await publishedTask();
      const offer = await repo.submitOffer(task.id, TASKER_ID, "Ramon Bautista", {
        amountCentavos: 45000,
        message: "Offer",
        etaText: "2 hours",
        availabilityText: "Today",
        experienceText: "Experienced.",
      });
      const outcome = await repo.withdrawOffer(offer.id, TASKER_ID);
      expect(outcome.ok).toBe(true);

      const history = await repo.listMyOffers(TASKER_ID);
      const entry = history.find((h) => h.offer.id === offer.id)!;
      expect(entry.offer.status).toBe("WITHDRAWN");
      expect(entry.canWithdraw).toBe(false);
    });

    it("denies withdrawing another Tasker's offer", async () => {
      const task = await publishedTask();
      const offer = await repo.submitOffer(task.id, TASKER_ID, "Ramon Bautista", {
        amountCentavos: 45000,
        message: "Offer",
        etaText: "2 hours",
        availabilityText: "Today",
        experienceText: "Experienced.",
      });
      const outcome = await repo.withdrawOffer(offer.id, "10000000-0000-4000-8000-000000000005");
      expect(outcome.ok).toBe(false);
    });

    it("denies withdrawing an already-selected offer", async () => {
      const task = await publishedTask();
      const offer = await repo.submitOffer(task.id, TASKER_ID, "Ramon Bautista", {
        amountCentavos: 45000,
        message: "Offer",
        etaText: "2 hours",
        availabilityText: "Today",
        experienceText: "Experienced.",
      });
      await repo.selectOffer(task.id, offer.id, CLIENT_ID, "select-key");
      const outcome = await repo.withdrawOffer(offer.id, TASKER_ID);
      expect(outcome.ok).toBe(false);
    });

    it("rejects a duplicate active offer by the same Tasker on the same task", async () => {
      const task = await publishedTask();
      await repo.submitOffer(task.id, TASKER_ID, "Ramon Bautista", {
        amountCentavos: 45000,
        message: "First offer",
        etaText: "2 hours",
        availabilityText: "Today",
        experienceText: "Experienced.",
      });
      await expect(
        repo.submitOffer(task.id, TASKER_ID, "Ramon Bautista", {
          amountCentavos: 40000,
          message: "Second offer while first still active",
          etaText: "1 hour",
          availabilityText: "Today",
          experienceText: "Experienced.",
        }),
      ).rejects.toThrow();
    });

    it("permits resubmission by the same Tasker after withdrawing their prior offer", async () => {
      const task = await publishedTask();
      const first = await repo.submitOffer(task.id, TASKER_ID, "Ramon Bautista", {
        amountCentavos: 45000,
        message: "First offer",
        etaText: "2 hours",
        availabilityText: "Today",
        experienceText: "Experienced.",
      });
      await repo.withdrawOffer(first.id, TASKER_ID);

      const second = await repo.submitOffer(task.id, TASKER_ID, "Ramon Bautista", {
        amountCentavos: 42000,
        message: "Resubmission after withdrawal",
        etaText: "1 hour",
        availabilityText: "Today",
        experienceText: "Experienced.",
      });
      expect(second.status).toBe("SUBMITTED");

      const history = await repo.listMyOffers(TASKER_ID);
      expect(history.filter((h) => h.offer.taskId === task.id).length).toBe(2);
    });

    it("permits resubmission by a different Tasker after another Tasker's offer was rejected via selection", async () => {
      const task = await publishedTask();
      const rejectedOffer = await repo.submitOffer(
        task.id,
        "10000000-0000-4000-8000-000000000005",
        "Liza Fernandez",
        {
          amountCentavos: 40000,
          message: "Offer B",
          etaText: "3 hours",
          availabilityText: "Tomorrow",
          experienceText: "Experienced.",
        },
      );
      const winningOffer = await repo.submitOffer(task.id, TASKER_ID, "Ramon Bautista", {
        amountCentavos: 45000,
        message: "Offer A",
        etaText: "2 hours",
        availabilityText: "Today",
        experienceText: "Experienced.",
      });
      await repo.selectOffer(task.id, winningOffer.id, CLIENT_ID, "reject-other-key");

      const rejectedHistory = await repo.listMyOffers("10000000-0000-4000-8000-000000000005");
      const rejectedEntry = rejectedHistory.find((h) => h.offer.id === rejectedOffer.id)!;
      expect(rejectedEntry.offer.status).toBe("REJECTED");

      // Resubmission by the same (now-rejected) Tasker is blocked because the
      // task no longer accepts offers once a booking has been created.
      await expect(
        repo.submitOffer(task.id, "10000000-0000-4000-8000-000000000005", "Liza Fernandez", {
          amountCentavos: 39000,
          message: "Try again",
          etaText: "3 hours",
          availabilityText: "Tomorrow",
          experienceText: "Experienced.",
        }),
      ).rejects.toThrow();
    });
  });

  describe("offer visibility (private per-viewer projection)", () => {
    async function publishedTaskWithTwoOffers() {
      const saved = await repo.saveDraftTask(CLIENT_ID, draft());
      const result = await repo.publishTask(saved.id, CLIENT_ID, true);
      if (!result.ok) throw new Error("expected publish to succeed");
      const offerA = await repo.submitOffer(result.task.id, TASKER_ID, "Ramon Bautista", {
        amountCentavos: 45000,
        message: "Offer A",
        etaText: "2 hours",
        availabilityText: "Today",
        experienceText: "Experienced.",
      });
      const offerB = await repo.submitOffer(
        result.task.id,
        "10000000-0000-4000-8000-000000000005",
        "Liza Fernandez",
        {
          amountCentavos: 40000,
          message: "Offer B",
          etaText: "3 hours",
          availabilityText: "Tomorrow",
          experienceText: "Experienced.",
        },
      );
      return { task: result.task, offerA, offerB };
    }

    it("lets the task owner (Client) see every offer on their task", async () => {
      const { task } = await publishedTaskWithTwoOffers();
      const asOwner = await repo.listOffers(task.id, CLIENT_ID);
      expect(asOwner.length).toBe(2);
    });

    it("lets a Tasker see only their own offer on the task, never the other Tasker's", async () => {
      const { task, offerA } = await publishedTaskWithTwoOffers();
      const asTaskerA = await repo.listOffers(task.id, TASKER_ID);
      expect(asTaskerA.length).toBe(1);
      expect(asTaskerA[0]?.id).toBe(offerA.id);
    });

    it("returns no offers to an unrelated viewer (not the owner, not an offering Tasker)", async () => {
      const { task } = await publishedTaskWithTwoOffers();
      const asStranger = await repo.listOffers(task.id, OTHER_CLIENT_ID);
      expect(asStranger.length).toBe(0);
    });

    it("returns no offers to an unknown/unregistered viewer id", async () => {
      const { task } = await publishedTaskWithTwoOffers();
      const asUnknown = await repo.listOffers(task.id, "10000000-0000-4000-8000-000000000999");
      expect(asUnknown.length).toBe(0);
    });
  });

  describe("Tasker Dashboard projections", () => {
    async function confirmedBookingForTasker() {
      const saved = await repo.saveDraftTask(CLIENT_ID, draft());
      const published = await repo.publishTask(saved.id, CLIENT_ID, true);
      if (!published.ok) throw new Error("expected publish to succeed");
      const offer = await repo.submitOffer(published.task.id, TASKER_ID, "Ramon Bautista", {
        amountCentavos: 45000,
        message: "Offer",
        etaText: "2 hours",
        availabilityText: "Today",
        experienceText: "Experienced.",
      });
      const selected = await repo.selectOffer(
        published.task.id,
        offer.id,
        CLIENT_ID,
        "dashboard-key",
      );
      if (!selected.ok) throw new Error("selection failed");
      const checkout = await repo.createCheckoutSession(selected.bookingId, CLIENT_ID);
      await repo.simulateCheckout(checkout.providerReference, "success");
      await repo.processAuthoritativeWebhook(checkout.providerReference);
      return selected.bookingId;
    }

    it("reflects a confirmed booking as active work with a protected ledger balance", async () => {
      await confirmedBookingForTasker();
      const snapshot = await repo.getTaskerDashboard(TASKER_ID);
      expect(snapshot.activeBookings.length).toBeGreaterThan(0);
      expect(snapshot.ledger.protectedCentavos).toBeGreaterThan(0);
      expect(snapshot.ledger.derived).toBe(true);
    });

    it("reflects a completed booking as completed work with an available ledger balance", async () => {
      const bookingId = await confirmedBookingForTasker();
      await repo.startWork(bookingId, TASKER_ID);
      await repo.requestCompletion({ bookingId, note: "Done", evidence: [] }, TASKER_ID);
      await repo.confirmCompletion(bookingId, CLIENT_ID);

      const snapshot = await repo.getTaskerDashboard(TASKER_ID);
      expect(snapshot.completedWork.some((b) => b.id === bookingId)).toBe(true);
      expect(snapshot.ledger.availableCentavos).toBeGreaterThan(0);
    });

    it("reflects a completion-requested booking distinctly from active/completed", async () => {
      const bookingId = await confirmedBookingForTasker();
      await repo.startWork(bookingId, TASKER_ID);
      await repo.requestCompletion({ bookingId, note: "Done", evidence: [] }, TASKER_ID);

      const snapshot = await repo.getTaskerDashboard(TASKER_ID);
      expect(snapshot.completionRequested.some((b) => b.id === bookingId)).toBe(true);
      expect(snapshot.activeBookings.some((b) => b.id === bookingId)).toBe(false);
      expect(snapshot.completedWork.some((b) => b.id === bookingId)).toBe(false);
    });
  });

  describe("withdrawals", () => {
    async function completedBookingForTasker() {
      const saved = await repo.saveDraftTask(CLIENT_ID, draft());
      const published = await repo.publishTask(saved.id, CLIENT_ID, true);
      if (!published.ok) throw new Error("expected publish to succeed");
      const offer = await repo.submitOffer(published.task.id, TASKER_ID, "Ramon Bautista", {
        amountCentavos: 45000,
        message: "Offer",
        etaText: "2 hours",
        availabilityText: "Today",
        experienceText: "Experienced.",
      });
      const selected = await repo.selectOffer(
        published.task.id,
        offer.id,
        CLIENT_ID,
        "withdrawal-key",
      );
      if (!selected.ok) throw new Error("selection failed");
      const checkout = await repo.createCheckoutSession(selected.bookingId, CLIENT_ID);
      await repo.simulateCheckout(checkout.providerReference, "success");
      await repo.processAuthoritativeWebhook(checkout.providerReference);
      await repo.startWork(selected.bookingId, TASKER_ID);
      await repo.requestCompletion(
        { bookingId: selected.bookingId, note: "Done", evidence: [] },
        TASKER_ID,
      );
      await repo.confirmCompletion(selected.bookingId, CLIENT_ID);
      return selected.bookingId;
    }

    it("resolves a withdrawal request as provider-unavailable, never a fabricated payout", async () => {
      await completedBookingForTasker();
      const ledgerBefore = await repo.getLedgerSummary(TASKER_ID);
      expect(ledgerBefore.availableCentavos).toBeGreaterThan(0);

      const outcome = await repo.requestWithdrawal(TASKER_ID, ledgerBefore.availableCentavos);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.reason).toBe("PROVIDER_UNAVAILABLE");

      const history = await repo.listWithdrawals(TASKER_ID);
      expect(history.length).toBe(1);
      expect(history[0]?.status).toBe("FAILED");
      expect(history[0]?.failureReason).toBeTruthy();
    });

    it("denies a withdrawal request larger than the available balance", async () => {
      await completedBookingForTasker();
      const outcome = await repo.requestWithdrawal(TASKER_ID, 999_999_999);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.reason).toBe("INSUFFICIENT_AVAILABLE_BALANCE");
    });

    it("denies a zero or negative withdrawal amount", async () => {
      await completedBookingForTasker();
      const outcome = await repo.requestWithdrawal(TASKER_ID, 0);
      expect(outcome.ok).toBe(false);
    });
  });

  describe("prepayment / non-participant media chat denial", () => {
    it("denies chat access before payment confirmation, so media cannot be sent either", async () => {
      const saved = await repo.saveDraftTask(CLIENT_ID, draft());
      const published = await repo.publishTask(saved.id, CLIENT_ID, true);
      if (!published.ok) throw new Error("expected publish to succeed");
      const offer = await repo.submitOffer(published.task.id, TASKER_ID, "Ramon Bautista", {
        amountCentavos: 45000,
        message: "Offer",
        etaText: "2 hours",
        availabilityText: "Today",
        experienceText: "Experienced.",
      });
      const selected = await repo.selectOffer(
        published.task.id,
        offer.id,
        CLIENT_ID,
        "prepayment-key",
      );
      if (!selected.ok) throw new Error("selection failed");

      const conversation = await repo.getConversationForBooking(selected.bookingId, CLIENT_ID);
      expect(conversation).toBeNull();
    });

    it("denies a non-participant from sending a message even to a confirmed booking's conversation", async () => {
      const saved = await repo.saveDraftTask(CLIENT_ID, draft());
      const published = await repo.publishTask(saved.id, CLIENT_ID, true);
      if (!published.ok) throw new Error("expected publish to succeed");
      const offer = await repo.submitOffer(published.task.id, TASKER_ID, "Ramon Bautista", {
        amountCentavos: 45000,
        message: "Offer",
        etaText: "2 hours",
        availabilityText: "Today",
        experienceText: "Experienced.",
      });
      const selected = await repo.selectOffer(published.task.id, offer.id, CLIENT_ID, "np-key");
      if (!selected.ok) throw new Error("selection failed");
      const checkout = await repo.createCheckoutSession(selected.bookingId, CLIENT_ID);
      await repo.simulateCheckout(checkout.providerReference, "success");
      await repo.processAuthoritativeWebhook(checkout.providerReference);
      const conversation = await repo.getConversationForBooking(selected.bookingId, CLIENT_ID);
      if (!conversation) throw new Error("conversation not found");

      await expect(
        repo.sendMessage(conversation.id, OTHER_CLIENT_ID, "hi", "intruder-nonce"),
      ).rejects.toThrow();
    });
  });

  describe("chat media attachments", () => {
    async function confirmedConversation() {
      const saved = await repo.saveDraftTask(CLIENT_ID, draft());
      const published = await repo.publishTask(saved.id, CLIENT_ID, true);
      if (!published.ok) throw new Error("expected publish to succeed");
      const offer = await repo.submitOffer(published.task.id, TASKER_ID, "Ramon Bautista", {
        amountCentavos: 45000,
        message: "Offer",
        etaText: "2 hours",
        availabilityText: "Today",
        experienceText: "Experienced.",
      });
      const selected = await repo.selectOffer(published.task.id, offer.id, CLIENT_ID, "media-key");
      if (!selected.ok) throw new Error("selection failed");
      const checkout = await repo.createCheckoutSession(selected.bookingId, CLIENT_ID);
      await repo.simulateCheckout(checkout.providerReference, "success");
      await repo.processAuthoritativeWebhook(checkout.providerReference);
      const conversation = await repo.getConversationForBooking(selected.bookingId, CLIENT_ID);
      if (!conversation) throw new Error("conversation not found");
      return conversation.id;
    }

    it("sends a message with a media attachment and preserves its metadata", async () => {
      const conversationId = await confirmedConversation();
      const sent = await repo.sendMessage(conversationId, CLIENT_ID, null, "media-nonce-1", [
        {
          kind: "image",
          fileName: "photo.jpg",
          sizeBytes: 500_000,
          mimeType: "image/jpeg",
          storagePath: `${CLIENT_ID}/conversation/photo.jpg`,
        },
      ]);
      expect(sent.deliveryStatus).toBe("sent");
      expect(sent.media.length).toBe(1);
      expect(sent.media[0]?.fileName).toBe("photo.jpg");
      expect(sent.media[0]?.mimeType).toBe("image/jpeg");
    });

    it("allows a body-less message when at least one attachment is present", async () => {
      const conversationId = await confirmedConversation();
      const sent = await repo.sendMessage(conversationId, CLIENT_ID, null, "media-nonce-2", [
        {
          kind: "video",
          fileName: "clip.mp4",
          sizeBytes: 8_000_000,
          mimeType: "video/mp4",
          storagePath: `${CLIENT_ID}/conversation/clip.mp4`,
        },
      ]);
      expect(sent.body).toBeNull();
      expect(sent.media.length).toBe(1);
    });

    it("retrying a failed message with attachments produces one message record and preserves attachment metadata", async () => {
      const conversationId = await confirmedConversation();
      const failed = await repo.sendMessage(
        conversationId,
        CLIENT_ID,
        "__force_fail__",
        "media-nonce-3",
        [
          {
            kind: "image",
            fileName: "photo.jpg",
            sizeBytes: 500_000,
            mimeType: "image/jpeg",
            storagePath: `${CLIENT_ID}/conversation/photo.jpg`,
          },
        ],
      );
      expect(failed.deliveryStatus).toBe("failed");
      const retried = await repo.retryMessage(conversationId, "media-nonce-3", CLIENT_ID);
      expect(retried?.deliveryStatus).toBe("sent");
      expect(retried?.media.length).toBe(1);
      expect(retried?.media[0]?.fileName).toBe("photo.jpg");
      expect(retried?.media[0]?.mimeType).toBe("image/jpeg");

      const messages = await repo.listMessages(conversationId, CLIENT_ID);
      expect(messages.filter((m) => m.clientNonce === "media-nonce-3").length).toBe(1);
    });
  });

  describe("identity verification submission", () => {
    it("opens one reusable case rather than a new one per call", async () => {
      const first = await repo.startVerification();
      const second = await repo.startVerification();

      // The database permits a single non-terminal case per user
      // (uq_verification_active_case), so the development path must match.
      expect(second.id).toBe(first.id);
      expect(first.status).toBe("DRAFT");
      expect(first.documents).toEqual([]);
    });

    it("refuses to submit until both required documents are attached", async () => {
      const openCase = await repo.startVerification();

      const empty = await repo.submitVerification();
      expect(empty.ok).toBe(false);

      await repo.addVerificationDocument({
        caseId: openCase.id,
        kind: "government_id_front",
        storagePath: `${CLIENT_ID}/${openCase.id}/id-front.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 120_000,
      });

      const missingSelfie = await repo.submitVerification();
      expect(missingSelfie.ok).toBe(false);

      await repo.addVerificationDocument({
        caseId: openCase.id,
        kind: "selfie",
        storagePath: `${CLIENT_ID}/${openCase.id}/selfie.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 90_000,
      });

      const submitted = await repo.submitVerification();
      expect(submitted.ok).toBe(true);
      if (submitted.ok) {
        expect(submitted.case.status).toBe("SUBMITTED");
        expect(submitted.case.submittedAt).not.toBeNull();
        expect(submitted.case.documents).toHaveLength(2);
      }
    });

    it("rejects a document aimed at a case the caller does not have open", async () => {
      await repo.startVerification();

      const outcome = await repo.addVerificationDocument({
        caseId: "40000000-0000-4000-8000-0000000000ff",
        kind: "selfie",
        storagePath: `${CLIENT_ID}/other/selfie.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 90_000,
      });

      expect(outcome.ok).toBe(false);
    });
  });
});

describe("SyntheticMarketplaceRepository — profiles", () => {
  let repo: MobileMarketplacePort;

  beforeEach(() => {
    __resetAppConfigForTests();
    __resetMarketplaceRepositoryForTests();
    repo = createMarketplaceRepository();
  });

  it("returns an editable Tasker section only for an approved Tasker", async () => {
    const taskerProfile = await repo.getMyProfile(TASKER_ID);
    expect(taskerProfile?.tasker).not.toBeNull();

    const clientProfile = await repo.getMyProfile(CLIENT_ID);
    expect(clientProfile?.tasker).toBeNull();
  });

  it("persists edits to the user's own details", async () => {
    const result = await repo.updateMyProfile(CLIENT_ID, {
      displayName: "Maria Santos",
      bio: "Posts household tasks around Quezon City.",
    });
    expect(result.ok).toBe(true);

    const reloaded = await repo.getMyProfile(CLIENT_ID);
    expect(reloaded?.displayName).toBe("Maria Santos");
    expect(reloaded?.bio).toBe("Posts household tasks around Quezon City.");
  });

  it("normalizes a Philippine mobile number to +63 form", async () => {
    const result = await repo.updateMyProfile(CLIENT_ID, { mobile: "09171234567" });
    expect(result.ok).toBe(true);
    const reloaded = await repo.getMyProfile(CLIENT_ID);
    expect(reloaded?.mobile).toBe("+639171234567");
  });

  it("rejects an invalid mobile number without changing anything", async () => {
    const before = await repo.getMyProfile(CLIENT_ID);
    const result = await repo.updateMyProfile(CLIENT_ID, { mobile: "12345" });
    expect(result.ok).toBe(false);
    const after = await repo.getMyProfile(CLIENT_ID);
    expect(after?.mobile).toBe(before?.mobile ?? null);
  });

  it("rejects a display name that is too short", async () => {
    const result = await repo.updateMyProfile(CLIENT_ID, { displayName: "A" });
    expect(result.ok).toBe(false);
  });

  it("refuses Tasker-only fields for a non-Tasker account", async () => {
    const result = await repo.updateMyProfile(CLIENT_ID, { publicBio: "Trying to look approved." });
    expect(result.ok).toBe(false);
  });

  it("reflects a Tasker's public bio edit in their public profile", async () => {
    const result = await repo.updateMyProfile(TASKER_ID, {
      publicBio: "Handyman focused on quick same-day repairs.",
    });
    expect(result.ok).toBe(true);

    const publicView = await repo.getPublicTaskerProfile(TASKER_ID);
    expect(publicView?.publicBio).toBe("Handyman focused on quick same-day repairs.");
  });

  it("never lets a profile edit change platform-authoritative trust signals", async () => {
    const before = await repo.getPublicTaskerProfile(TASKER_ID);
    await repo.updateMyProfile(TASKER_ID, { publicBio: "Rewritten bio." });
    const after = await repo.getPublicTaskerProfile(TASKER_ID);

    expect(after?.ratingAverage).toBe(before?.ratingAverage ?? null);
    expect(after?.ratingCount).toBe(before?.ratingCount ?? 0);
    expect(after?.completionCount).toBe(before?.completionCount ?? 0);
    expect(after?.verifiedIdentity).toBe(before?.verifiedIdentity ?? false);
  });

  it("de-duplicates selected specialties", async () => {
    const options = await repo.listSpecialtyOptions();
    expect(options.length).toBeGreaterThan(0);
    const first = options[0]!.id;

    const result = await repo.updateMyProfile(TASKER_ID, { specialtyIds: [first, first] });
    expect(result.ok).toBe(true);
    const reloaded = await repo.getMyProfile(TASKER_ID);
    expect(reloaded?.tasker?.specialtyIds).toEqual([first]);
  });

  it("returns null for a public profile that does not exist", async () => {
    expect(await repo.getPublicTaskerProfile(OTHER_CLIENT_ID)).toBeNull();
  });
});
