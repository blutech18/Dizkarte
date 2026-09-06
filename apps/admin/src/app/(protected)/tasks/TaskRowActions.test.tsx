import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { TaskRowActions } from "./TaskRowActions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("./actions", () => ({
  moderateTaskAction: vi.fn(async () => ({ ok: true })),
}));

describe("TaskRowActions", () => {
  it("renders Remove button for active tasks without View link by default", () => {
    render(<TaskRowActions taskId="tsk-001" status="OPEN" />);

    expect(screen.getByRole("button", { name: /Remove/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /View/i })).not.toBeInTheDocument();
  });

  it("renders View link with correct href when showViewLink is true", () => {
    render(<TaskRowActions taskId="tsk-002" status="OPEN" showViewLink />);

    const viewLink = screen.getByRole("link", { name: /View/i });
    expect(viewLink).toBeInTheDocument();
    expect(viewLink).toHaveAttribute("href", "/tasks/tsk-002");
    expect(viewLink).toHaveClass("dk-action-btn");
  });

  it("renders Restore button when task is REMOVED", () => {
    render(<TaskRowActions taskId="tsk-003" status="REMOVED" />);

    expect(screen.getByRole("button", { name: /Restore/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove/i })).not.toBeInTheDocument();
  });
});
