import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("./actions", () => ({
  requestRefundAction: vi.fn(),
  freezePaymentAction: vi.fn(),
}));

import { PaymentActionsPanel } from "./PaymentActionsPanel";

describe("PaymentActionsPanel", () => {
  it("keeps Refund and Release disabled with an explicit unapproved-provider reason", () => {
    render(
      <PaymentActionsPanel
        paymentIntentId="pin-0001"
        freezeEligible={true}
        refundDisabledReason="No approved Philippine payment provider integration exists yet."
      />,
    );

    expect(screen.getByRole("button", { name: "Refund" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Release" })).toBeDisabled();
    expect(
      screen.getAllByText("No approved Philippine payment provider integration exists yet.").length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("enables Freeze when the payment is eligible, and always disables Unfreeze", () => {
    render(
      <PaymentActionsPanel
        paymentIntentId="pin-0001"
        freezeEligible={true}
        refundDisabledReason="Unavailable."
      />,
    );
    expect(screen.getByRole("button", { name: "Freeze" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Unfreeze" })).toBeDisabled();
  });

  it("disables Freeze with a reason when the payment is not eligible", () => {
    render(
      <PaymentActionsPanel
        paymentIntentId="pin-0003"
        freezeEligible={false}
        refundDisabledReason="Unavailable."
      />,
    );
    const freezeButton = screen.getByRole("button", { name: "Freeze" });
    expect(freezeButton).toBeDisabled();
    expect(
      screen.getByText("Only committed, unsettled payments can be frozen."),
    ).toBeInTheDocument();
  });
});
