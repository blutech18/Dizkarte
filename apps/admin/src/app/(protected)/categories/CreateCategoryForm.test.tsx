import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const createCategoryAction = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("./actions", () => ({
  createCategoryAction: (...args: unknown[]) => createCategoryAction(...args),
}));

import { CreateCategoryForm } from "./CreateCategoryForm";

describe("CreateCategoryForm", () => {
  it("auto-derives a slug from the name until the slug field is edited directly", () => {
    render(<CreateCategoryForm />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Pet Grooming Deluxe" } });
    expect(screen.getByLabelText("Slug")).toHaveValue("pet-grooming-deluxe");
  });

  it("submits the typed name/slug and shows a success message on success", async () => {
    createCategoryAction.mockResolvedValueOnce({ ok: true, categoryId: "cat-9999" });
    render(<CreateCategoryForm />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Pet grooming" } });
    fireEvent.click(screen.getByRole("button", { name: "Add category" }));

    await waitFor(() =>
      expect(createCategoryAction).toHaveBeenCalledWith({
        name: "Pet grooming",
        slug: "pet-grooming",
      }),
    );
    expect(await screen.findByText('Category "Pet grooming" was created.')).toBeInTheDocument();
  });

  it("shows a validation error message returned by the server action", async () => {
    createCategoryAction.mockResolvedValueOnce({
      ok: false,
      message: 'Slug "home-cleaning" is already in use.',
    });
    render(<CreateCategoryForm />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Home cleaning" } });
    fireEvent.click(screen.getByRole("button", { name: "Add category" }));

    expect(await screen.findByText('Slug "home-cleaning" is already in use.')).toBeInTheDocument();
  });
});
