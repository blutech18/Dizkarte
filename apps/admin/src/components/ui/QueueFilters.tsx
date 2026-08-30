import { AppLink } from "./AppLink";
import { FilterForm } from "./FilterForm";

export type QueueFilterOption = {
  readonly value: string;
  readonly label: string;
};

export type QueueFilterSelect = {
  /** Query-string key, e.g. `status`. */
  readonly name: string;
  /** Accessible name for the control. */
  readonly label: string;
  /** Option shown when the filter is not applied, e.g. "All statuses". */
  readonly allLabel: string;
  /**
   * Value submitted by the all option. Defaults to empty, which omits the key
   * entirely.
   *
   * A queue whose default is a specific status (task media defaults to PENDING)
   * must send an explicit sentinel instead, or "all" would submit no value and
   * the page would fall straight back to its default.
   */
  readonly allValue?: string;
  /** Currently applied value, or undefined when showing everything. */
  readonly value: string | undefined;
  readonly options: ReadonlyArray<QueueFilterOption>;
};

export type QueueFilterText = {
  readonly name: string;
  readonly label: string;
  readonly placeholder: string;
  readonly value: string;
  /** Soft keyboard hint, e.g. `numeric` for a PSGC code. */
  readonly inputMode?: "numeric" | "text";
};

export type QueueFiltersProps = {
  /** Route the filters apply to, e.g. `/verification`. */
  readonly basePath: string;
  readonly search?: {
    /** Query-string key. Defaults to `q`. */
    readonly name?: string;
    readonly label: string;
    readonly placeholder: string;
    readonly value: string;
  };
  readonly selects: ReadonlyArray<QueueFilterSelect>;
  /** Additional narrow text filters, rendered after the dropdowns. */
  readonly texts?: ReadonlyArray<QueueFilterText>;
};

/**
 * One filter row for every queue page: search field and dropdowns that apply as
 * the operator types or selects, with no Apply button.
 *
 * Replaces the per-page mix of tab rows and ad-hoc selects. The tab row could
 * not scale — a nine-status queue wrapped onto three lines — and because the
 * tabs were links outside the search form, applying one silently dropped the
 * other. Here every filter is a field in one form, so they compose by
 * construction and the URL stays shareable.
 */
export function QueueFilters({ basePath, search, selects, texts = [] }: QueueFiltersProps) {
  const searchName = search?.name ?? "q";
  const hasApplied =
    Boolean(search?.value.trim()) ||
    selects.some((select) => Boolean(select.value)) ||
    texts.some((text) => Boolean(text.value.trim()));

  return (
    <FilterForm basePath={basePath} className="dk-filter-bar" autoApply>
      {search ? (
        <div className="dk-filter-bar-field dk-filter-bar-search">
          <label className="dk-visually-hidden" htmlFor={searchName}>
            {search.label}
          </label>
          <input
            className="dk-input"
            defaultValue={search.value}
            id={searchName}
            name={searchName}
            placeholder={search.placeholder}
            type="search"
          />
        </div>
      ) : null}

      {selects.map((select) => (
        <div className="dk-filter-bar-field dk-filter-bar-select" key={select.name}>
          <label className="dk-visually-hidden" htmlFor={select.name}>
            {select.label}
          </label>
          <select
            className="dk-select"
            defaultValue={select.value ?? select.allValue ?? ""}
            id={select.name}
            name={select.name}
          >
            <option value={select.allValue ?? ""}>{select.allLabel}</option>
            {select.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ))}

      {texts.map((text) => (
        <div className="dk-filter-bar-field dk-filter-bar-select" key={text.name}>
          <label className="dk-visually-hidden" htmlFor={text.name}>
            {text.label}
          </label>
          <input
            className="dk-input"
            defaultValue={text.value}
            id={text.name}
            inputMode={text.inputMode ?? "text"}
            name={text.name}
            placeholder={text.placeholder}
          />
        </div>
      ))}

      {/*
        Filters apply as the operator types or selects, so there is no Apply
        button. This stays a submit button so pressing Enter still applies
        immediately, and so the form remains usable with JavaScript disabled; it
        is hidden rather than removed because a form needs a default button for
        implicit submission.
      */}
      <button hidden type="submit">
        Apply filters
      </button>

      {/*
        Only rendered once something is applied, so the row does not carry a
        control that would do nothing.
      */}
      {hasApplied ? (
        <AppLink className="dk-btn dk-btn-text" href={basePath}>
          Clear
        </AppLink>
      ) : null}
    </FilterForm>
  );
}
