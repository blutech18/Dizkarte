import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { CaseActionsPanel } from "./CaseActionsPanel";

describe("CaseActionsPanel", () => {
  it("shows an assign-to-self control when the case is unassigned", () => {
    const onAssign = vi.fn().mockResolvedValue({ ok: true });
    render(
      <CaseActionsPanel
        isAssignedToMe={false}
        isUnassigned={true}
        assignLabel="Assign to me"
        onAssign={onAssign}
        allowedTransitions={["TRIAGED"]}
        transitionLabel={(status) => status}
        onTransition={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );
    expect(screen.getByRole("button", { name: "Assign to me" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "TRIAGED" })).not.toBeInTheDocument();
  });

  it("calls onAssign when the assign control is clicked", async () => {
    const onAssign = vi.fn().mockResolvedValue({ ok: true });
    render(
      <CaseActionsPanel
        isAssignedToMe={false}
        isUnassigned={true}
        assignLabel="Assign to me"
        onAssign={onAssign}
        allowedTransitions={[]}
        transitionLabel={(status) => status}
        onTransition={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Assign to me" }));
    await waitFor(() => expect(onAssign).toHaveBeenCalledTimes(1));
  });

  it("shows nothing when the case is assigned to a different Admin", () => {
    const { container } = render(
      <CaseActionsPanel
        isAssignedToMe={false}
        isUnassigned={false}
        assignLabel="Assign to me"
        onAssign={vi.fn().mockResolvedValue({ ok: true })}
        allowedTransitions={["TRIAGED"]}
        transitionLabel={(status) => status}
        onTransition={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("shows status-transition controls requiring a reason when assigned to me", async () => {
    const onTransition = vi.fn().mockResolvedValue({ ok: true });
    render(
      <CaseActionsPanel
        isAssignedToMe={true}
        isUnassigned={false}
        assignLabel="Assign to me"
        onAssign={vi.fn().mockResolvedValue({ ok: true })}
        allowedTransitions={["TRIAGED", "DISMISSED"]}
        transitionLabel={(status) => status}
        onTransition={onTransition}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "TRIAGED" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("A reason is required for this action.")).toBeInTheDocument();
    expect(onTransition).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Initial triage." } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(onTransition).toHaveBeenCalledWith("TRIAGED", "Initial triage."));
  });

  it("shows a message when assigned to me but no further transitions are allowed", () => {
    render(
      <CaseActionsPanel
        isAssignedToMe={true}
        isUnassigned={false}
        assignLabel="Assign to me"
        onAssign={vi.fn().mockResolvedValue({ ok: true })}
        allowedTransitions={[]}
        transitionLabel={(status) => status}
        onTransition={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );
    expect(
      screen.getByText("This case has no further status transitions available."),
    ).toBeInTheDocument();
  });
});
