import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { TaskerRowActions } from "./TaskerRowActions";

describe("TaskerRowActions", () => {
  it("renders a Review button for pending applications and includes Account link", () => {
    render(
      <TaskerRowActions
        applicationId="tap-001"
        userId="user-001"
        status="SUBMITTED"
      />,
    );

    const reviewLink = screen.getByRole("link", { name: /Review/i });
    expect(reviewLink).toBeInTheDocument();
    expect(reviewLink).toHaveClass("dk-action-btn-case");
    expect(reviewLink).toHaveAttribute("href", "/taskers/tap-001");

    const accountLink = screen.getByRole("link", { name: /Account/i });
    expect(accountLink).toBeInTheDocument();
    expect(accountLink).toHaveClass("dk-action-btn-case");
    expect(accountLink).toHaveAttribute("href", "/users/user-001");
  });

  it("renders a View button for approved applications without Account link when userId is omitted", () => {
    render(
      <TaskerRowActions
        applicationId="tap-002"
        status="APPROVED"
      />,
    );

    const viewLink = screen.getByRole("link", { name: /View/i });
    expect(viewLink).toBeInTheDocument();
    expect(viewLink).toHaveClass("dk-action-btn-case");
    expect(viewLink).toHaveAttribute("href", "/taskers/tap-002");

    expect(screen.queryByRole("link", { name: /Account/i })).not.toBeInTheDocument();
  });
});
