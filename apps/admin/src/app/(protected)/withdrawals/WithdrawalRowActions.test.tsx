import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("./actions", () => ({
  approveWithdrawalAction: vi.fn(),
}));

import { WithdrawalRowActions } from "./WithdrawalRowActions";

describe("WithdrawalRowActions", () => {
  it("disables Approve, Reserve, and Retry with an explicit provider-unavailable reason", () => {
    render(
      <WithdrawalRowActions
        withdrawalId="wdr-8001"
        disabled
        disabledReason="No approved payout provider is configured."
      />,
    );

    for (const label of ["Approve", "Reserve", "Retry"]) {
      const trigger = screen.getByRole("button", { name: label });
      expect(trigger).toBeDisabled();
    }
    expect(screen.getAllByText("No approved payout provider is configured.").length).toBe(3);
  });

  it("enables the controls when a payout provider is available", () => {
    render(<WithdrawalRowActions withdrawalId="wdr-8001" disabled={false} disabledReason="" />);
    for (const label of ["Approve", "Reserve", "Retry"]) {
      const trigger = screen.getByRole("button", { name: label });
      expect(trigger).not.toBeDisabled();
    }
  });
});
