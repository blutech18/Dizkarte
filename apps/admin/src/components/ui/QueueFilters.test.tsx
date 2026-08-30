import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueueFilters } from "./QueueFilters";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const statusSelect = {
  name: "status",
  label: "Filter by case status",
  allLabel: "All cases",
  value: undefined as string | undefined,
  options: [
    { value: "SUBMITTED", label: "Awaiting review" },
    { value: "APPROVED", label: "Approved" },
  ],
};

function renderFilters(overrides?: { searchValue?: string; statusValue?: string | undefined }) {
  return render(
    <QueueFilters
      basePath="/verification"
      search={{
        label: "Search verification cases by name",
        placeholder: "Search by display name",
        value: overrides?.searchValue ?? "",
      }}
      selects={[{ ...statusSelect, value: overrides?.statusValue }]}
    />,
  );
}

function searchBox() {
  return screen.getByRole("searchbox", { name: "Search verification cases by name" });
}

function statusBox() {
  return screen.getByRole("combobox", { name: "Filter by case status" });
}

describe("QueueFilters", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    push.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the search field and the dropdown without an Apply button", () => {
    renderFilters();

    expect(screen.getByRole("search")).toHaveAttribute("action", "/verification");
    expect(searchBox()).toBeInTheDocument();
    expect(statusBox()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
  });

  it("offers plain-language options, never the raw enum", () => {
    renderFilters();

    expect(screen.getByRole("option", { name: "All cases" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Awaiting review" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "SUBMITTED" })).toBeNull();
  });

  it("applies a dropdown choice immediately", () => {
    renderFilters();

    fireEvent.change(statusBox(), { target: { value: "APPROVED" } });

    expect(push).toHaveBeenCalledWith("/verification?status=APPROVED");
  });

  it("waits for typing to settle before applying a search", () => {
    renderFilters();

    fireEvent.change(searchBox(), { target: { value: "mar" } });
    fireEvent.change(searchBox(), { target: { value: "maria" } });

    // Still mid-word: applying here would fire a request per keystroke.
    expect(push).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/verification?q=maria");
  });

  it("keeps the search term when the dropdown changes, and vice versa", () => {
    renderFilters({ searchValue: "maria" });

    fireEvent.change(statusBox(), { target: { value: "APPROVED" } });

    expect(push).toHaveBeenCalledWith("/verification?q=maria&status=APPROVED");
  });

  it("applies at once on Enter rather than waiting out the debounce", () => {
    renderFilters();

    fireEvent.change(searchBox(), { target: { value: "maria" } });
    fireEvent.submit(screen.getByRole("search"));

    expect(push).toHaveBeenCalledWith("/verification?q=maria");

    // The pending debounce must not fire a second, duplicate navigation.
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("drops the page number so a new filter starts at the first page", () => {
    renderFilters();

    fireEvent.change(statusBox(), { target: { value: "SUBMITTED" } });

    expect(push).toHaveBeenCalledWith("/verification?status=SUBMITTED");
  });

  it("returns to the bare path when a filter is cleared", () => {
    renderFilters({ statusValue: "APPROVED" });

    fireEvent.change(statusBox(), { target: { value: "" } });

    expect(push).toHaveBeenCalledWith("/verification");
  });

  it("submits an explicit all value for a queue with a non-empty default", () => {
    // Task media defaults to PENDING, so an empty submission would silently
    // re-apply that default instead of showing every attachment.
    render(
      <QueueFilters
        basePath="/media"
        selects={[
          {
            name: "status",
            label: "Filter by attachment status",
            allLabel: "All attachments",
            allValue: "all",
            value: "PENDING",
            options: [{ value: "PENDING", label: "Waiting for review" }],
          },
        ]}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Filter by attachment status" }), {
      target: { value: "all" },
    });

    expect(push).toHaveBeenCalledWith("/media?status=all");
  });

  it("only offers Clear once a filter is applied", () => {
    const { unmount } = renderFilters();
    expect(screen.queryByRole("link", { name: "Clear" })).toBeNull();
    unmount();

    renderFilters({ searchValue: "maria" });
    expect(screen.getByRole("link", { name: "Clear" })).toHaveAttribute("href", "/verification");
  });

  it("does not navigate after unmount when a keystroke is still pending", () => {
    const { unmount } = renderFilters();

    fireEvent.change(searchBox(), { target: { value: "maria" } });
    unmount();

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(push).not.toHaveBeenCalled();
  });
});
