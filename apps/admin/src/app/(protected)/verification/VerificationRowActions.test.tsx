import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { VerificationRowActions } from "./VerificationRowActions";

describe("VerificationRowActions", () => {
  it("renders a Review button with dk-action-btn-case class for open cases", () => {
    render(
      <VerificationRowActions
        caseId="ver-001"
        userId="user-001"
        status="SUBMITTED"
      />,
    );

    const reviewLink = screen.getByRole("link", { name: /Review/i });
    expect(reviewLink).toBeInTheDocument();
    expect(reviewLink).toHaveClass("dk-action-btn-case");
    expect(reviewLink).toHaveAttribute("href", "/verification/ver-001");

    const accountLink = screen.getByRole("link", { name: /Account/i });
    expect(accountLink).toBeInTheDocument();
    expect(accountLink).toHaveClass("dk-action-btn-case");
    expect(accountLink).toHaveAttribute("href", "/users/user-001");
  });

  it("renders a View button with the same dk-action-btn-case class for closed cases", () => {
    render(
      <VerificationRowActions
        caseId="ver-002"
        status="APPROVED"
      />,
    );

    const viewLink = screen.getByRole("link", { name: /View/i });
    expect(viewLink).toBeInTheDocument();
    expect(viewLink).toHaveClass("dk-action-btn-case");
    expect(viewLink).toHaveAttribute("href", "/verification/ver-002");

    expect(screen.queryByRole("link", { name: /Account/i })).not.toBeInTheDocument();
  });
});
