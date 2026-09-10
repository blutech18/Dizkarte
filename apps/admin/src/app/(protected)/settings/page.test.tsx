import { describe, it, expect, vi } from "vitest";
import { Suspense, type ReactElement } from "react";

const { getSettings, loadServerConfig } = vi.hoisted(() => ({
  getSettings: vi.fn((): Promise<unknown> => new Promise<never>(() => {})),
  loadServerConfig: vi.fn(() => ({
    environment: "development",
    adapterModes: {
      payment: "synthetic",
      map: "sandbox",
      push: "live",
      media: "live",
      monitoring: "synthetic",
    },
  })),
}));

vi.mock("server-only", () => ({}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/guard", () => ({
  requirePageCapability: async () => ({
    userId: "11111111-1111-4111-8111-111111111111",
    displayName: "Super Admin",
    email: "super@dizkarte.test",
    capabilities: ["ADMIN_SUPER"],
    synthetic: false,
  }),
}));

vi.mock("@/lib/config", () => ({
  loadServerConfig,
}));

vi.mock("@/lib/repository", () => ({
  getAdminRepository: () => ({
    getSettings,
  }),
}));

const { default: SettingsPage } = await import("./page");

function walk(node: unknown): ReadonlyArray<ReactElement> {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (typeof node !== "object" || node === null) return [];
  const element = node as ReactElement<{ children?: unknown; fallback?: unknown }>;
  if (element.type === undefined) return [];
  return [element, ...walk(element.props?.children), ...walk(element.props?.fallback)];
}

describe("settings page streaming shell and workstation layout", () => {
  it("resolves its shell immediately without awaiting settings read", async () => {
    const shell = await Promise.race([
      SettingsPage(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("the page awaited a repository read")), 500),
      ),
    ]);

    expect(shell).toBeTruthy();
    expect(getSettings).not.toHaveBeenCalled();
  });

  it("puts managed settings behind a Suspense boundary with a skeleton fallback", async () => {
    const shell = (await SettingsPage()) as ReactElement;
    const boundaries = walk(shell).filter((element) => element.type === Suspense);

    expect(boundaries.length).toBeGreaterThanOrEqual(1);
    expect((boundaries[0] as ReactElement<{ fallback?: unknown }>).props.fallback).toBeTruthy();
  });

  it("renders runtime environment and adapter facts in the shell", async () => {
    const shell = (await SettingsPage()) as ReactElement;
    const elements = walk(shell);

    const envHeading = elements.find(
      (el) => (el.props as Record<string, unknown>)?.id === "environment-heading",
    );
    expect(envHeading).toBeDefined();

    const securityHeading = elements.find(
      (el) => (el.props as Record<string, unknown>)?.id === "security-heading",
    );
    expect(securityHeading).toBeDefined();
  });
});
