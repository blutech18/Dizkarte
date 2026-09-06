"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SVGProps,
} from "react";
import { AppLink } from "./AppLink";
import { FilterForm, useFilterForm } from "./FilterForm";

function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function buildClearHref(
  basePath: string,
  selects: ReadonlyArray<QueueFilterSelect>,
): string {
  const params = new URLSearchParams();
  for (const select of selects) {
    if (select.allValue) {
      params.set(select.name, select.allValue);
    }
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function FilterBarActions({
  clearHref,
  hasActiveFilters,
  onClear,
}: {
  readonly clearHref: string;
  readonly hasActiveFilters: boolean;
  readonly onClear: () => void;
}) {
  const { pending } = useFilterForm();

  return (
    <div className="dk-filter-bar-actions">
      <AppLink
        className="dk-btn dk-btn-secondary dk-filter-bar-clear"
        href={clearHref}
        title={
          pending
            ? "Updating..."
            : hasActiveFilters
              ? "Clear all active filters"
              : "No active filters to clear"
        }
        aria-disabled={pending || !hasActiveFilters ? "true" : undefined}
        aria-busy={pending}
        tabIndex={pending || !hasActiveFilters ? -1 : undefined}
        onClick={(e) => {
          if (pending || !hasActiveFilters) {
            e.preventDefault();
            return;
          }
          onClear();
        }}
      >
        {pending ? (
          <>
            <span className="dk-spinner" aria-hidden="true" />
            <span>Updating...</span>
          </>
        ) : (
          <>
            <XIcon width={14} height={14} aria-hidden="true" />
            <span>Clear</span>
          </>
        )}
      </AppLink>
    </div>
  );
}

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
  const formRef = useRef<HTMLFormElement | null>(null);

  const computeHasActive = useCallback(
    (form: HTMLFormElement | null) => {
      if (form) {
        if (search) {
          const input = form.querySelector<HTMLInputElement>(`input[name="${searchName}"]`);
          const val = input ? input.value : (new FormData(form).get(searchName) as string | null);
          if (typeof val === "string" && val.trim() !== "") return true;
        }
        for (const select of selects) {
          const selectEl = form.querySelector<HTMLSelectElement>(`select[name="${select.name}"]`);
          const val = selectEl
            ? selectEl.value
            : (new FormData(form).get(select.name) as string | null);
          const allVal = select.allValue ?? "";
          if (typeof val === "string" && val !== allVal && val !== "") return true;
        }
        for (const text of texts) {
          const input = form.querySelector<HTMLInputElement>(`input[name="${text.name}"]`);
          const val = input ? input.value : (new FormData(form).get(text.name) as string | null);
          if (typeof val === "string" && val.trim() !== "") return true;
        }
        return false;
      }

      const hasSearch = Boolean(search?.value.trim());
      const hasSelects = selects.some((select) => {
        const allVal = select.allValue ?? "";
        return select.value !== undefined && select.value !== allVal && select.value !== "";
      });
      const hasTexts = texts.some((text) => Boolean(text.value.trim()));
      return hasSearch || hasSelects || hasTexts;
    },
    [search, searchName, selects, texts],
  );

  const [hasActiveFilters, setHasActiveFilters] = useState(() => computeHasActive(null));

  useEffect(() => {
    setHasActiveFilters(computeHasActive(formRef.current));
  }, [computeHasActive]);

  const handleFormInput = useCallback(
    (form: HTMLFormElement) => {
      setHasActiveFilters(computeHasActive(form));
    },
    [computeHasActive],
  );

  const handleClear = useCallback(() => {
    const form = formRef.current;
    if (form) {
      const searchInputs = form.querySelectorAll<HTMLInputElement>(`input[name="${searchName}"]`);
      searchInputs.forEach((input) => {
        input.value = "";
      });
      for (const text of texts) {
        const textInputs = form.querySelectorAll<HTMLInputElement>(`input[name="${text.name}"]`);
        textInputs.forEach((input) => {
          input.value = "";
        });
      }
      for (const select of selects) {
        const selectEls = form.querySelectorAll<HTMLSelectElement>(`select[name="${select.name}"]`);
        selectEls.forEach((sel) => {
          sel.value = select.allValue ?? "";
        });
      }
    }
    setHasActiveFilters(false);
  }, [searchName, texts, selects]);

  return (
    <FilterForm
      basePath={basePath}
      className="dk-filter-bar"
      autoApply
      formRef={formRef}
      onFormInput={handleFormInput}
    >
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
        The Clear button remains solidly in its place on the far right at all times,
        disabled when no filter is used and dynamically enabled when filters are active.
      */}
      <FilterBarActions
        clearHref={buildClearHref(basePath, selects)}
        hasActiveFilters={hasActiveFilters}
        onClear={handleClear}
      />
    </FilterForm>
  );
}
