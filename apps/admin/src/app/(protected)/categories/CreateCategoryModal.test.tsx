import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CreateCategoryModal } from "./CreateCategoryModal";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("./actions", () => ({
  createCategoryAction: vi.fn(),
}));

describe("CreateCategoryModal", () => {
  it("renders trigger button and opens dialog on click", () => {
    render(<CreateCategoryModal />);
    const trigger = screen.getByRole("button", { name: /Add category/i });
    expect(trigger).toBeInTheDocument();

    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(trigger);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Add category" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Slug")).toBeInTheDocument();
  });

  it("closes modal when Cancel button is clicked", () => {
    render(<CreateCategoryModal />);
    fireEvent.click(screen.getByRole("button", { name: /Add category/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    fireEvent.click(cancelButton);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes modal when Close icon button is clicked", () => {
    render(<CreateCategoryModal />);
    fireEvent.click(screen.getByRole("button", { name: /Add category/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const closeIconButton = screen.getByRole("button", { name: "Close" });
    fireEvent.click(closeIconButton);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes modal on Escape key", () => {
    render(<CreateCategoryModal />);
    fireEvent.click(screen.getByRole("button", { name: /Add category/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
