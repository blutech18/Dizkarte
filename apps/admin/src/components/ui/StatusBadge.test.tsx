import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("always renders literal text alongside the color tone", () => {
    render(<StatusBadge tone="success" label="Approved" />);
    expect(screen.getByText("Approved")).toBeInTheDocument();
  });

  it("renders an optional icon as decorative (aria-hidden)", () => {
    render(<StatusBadge tone="warning" label="Pending" icon={<span data-testid="icon">!</span>} />);
    const icon = screen.getByTestId("icon");
    expect(icon.parentElement).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });
});
