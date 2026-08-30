import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BarChart, axisTicks, niceAxisMax, type BarChartDatum } from "./BarChart";

const series = [
  { key: "completed", label: "Completed", tone: "success" as const },
  { key: "failed", label: "Failed", tone: "danger" as const },
];

const data: ReadonlyArray<BarChartDatum> = [
  { label: "Aug 1, 2026", axisLabel: "1", values: { completed: 3, failed: 1 } },
  { label: "Aug 2, 2026", axisLabel: "2", values: { completed: 6, failed: 0 } },
];

describe("niceAxisMax", () => {
  it("rounds an awkward maximum up to a readable bound", () => {
    expect(niceAxisMax(1637)).toBe(2000);
    expect(niceAxisMax(9)).toBe(10);
    expect(niceAxisMax(21)).toBe(25);
    expect(niceAxisMax(4)).toBe(5);
  });

  it("never returns zero, so bar heights can never divide by zero", () => {
    expect(niceAxisMax(0)).toBe(1);
    expect(niceAxisMax(-5)).toBe(1);
    expect(niceAxisMax(Number.NaN)).toBe(1);
  });

  it("is never smaller than the value it must contain", () => {
    // A bound below the data would render bars taller than the plot area.
    for (const value of [1, 3, 7, 9, 12, 26, 99, 101, 640, 1637, 8_999, 250_000]) {
      expect(niceAxisMax(value)).toBeGreaterThanOrEqual(value);
    }
  });
});

describe("axisTicks", () => {
  it("returns evenly spaced ticks from zero to the nice maximum", () => {
    expect(axisTicks(9, 4)).toEqual([0, 2.5, 5, 7.5, 10]);
  });
});

describe("BarChart", () => {
  it("draws one bar segment per non-zero value and exposes exact values as a table", () => {
    const { container } = render(
      <BarChart
        data={data}
        formatValue={(value) => String(value)}
        id="test-chart"
        series={series}
        summary="Bookings per day"
        title="Bookings"
      />,
    );

    // 3 non-zero segments: two on day one, one on day two.
    expect(container.querySelectorAll(".dk-chart-bar")).toHaveLength(3);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Aug 1, 2026" })).toBeInTheDocument();
    expect(container.querySelector(".dk-chart-svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("reports an empty period instead of drawing a flat baseline", () => {
    render(
      <BarChart
        data={data.map((datum) => ({ ...datum, values: { completed: 0, failed: 0 } }))}
        formatValue={(value) => String(value)}
        id="empty-chart"
        series={series}
        summary="Bookings per day"
        title="Bookings"
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("No activity recorded in this period.");
  });
});
