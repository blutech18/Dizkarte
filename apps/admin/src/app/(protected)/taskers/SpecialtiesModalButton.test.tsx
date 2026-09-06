import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SpecialtiesModalButton } from "./SpecialtiesModalButton";

describe("SpecialtiesModalButton", () => {
  it("renders 'None listed' when specialties array is empty", () => {
    render(<SpecialtiesModalButton specialties={[]} applicantName="R. Bautista" />);
    expect(screen.getByText("None listed")).toBeDefined();
  });

  it("renders count button with singular or plural label", () => {
    const { rerender } = render(
      <SpecialtiesModalButton specialties={["Home cleaning"]} applicantName="R. Bautista" />
    );
    expect(screen.getByText("1")).toBeDefined();
    expect(screen.getByText("Specialty")).toBeDefined();

    rerender(
      <SpecialtiesModalButton
        specialties={["Home cleaning", "Laundry"]}
        applicantName="R. Bautista"
      />
    );
    expect(screen.getByText("2")).toBeDefined();
    expect(screen.getByText("Specialties")).toBeDefined();
  });

  it("opens modal on click displaying the list of specialties and applicant name", () => {
    render(
      <SpecialtiesModalButton
        specialties={["Home cleaning", "Laundry", "Appliance repair"]}
        applicantName="R. Bautista"
      />
    );

    const button = screen.getByRole("button", { name: /view 3 specialties/i });
    fireEvent.click(button);

    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText("Specialties (3)")).toBeDefined();
    expect(screen.getByText("R. Bautista")).toBeDefined();
    expect(screen.getByText("Home cleaning")).toBeDefined();
    expect(screen.getByText("Laundry")).toBeDefined();
    expect(screen.getByText("Appliance repair")).toBeDefined();
  });

  it("closes modal on Close button click and Escape key", () => {
    render(
      <SpecialtiesModalButton
        specialties={["Home cleaning"]}
        applicantName="R. Bautista"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /view 1 specialty/i }));
    expect(screen.getByRole("dialog")).toBeDefined();

    const closeBtn = screen.getByRole("button", { name: "Close" });
    fireEvent.click(closeBtn);
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /view 1 specialty/i }));
    expect(screen.getByRole("dialog")).toBeDefined();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
