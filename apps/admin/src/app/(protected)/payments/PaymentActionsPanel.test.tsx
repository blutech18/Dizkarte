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
  it("enables Refund (audited dispatch) and keeps Release disabled with a reason", () => {
    render(
      <PaymentActionsPanel
        paymentIntentId="pin-0001"
        freezeEligible={true}
        refundDisabledReason="No approved Philippine payment provider integration exists yet."
      />,
    );

    // Refund is a real, audited control now that a provider can be configured;
    // capability, booking state, and provider-readiness are enforced server-side.
    expect(screen.getByRole("button", { name: "Refund" })).not.toBeDisabled();
    // Release remains disabled pending an approved release/payout policy.
    expect(screen.getByRole("button", { name: "Release" })).toBeDisabled();
    expect(
      screen.getAllByText("No approved Philippine payment provider integration exists yet.").length,
    ).toBeGreaterThanOrEqual(1);
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
