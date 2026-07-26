import { describe, expect, it, vi, beforeEach } from "vitest";
import type { UserContext } from "@dizkarte/adapter-supabase";

/**
 * `server-only`, the Supabase SSR client, and the adapter's `loadUserContext`
 * are mocked so the capability-guard logic is tested in isolation from the
 * Next.js request context and any network. Auth itself (Supabase) is exercised
 * by integration testing against a live project, not here.
 */
vi.mock("server-only", () => ({}));

let currentUser: { id: string; email: string } | null = null;
let signInError = false;
const signOutMock = vi.fn(async () => {
  currentUser = null;
});

vi.mock("./supabase-server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: currentUser },
        error: currentUser ? null : { message: "no user" },
      }),
      signInWithPassword: async ({ email }: { email: string }) => {
        if (signInError) return { data: { user: null }, error: { message: "bad credentials" } };
        currentUser = { id: `id-${email}`, email };
        return { data: { user: currentUser }, error: null };
      },
      signOut: async () => signOutMock(),
    },
  }),
}));

let contextByUserId: Record<string, UserContext | null> = {};
vi.mock("@dizkarte/adapter-supabase", () => ({
  loadUserContext: async (_client: unknown, userId: string) => contextByUserId[userId] ?? null,
}));

function adminContext(userId: string, cap: UserContext["capabilities"][number]): UserContext {
  return {
    userId,
    displayName: "Test Admin",
    accountStatus: "active",
    capabilities: [cap],
    verificationStatus: "APPROVED",
    taskerApplicationStatus: null,
    taskerApproved: false,
  };
}

beforeEach(() => {
  currentUser = null;
  signInError = false;
  contextByUserId = {};
  signOutMock.mockClear();
});

describe("Admin session guard", () => {
  it("rejects an unauthenticated request", async () => {
    const { requireAdminSession, AdminAuthorizationError } = await import("./session");
    await expect(requireAdminSession()).rejects.toBeInstanceOf(AdminAuthorizationError);
  });

  it("signs in a real Admin and grants the matching capability", async () => {
    const email = "finance-admin@dev.dizkarte.invalid";
    contextByUserId[`id-${email}`] = adminContext(`id-${email}`, "ADMIN_FINANCE");
    const { loginWithSupabase, requireAdminSession } = await import("./session");

    const result = await loginWithSupabase(email, "correct-password");
    expect(result.ok).toBe(true);

    const session = await requireAdminSession(["ADMIN_FINANCE"]);
    expect(session.capabilities).toContain("ADMIN_FINANCE");
    expect(session.synthetic).toBe(false);
  });

  it("rejects invalid credentials", async () => {
    signInError = true;
    const { loginWithSupabase } = await import("./session");
    const result = await loginWithSupabase("finance-admin@dev.dizkarte.invalid", "wrong");
    expect(result.ok).toBe(false);
  });

  it("rejects a valid login that lacks any Admin capability and signs it back out", async () => {
    const email = "client@dev.dizkarte.invalid";
    contextByUserId[`id-${email}`] = {
      userId: `id-${email}`,
      displayName: "Client",
      accountStatus: "active",
      capabilities: ["CLIENT"],
      verificationStatus: "APPROVED",
      taskerApplicationStatus: null,
      taskerApproved: false,
    };
    const { loginWithSupabase } = await import("./session");
    const result = await loginWithSupabase(email, "correct-password");
    expect(result.ok).toBe(false);
    expect(signOutMock).toHaveBeenCalled();
  });

  it("denies access when the session lacks the required capability", async () => {
    const email = "support-admin@dev.dizkarte.invalid";
    contextByUserId[`id-${email}`] = adminContext(`id-${email}`, "ADMIN_SUPPORT");
    const { loginWithSupabase, requireAdminSession, AdminAuthorizationError } = await import(
      "./session"
    );
    await loginWithSupabase(email, "correct-password");
    await expect(requireAdminSession(["ADMIN_FINANCE"])).rejects.toBeInstanceOf(
      AdminAuthorizationError,
    );
  });

  it("clears the session on sign-out", async () => {
    const email = "super-admin@dev.dizkarte.invalid";
    contextByUserId[`id-${email}`] = adminContext(`id-${email}`, "ADMIN_SUPER");
    const { loginWithSupabase, signOut, requireAdminSession, AdminAuthorizationError } =
      await import("./session");
    await loginWithSupabase(email, "correct-password");
    await signOut();
    await expect(requireAdminSession()).rejects.toBeInstanceOf(AdminAuthorizationError);
  });
});
