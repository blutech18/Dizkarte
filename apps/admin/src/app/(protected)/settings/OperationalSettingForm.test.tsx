import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { EditableSetting } from "@/lib/repository/types";

const updateSettingAction = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("./actions", () => ({
  updateSettingAction: (...args: unknown[]) => updateSettingAction(...args),
}));

import { OperationalSettingForm } from "./OperationalSettingForm";

const mockSetting: EditableSetting = {
  key: "review_reveal_days",
  label: "Review reveal window",
  description: "Days a one-sided review stays hidden before it is revealed automatically.",
  value: 14,
  min: 1,
  max: 90,
  unit: "days",
};

describe("OperationalSettingForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the label, description, and active threshold value", () => {
    render(<OperationalSettingForm setting={mockSetting} />);
    expect(screen.getByText("Review reveal window")).toBeInTheDocument();
    expect(
      screen.getByText("Days a one-sided review stays hidden before it is revealed automatically."),
    ).toBeInTheDocument();
    expect(screen.getByRole("spinbutton")).toHaveValue(14);
    expect(screen.getByText("(Allowed range: 1 to 90 days)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
  });

  it("updates value when changing numeric input and enables justification", () => {
    render(<OperationalSettingForm setting={mockSetting} />);
    const input = screen.getByRole("spinbutton");
    const textarea = screen.getByRole("textbox");

    expect(textarea).toBeDisabled();

    fireEvent.change(input, { target: { value: "21" } });
    expect(input).toHaveValue(21);
    expect(textarea).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).not.toBeDisabled();
  });

  it("requires an audit justification before submitting a modified value", async () => {
    render(<OperationalSettingForm setting={mockSetting} />);
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "21" } });

    const saveBtn = screen.getByRole("button", { name: "Save changes" });
    fireEvent.click(saveBtn);

    expect(
      await screen.findByText(
        "An audit justification is required. It will be permanently recorded in the audit log.",
      ),
    ).toBeInTheDocument();
    expect(updateSettingAction).not.toHaveBeenCalled();
  });

  it("validates that input must be within permitted range", async () => {
    render(<OperationalSettingForm setting={mockSetting} />);
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "150" } });

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Testing out of bounds" } });

    const saveBtn = screen.getByRole("button", { name: "Save changes" });
    fireEvent.click(saveBtn);

    expect(
      await screen.findByText("Please enter a whole number between 1 and 90."),
    ).toBeInTheDocument();
    expect(updateSettingAction).not.toHaveBeenCalled();
  });

  it("resets to initial value when clicking the Reset button", () => {
    render(<OperationalSettingForm setting={mockSetting} />);
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "21" } });
    expect(input).toHaveValue(21);

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Staged explanation" } });
    expect(textarea).toHaveValue("Staged explanation");

    const resetBtn = screen.getByRole("button", { name: "Reset" });
    fireEvent.click(resetBtn);

    expect(input).toHaveValue(14);
    expect(textarea).toHaveValue("");
    expect(textarea).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("submits the change and displays a success alert", async () => {
    updateSettingAction.mockResolvedValueOnce({ ok: true });
    render(<OperationalSettingForm setting={mockSetting} />);

    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "7" } });

    const reasonInput = screen.getByRole("textbox");
    fireEvent.change(reasonInput, {
      target: { value: "Accelerate reviews for peak season marketplace." },
    });

    const saveBtn = screen.getByRole("button", { name: "Save changes" });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(updateSettingAction).toHaveBeenCalledWith({
        key: "review_reveal_days",
        value: 7,
        reason: "Accelerate reviews for peak season marketplace.",
      });
    });

    expect(
      await screen.findByText("Setting updated and committed to the audit trail."),
    ).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("handles server action error responses gracefully", async () => {
    updateSettingAction.mockResolvedValueOnce({
      ok: false,
      message: "Insufficient permissions to modify platform threshold.",
    });
    render(<OperationalSettingForm setting={mockSetting} />);

    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "10" } });

    const reasonInput = screen.getByRole("textbox");
    fireEvent.change(reasonInput, {
      target: { value: "Attempting modification" },
    });

    const saveBtn = screen.getByRole("button", { name: "Save changes" });
    fireEvent.click(saveBtn);

    expect(
      await screen.findByText("Insufficient permissions to modify platform threshold."),
    ).toBeInTheDocument();
  });
});
