import { describe, expect, it, vi, beforeEach } from "vitest";
import type { UserContext } from "@dizkarte/adapter-supabase";

/**
 * Verifies that the page guard turns each authorization outcome into the right
 * navigation, without changing the decision itself. `next/navigation`'s
 * `redirect` throws in real Next.js, so it is mocked to throw a recognizable
 * marker carrying the target path.
 */
vi.mock("server-only", () => ({}));

class RedirectMarker extends Error {
  constructor(public readonly target: string) {
    super(`REDIRECT:${target}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (target: string) => {
    throw new RedirectMarker(target);
  },
}));

let currentUser: { id: string; email: string } | null = null;

vi.mock("./supabase-server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: currentUser },
        error: currentUser ? null : { message: "no user" },
      }),
      signOut: async () => undefined,
    },
  }),
}));

let contextByUserId: Record<string, UserContext | null> = {};
vi.mock("@dizkarte/adapter-supabase", () => ({
  loadUserContext: async (_client: unknown, userId: string) => contextByUserId[userId] ?? null,
}));

function adminContext(
  userId: string,
  capability: UserContext["capabilities"][number],
): UserContext {
  return {
    userId,
    displayName: "Test Admin",
    accountStatus: "active",
    capabilities: [capability],
    verificationStatus: "APPROVED",
    taskerApplicationStatus: null,
    taskerApproved: false,
  };
}

beforeEach(() => {
  currentUser = null;
  contextByUserId = {};
});

describe("requirePageCapability", () => {
  it("sends an unauthenticated visitor to the login page", async () => {
    const { requirePageCapability } = await import("./guard");
    await expect(requirePageCapability(["ADMIN_FINANCE"])).rejects.toMatchObject({
      target: "/login",
    });
  });

  it("sends a signed-in Admin without the grant to the access-restricted page", async () => {
    currentUser = { id: "admin-1", email: "support-admin@dev.dizkarte.invalid" };
    contextByUserId["admin-1"] = adminContext("admin-1", "ADMIN_SUPPORT");
    const { requirePageCapability } = await import("./guard");
    await expect(requirePageCapability(["ADMIN_FINANCE"])).rejects.toMatchObject({
      target: "/access-restricted",
    });
  });

  it("returns the session when the capability matches", async () => {
    currentUser = { id: "admin-2", email: "finance-admin@dev.dizkarte.invalid" };
    contextByUserId["admin-2"] = adminContext("admin-2", "ADMIN_FINANCE");
    const { requirePageCapability } = await import("./guard");
    const session = await requirePageCapability(["ADMIN_FINANCE"]);
    expect(session.capabilities).toContain("ADMIN_FINANCE");
  });

  it("lets a super Admin through any capability gate", async () => {
    currentUser = { id: "admin-3", email: "super-admin@dev.dizkarte.invalid" };
    contextByUserId["admin-3"] = adminContext("admin-3", "ADMIN_SUPER");
    const { requirePageCapability } = await import("./guard");
    await expect(requirePageCapability(["ADMIN_FINANCE"])).resolves.toBeTruthy();
    await expect(requirePageCapability(["ADMIN_SUPPORT"])).resolves.toBeTruthy();
  });

  it("denies a suspended Admin account outright", async () => {
    currentUser = { id: "admin-4", email: "suspended-admin@dev.dizkarte.invalid" };
    contextByUserId["admin-4"] = {
      ...adminContext("admin-4", "ADMIN_SUPER"),
      accountStatus: "suspended",
    };
    const { requirePageCapability } = await import("./guard");
    await expect(requirePageCapability(["ADMIN_SUPER"])).rejects.toMatchObject({
      target: "/login",
    });
  });
});
