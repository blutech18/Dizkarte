import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("requires a non-empty reason before confirming a destructive action", async () => {
    const onConfirm = vi.fn().mockResolvedValue({ ok: true });
    render(
      <ConfirmDialog
        triggerLabel="Reject"
        title="Reject case"
        description="This is final."
        requireReason
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(screen.getByRole("alertdialog", { name: "Reject case" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("A reason is required for this action.")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("submits the typed reason when confirming", async () => {
    const onConfirm = vi.fn().mockResolvedValue({ ok: true });
    render(
      <ConfirmDialog
        triggerLabel="Approve"
        title="Approve case"
        description="Grants eligibility."
        requireReason
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Documents verified." } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("Documents verified."));
  });

  it("shows a disabled trigger with an explanatory reason when disabled", () => {
    render(
      <ConfirmDialog
        triggerLabel="Refund"
        title="Refund"
        description="Refund the payment."
        disabled
        disabledReason="No approved payment provider is configured."
        onConfirm={vi.fn()}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Refund" });
    expect(trigger).toBeDisabled();
    expect(screen.getByText("No approved payment provider is configured.")).toBeInTheDocument();
  });
});
