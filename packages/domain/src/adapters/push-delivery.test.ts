import { describe, expect, it } from "vitest";

import {
  buildExpoMessages,
  canRetryPush,
  chunkExpoMessages,
  EXPO_PUSH_MAX_BATCH,
  isExpoPushToken,
  PUSH_MAX_ATTEMPTS_DEFAULT,
  pushCategoryForType,
  pushRetryBackoffMinutes,
  shouldPush,
} from "./push-delivery.js";

const TOKEN_A = "ExponentPushToken[AAAAAAAAAAAAAAAAAAAAAA]";
const TOKEN_B = "ExponentPushToken[BBBBBBBBBBBBBBBBBBBBBB]";

describe("isExpoPushToken", () => {
  it("accepts the Expo token shapes and rejects anything else", () => {
    expect(isExpoPushToken(TOKEN_A)).toBe(true);
    expect(isExpoPushToken("ExpoPushToken[xyz]")).toBe(true);
    expect(isExpoPushToken("not-a-token")).toBe(false);
    expect(isExpoPushToken("ExponentPushToken[]")).toBe(false);
    expect(isExpoPushToken("fcm:abc123")).toBe(false);
  });
});

describe("pushCategoryForType", () => {
  it("mirrors app.notification_category from migrations 0020 + 0043", () => {
    expect(pushCategoryForType("OFFER_RECEIVED")).toBe("offers");
    expect(pushCategoryForType("OFFER_SELECTED")).toBe("offers");
    expect(pushCategoryForType("PAYMENT_FAILED")).toBe("payments");
    expect(pushCategoryForType("BOOKING_COMPLETED")).toBe("bookings");
    expect(pushCategoryForType("DISPUTE_OPENED")).toBe("disputes");
    expect(pushCategoryForType("REVIEW_RECEIVED")).toBe("reviews");
    expect(pushCategoryForType("MESSAGE_RECEIVED")).toBe("messages");
    expect(pushCategoryForType("VERIFICATION_DECISION")).toBe("verification");
    expect(pushCategoryForType("SOMETHING_ELSE")).toBe("system");
  });

  it("maps the Wave 3B producers added in 0043/0044", () => {
    // A muted category must mute BOTH channels, so these three mappings are the
    // contract between app.notification_category and the push dispatcher.
    expect(pushCategoryForType("REVIEW_REMINDER")).toBe("reviews");
    expect(pushCategoryForType("NEARBY_TASK")).toBe("nearby");
    // A trust & safety outcome rides the `system` toggle (0050).
    expect(pushCategoryForType("REPORT_RESOLVED")).toBe("system");
    expect(pushCategoryForType("COMPLETION_REMINDER")).toBe("bookings");
  });
});

describe("push retry schedule", () => {
  it("backs off exponentially and caps at an hour", () => {
    expect(pushRetryBackoffMinutes(1)).toBe(2);
    expect(pushRetryBackoffMinutes(2)).toBe(4);
    expect(pushRetryBackoffMinutes(3)).toBe(8);
    expect(pushRetryBackoffMinutes(4)).toBe(16);
    expect(pushRetryBackoffMinutes(5)).toBe(32);
    expect(pushRetryBackoffMinutes(6)).toBe(60);
    expect(pushRetryBackoffMinutes(50)).toBe(60);
  });

  it("treats a non-positive attempt count as the first attempt", () => {
    expect(pushRetryBackoffMinutes(0)).toBe(2);
    expect(pushRetryBackoffMinutes(-3)).toBe(2);
  });

  it("stops retrying once the attempt ceiling is reached", () => {
    expect(canRetryPush(0)).toBe(true);
    expect(canRetryPush(PUSH_MAX_ATTEMPTS_DEFAULT - 1)).toBe(true);
    expect(canRetryPush(PUSH_MAX_ATTEMPTS_DEFAULT)).toBe(false);
    expect(canRetryPush(99)).toBe(false);
  });

  it("honours a configured ceiling", () => {
    expect(canRetryPush(3, 5)).toBe(true);
    expect(canRetryPush(5, 5)).toBe(false);
    // A nonsense ceiling still permits the first attempt rather than looping.
    expect(canRetryPush(0, 0)).toBe(true);
  });
});

describe("shouldPush", () => {
  it("defaults to enabled when no preference row exists", () => {
    expect(shouldPush(null)).toBe(true);
    expect(shouldPush(undefined)).toBe(true);
    expect(shouldPush({ push: true })).toBe(true);
  });

  it("suppresses only when the recipient explicitly turned push off", () => {
    expect(shouldPush({ push: false })).toBe(false);
  });
});

describe("buildExpoMessages", () => {
  it("builds one message per valid token with deep-link data", () => {
    const messages = buildExpoMessages({
      tokens: [TOKEN_A, TOKEN_B],
      title: "New offer received",
      body: 'You have a new offer on "Fix sink".',
      resourceType: "task",
      resourceId: "task-123",
    });
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({
      to: TOKEN_A,
      title: "New offer received",
      body: 'You have a new offer on "Fix sink".',
      sound: "default",
      data: { resourceType: "task", resourceId: "task-123" },
    });
  });

  it("drops invalid and duplicate tokens rather than failing the batch", () => {
    const messages = buildExpoMessages({
      tokens: [TOKEN_A, "garbage", TOKEN_A, "  " + TOKEN_B + "  "],
      title: "t",
      body: "b",
    });
    expect(messages.map((m) => m.to)).toEqual([TOKEN_A, TOKEN_B]);
  });

  it("omits data keys when the notification has no linked resource", () => {
    const [message] = buildExpoMessages({ tokens: [TOKEN_A], title: "t", body: "b" });
    expect(message?.data).toEqual({});
  });
});

describe("chunkExpoMessages", () => {
  it("splits into Expo-sized batches", () => {
    const messages = Array.from({ length: EXPO_PUSH_MAX_BATCH * 2 + 5 }, (_, i) => ({
      to: `ExponentPushToken[${i}]`,
      title: "t",
      body: "b",
      sound: "default" as const,
      data: {},
    }));
    const batches = chunkExpoMessages(messages);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(EXPO_PUSH_MAX_BATCH);
    expect(batches[2]).toHaveLength(5);
  });

  it("returns no batches for an empty list", () => {
    expect(chunkExpoMessages([])).toEqual([]);
  });
});
