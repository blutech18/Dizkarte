import { describe, expect, it } from "vitest";
import { SupabaseMarketplaceRepository } from "./supabase-repository";
import type { ConversationId, UserId } from "@dizkarte/domain";

/**
 * Regression cover for the realtime channel-topic collision.
 *
 * `SupabaseClient.channel(topic)` returns the *cached* channel for a topic it has
 * already seen, and `postgres_changes` listeners may only be attached before
 * `subscribe()`. A subscription that reused a fixed topic therefore crashed with
 * "cannot add `postgres_changes` callbacks ... after `subscribe()`" whenever a
 * second subscribe happened before the first channel finished being removed —
 * which React does on every StrictMode mount, and on any effect re-run.
 *
 * The fake below reproduces exactly those two behaviours, so the test fails
 * against a fixed topic and passes against a per-subscription topic.
 */
class FakeChannel {
  subscribed = false;
  removed = false;

  constructor(readonly topic: string) {}

  on(): this {
    if (this.subscribed) {
      throw new Error(
        `cannot add \`postgres_changes\` callbacks for realtime:${this.topic} after \`subscribe()\`.`,
      );
    }
    return this;
  }

  subscribe(): this {
    this.subscribed = true;
    return this;
  }
}

class FakeClient {
  readonly channels = new Map<string, FakeChannel>();

  channel(topic: string): FakeChannel {
    // Supabase hands back the same instance for a repeated topic.
    const existing = this.channels.get(topic);
    if (existing) return existing;
    const created = new FakeChannel(topic);
    this.channels.set(topic, created);
    return created;
  }

  /**
   * Removal is asynchronous in the real client, so it is deliberately NOT
   * applied to the cache synchronously here: the crash depended on the old
   * channel still being cached when the next subscribe ran.
   */
  removeChannel(channel: FakeChannel): Promise<"ok"> {
    channel.removed = true;
    return Promise.resolve("ok");
  }
}

function makeRepository() {
  const client = new FakeClient();
  // Only the realtime surface is exercised, so the fake implements just that.
  const repository = new SupabaseMarketplaceRepository(
    () => client as unknown as ConstructorParameters<typeof SupabaseMarketplaceRepository>[0] extends () => infer Client
      ? Client
      : never,
  );
  return { client, repository };
}

const CONVERSATION = "24bf75d1-9d96-40ea-96d7-d97ecc7d7f71" as ConversationId;
const VIEWER = "usr-1" as UserId;

describe("SupabaseMarketplaceRepository realtime subscriptions", () => {
  it("resubscribes to the same conversation without reusing a subscribed channel", () => {
    const { client, repository } = makeRepository();

    // First mount.
    const unsubscribe = repository.subscribeToConversation(CONVERSATION, VIEWER, () => {});
    // StrictMode unmount: removal is queued, not synchronous.
    unsubscribe();

    // Immediate remount must not attach a listener to the cached channel.
    expect(() =>
      repository.subscribeToConversation(CONVERSATION, VIEWER, () => {}),
    ).not.toThrow();

    const topics = [...client.channels.keys()];
    expect(topics).toHaveLength(2);
    for (const topic of topics) {
      expect(topic.startsWith(`conversation:${CONVERSATION}`)).toBe(true);
    }
  });

  it("gives two concurrent notification subscribers their own channels", () => {
    const { client, repository } = makeRepository();

    repository.subscribeToNotifications(VIEWER, () => {});
    expect(() => repository.subscribeToNotifications(VIEWER, () => {})).not.toThrow();

    expect(client.channels.size).toBe(2);
  });

  it("removes the channel it created when unsubscribed", () => {
    const { client, repository } = makeRepository();

    const unsubscribe = repository.subscribeToConversation(CONVERSATION, VIEWER, () => {});
    const created = [...client.channels.values()][0]!;
    expect(created.removed).toBe(false);

    unsubscribe();
    expect(created.removed).toBe(true);
  });
});
