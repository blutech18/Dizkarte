import { describe, expect, it } from "vitest";

import {
  buildExpoMessages,
  chunkExpoMessages,
  EXPO_PUSH_MAX_BATCH,
  isExpoPushToken,
  pushCategoryForType,
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
  it("mirrors app.notification_category from migration 0020", () => {
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
