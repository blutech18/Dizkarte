import type { ReactNode } from "react";

export type BarChartTone = "primary" | "success" | "warning" | "danger" | "neutral";

export type BarChartSeries = {
  readonly key: string;
  readonly label: string;
  readonly tone: BarChartTone;
};

export type BarChartDatum = {
  /** Full label used by the accessible table, e.g. `Aug 12, 2026`. */
  readonly label: string;
  /** Compact axis label, e.g. `12`. */
  readonly axisLabel: string;
  readonly values: Readonly<Record<string, number>>;
};

/**
 * Round a maximum up to a readable axis bound (1, 2, 2.5 or 5 x 10^n).
 *
 * Without this the top gridline lands on values like 1,637, which is precise but
 * unreadable; the owner reads the shape of the series, not the axis arithmetic.
 */
export function niceAxisMax(rawMax: number): number {
  if (!Number.isFinite(rawMax) || rawMax <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rawMax));
  const normalized = rawMax / magnitude;
  // `normalized` is in [1, 10), so the final branch is required: without it a
  // value like 9 would round *down* to 5 and its bar would overflow the plot.
  const step =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

/** Evenly spaced axis values from 0 to the nice maximum, inclusive. */
export function axisTicks(rawMax: number, tickCount = 4): ReadonlyArray<number> {
  const max = niceAxisMax(rawMax);
  return Array.from({ length: tickCount + 1 }, (_, index) => (max / tickCount) * index);
}

// A fixed coordinate system keeps bar geometry and label spacing predictable;
// the SVG then scales to any container width.
const VIEW_WIDTH = 760;
const VIEW_HEIGHT = 260;
const PLOT = { top: 12, right: 8, bottom: 30, left: 56 } as const;
const PLOT_WIDTH = VIEW_WIDTH - PLOT.left - PLOT.right;
const PLOT_HEIGHT = VIEW_HEIGHT - PLOT.top - PLOT.bottom;

export type BarChartProps = {
  readonly title: string;
  readonly description?: string;
  /** Rendered under the heading at full width, e.g. the period total. */
  readonly meta?: ReactNode;
  readonly data: ReadonlyArray<BarChartDatum>;
  readonly series: ReadonlyArray<BarChartSeries>;
  /** Formats axis ticks and the accessible table values. */
  readonly formatValue: (value: number) => string;
  /** Sentence describing the series for screen readers and empty states. */
  readonly summary: string;
  readonly id: string;
};

/**
 * Stacked vertical bar chart drawn as plain SVG.
 *
 * Deliberately not a charting dependency: the console needs one chart shape, and
 * the series is server-rendered, so a client-side library would add bundle weight
 * and a hydration boundary for no gain.
 *
 * Accessibility: the graphic itself is `aria-hidden` and the same numbers are
 * exposed as a real table, so a screen reader reads exact values instead of a
 * summary of pixels.
 */
export function BarChart({
  title,
  description,
  meta,
  data,
  series,
  formatValue,
  summary,
  id,
}: BarChartProps) {
  const titleId = `${id}-title`;
  const totals = data.map((datum) =>
    series.reduce((sum, item) => sum + Math.max(0, datum.values[item.key] ?? 0), 0),
  );
  const rawMax = Math.max(0, ...totals);
  const hasData = rawMax > 0;
  const axisMax = niceAxisMax(rawMax);
  const ticks = axisTicks(rawMax);

  const slot = data.length > 0 ? PLOT_WIDTH / data.length : PLOT_WIDTH;
  // Cap the bar width so a short series renders columns, not slabs.
  const barWidth = Math.min(slot * 0.62, 46);
  const yFor = (value: number) => PLOT.top + PLOT_HEIGHT - (value / axisMax) * PLOT_HEIGHT;
  // Thin the axis labels instead of letting them collide.
  const labelEvery = Math.ceil(data.length / 12);

  return (
    <figure className="dk-chart-card" aria-labelledby={titleId}>
      <figcaption className="dk-chart-head">
        <h2 id={titleId}>{title}</h2>
        {description ? <p>{description}</p> : null}
        {meta ? <div className="dk-chart-meta">{meta}</div> : null}
      </figcaption>

      {series.length > 1 ? (
        <ul className="dk-chart-legend">
          {series.map((item) => (
            <li key={item.key}>
              <span className={`dk-chart-swatch dk-chart-tone-${item.tone}`} aria-hidden="true" />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="dk-chart-plot">
        <svg
          aria-hidden="true"
          className="dk-chart-svg"
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        >
          {ticks.map((tick) => {
            const y = yFor(tick);
            return (
              <g key={tick}>
                <line
                  className={tick === 0 ? "dk-chart-axis-line" : "dk-chart-gridline"}
                  x1={PLOT.left}
                  x2={VIEW_WIDTH - PLOT.right}
                  y1={y}
                  y2={y}
                />
                <text className="dk-chart-tick" x={PLOT.left - 10} y={y + 4} textAnchor="end">
                  {formatValue(tick)}
                </text>
              </g>
            );
          })}

          {hasData
            ? data.map((datum, index) => {
                const center = PLOT.left + slot * index + slot / 2;
                let cursor = 0;
                return (
                  <g key={datum.label}>
                    {series.map((item) => {
                      const value = Math.max(0, datum.values[item.key] ?? 0);
                      if (value <= 0) return null;
                      const height = (value / axisMax) * PLOT_HEIGHT;
                      const y = yFor(cursor + value);
                      cursor += value;
                      return (
                        <rect
                          className={`dk-chart-bar dk-chart-tone-${item.tone}`}
                          height={height}
                          key={item.key}
                          width={barWidth}
                          x={center - barWidth / 2}
                          y={y}
                        />
                      );
                    })}
                  </g>
                );
              })
            : null}

          {data.map((datum, index) =>
            index % labelEvery === 0 ? (
              <text
                className="dk-chart-axis-label"
                key={datum.label}
                textAnchor="middle"
                x={PLOT.left + slot * index + slot / 2}
                y={VIEW_HEIGHT - 10}
              >
                {datum.axisLabel}
              </text>
            ) : null,
          )}
        </svg>

        {!hasData ? (
          <p className="dk-chart-empty" role="status">
            No activity recorded in this period.
          </p>
        ) : null}
      </div>

      <details className="dk-chart-data">
        <summary>View data</summary>
        <div className="dk-table-wrap">
          <table className="dk-table">
            <caption className="dk-visually-hidden">{summary}</caption>
            <thead>
              <tr>
                <th scope="col">Day</th>
                {series.map((item) => (
                  <th key={item.key} scope="col">
                    {item.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((datum) => (
                <tr key={datum.label}>
                  <th scope="row">{datum.label}</th>
                  {series.map((item) => (
                    <td key={item.key}>{formatValue(datum.values[item.key] ?? 0)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
