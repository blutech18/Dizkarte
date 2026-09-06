import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { UserRowActions } from "./UserRowActions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("./actions", () => ({
  setUserAccountStatusAction: vi.fn(async () => ({ ok: true })),
}));

describe("UserRowActions", () => {
  it("renders Suspend and Ban buttons for active users by default without Profile link", () => {
    render(
      <UserRowActions
        userId="user-001"
        status="active"
      />,
    );

    expect(screen.getByRole("button", { name: /Suspend/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ban/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Profile/i })).not.toBeInTheDocument();
  });

  it("renders Profile link with correct href when showProfileLink is true", () => {
    render(
      <UserRowActions
        userId="user-002"
        status="active"
        showProfileLink
      />,
    );

    const profileLink = screen.getByRole("link", { name: /Profile/i });
    expect(profileLink).toBeInTheDocument();
    expect(profileLink).toHaveAttribute("href", "/users/user-002");
    expect(profileLink).toHaveClass("dk-action-btn");
  });

  it("renders Reactivate button when user is suspended", () => {
    render(
      <UserRowActions
        userId="user-003"
        status="suspended"
      />,
    );

    expect(screen.getByRole("button", { name: /Reactivate/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Suspend$/i })).not.toBeInTheDocument();
  });
});
