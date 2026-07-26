import type { ReactNode } from "react";

export type ColumnDef<T> = {
  readonly key: string;
  readonly header: string;
  readonly render: (row: T) => ReactNode;
  /** Included in the narrow-viewport card view. Defaults to true. */
  readonly showInCard?: boolean;
};

export type RecordListProps<T> = {
  readonly rows: ReadonlyArray<T>;
  readonly columns: ReadonlyArray<ColumnDef<T>>;
  readonly getRowKey: (row: T) => string;
  readonly caption: string;
  readonly cardTitle: (row: T) => ReactNode;
};

/**
 * Renders a full data table on wide viewports and an accessible card list on
 * narrow viewports (mobile-first/responsive Admin requirement) without
 * duplicating data fetching. Both representations expose the same
 * information; the card list never hides a column silently without also
 * being reachable via the record detail link.
 */
export function RecordList<T>({
  rows,
  columns,
  getRowKey,
  caption,
  cardTitle,
}: RecordListProps<T>) {
  return (
    <>
      <div className="dk-table-wrap">
        <table className="dk-table dk-table-desktop">
          <caption className="dk-visually-hidden">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={getRowKey(row)}>
                {columns.map((column) => (
                  <td key={column.key}>{column.render(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="dk-record-cards" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {rows.map((row) => (
          <li key={getRowKey(row)} className="dk-record-card">
            <strong>{cardTitle(row)}</strong>
            <dl style={{ margin: 0 }}>
              {columns
                .filter((column) => column.showInCard !== false)
                .map((column) => (
                  <div key={column.key} className="dk-record-card-row">
                    <dt>{column.header}</dt>
                    <dd>{column.render(row)}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
