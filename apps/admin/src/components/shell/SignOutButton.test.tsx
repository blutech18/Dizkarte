import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const pushMock = vi.fn();
const refreshMock = vi.fn();
const signOutActionMock = vi.fn().mockResolvedValue(undefined);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

vi.mock("@/app/(protected)/actions", () => ({
  signOutAction: () => signOutActionMock(),
}));

import { SignOutButton } from "./SignOutButton";

describe("SignOutButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a plain icon button without text initially", () => {
    render(<SignOutButton />);
    const button = screen.getByRole("button", { name: "Logout" });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass("dk-topbar-logout-btn");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("opens confirmation modal when clicked", () => {
    render(<SignOutButton />);
    const button = screen.getByRole("button", { name: "Logout" });
    fireEvent.click(button);

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Log out" })).toBeInTheDocument();
    expect(
      screen.getByText("Are you sure you want to log out of your session?"),
    ).toBeInTheDocument();
  });

  it("closes modal on cancel without signing out", () => {
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Logout" }));

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(signOutActionMock).not.toHaveBeenCalled();
  });

  it("closes modal on Escape key", () => {
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Logout" }));

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("presentation"), { key: "Escape" });

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(signOutActionMock).not.toHaveBeenCalled();
  });

  it("calls signOutAction and redirects when confirming log out", async () => {
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Logout" }));

    const confirmBtn = screen.getByRole("button", { name: "Log out" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(signOutActionMock).toHaveBeenCalledTimes(1);
      expect(pushMock).toHaveBeenCalledWith("/login");
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });
  });
});
