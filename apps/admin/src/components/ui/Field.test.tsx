import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Field, Breadcrumbs } from "./Field";

describe("Field accessibility wiring", () => {
  it("associates the label with the control via htmlFor/id", () => {
    render(
      <Field id="email" label="Email">
        <input type="email" />
      </Field>,
    );
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("id", "email");
  });

  it("points aria-describedby at the description and error elements", () => {
    render(
      <Field id="pw" label="Password" description="Use 12+ characters." error="Too short.">
        <input type="password" />
      </Field>,
    );
    const input = screen.getByLabelText("Password");
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(describedBy.split(" ")).toEqual(expect.arrayContaining(["pw-desc", "pw-error"]));
    // The referenced elements must actually exist in the document.
    expect(document.getElementById("pw-desc")).toHaveTextContent("Use 12+ characters.");
    expect(document.getElementById("pw-error")).toHaveTextContent("Too short.");
  });

  it("marks the control invalid and surfaces the error via role=alert", () => {
    render(
      <Field id="name" label="Name" error="Required.">
        <input type="text" />
      </Field>,
    );
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Required.");
  });

  it("exposes aria-required when the field is required", () => {
    render(
      <Field id="cat" label="Category" required>
        <select>
          <option>General</option>
        </select>
      </Field>,
    );
    expect(screen.getByLabelText("Category")).toHaveAttribute("aria-required", "true");
  });

  it("owns the control id (guaranteeing label association) and merges an existing aria-describedby", () => {
    render(
      <Field id="field-id" label="Notes" description="Optional.">
        <textarea id="own-id" aria-describedby="hint" />
      </Field>,
    );
    // The Field id is forced onto the control so `htmlFor` always resolves.
    const input = screen.getByLabelText("Notes");
    expect(input).toHaveAttribute("id", "field-id");
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(describedBy.split(" ")).toEqual(expect.arrayContaining(["hint", "field-id-desc"]));
  });
});

describe("Breadcrumbs accessibility", () => {
  it("renders a labeled nav and marks the current page", () => {
    render(
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Categories", href: "/categories" },
          { label: "Plumbing" },
        ]}
      />,
    );
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
    expect(screen.getByText("Plumbing")).toHaveAttribute("aria-current", "page");
  });
});
