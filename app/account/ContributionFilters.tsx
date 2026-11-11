"use client";

// The contribution query remains local to the private profile, but one
// native fieldset replaces two dense rows of chips: both dimensions stay
// explicit, compact and keyboard-native. State lives in useContributions.

import { useMessages } from "../lib/use-messages";
import { STATUS_FILTERS, TYPE_FILTERS } from "../lib/useContributions";
import type { ContributionSummary, StatusFilter, TypeFilter } from "../lib/useContributions";

type Props = {
  filter: StatusFilter;
  typeFilter: TypeFilter;
  summary: ContributionSummary | null;
  selectFilter: (next: StatusFilter) => void;
  selectTypeFilter: (next: TypeFilter) => void;
  clearContributionFilters: () => void;
};

export function ContributionFilters({ filter, typeFilter, summary, selectFilter, selectTypeFilter, clearContributionFilters }: Props) {
  const community = useMessages().community;
  return (
    <fieldset className="contributions-filter-bar">
      <legend>{community.contributionFilters}</legend>
      <div className="contribution-filter-field">
        <label htmlFor="contribution-type-filter">{community.typeFilterLabel}</label>
        <select
          id="contribution-type-filter"
          value={typeFilter}
          onChange={(event) => selectTypeFilter(event.target.value as TypeFilter)}
        >
          {TYPE_FILTERS.map((key) => (
            <option key={key} value={key}>{community.typeFilters[key]}</option>
          ))}
        </select>
      </div>
      <div className="contribution-filter-field">
        <label htmlFor="contribution-status-filter">{community.contributionStatusFilter}</label>
        <select
          id="contribution-status-filter"
          value={filter}
          onChange={(event) => selectFilter(event.target.value as StatusFilter)}
        >
          {STATUS_FILTERS.map((key) => {
            const count = key === "all" ? undefined : summary?.byStatus[key];
            return (
              <option key={key} value={key}>
                {`${community.statusFilters[key]}${count === undefined ? "" : ` (${count})`}`}
              </option>
            );
          })}
        </select>
      </div>
      {filter !== "all" || typeFilter !== "all" ? (
        <button className="text-button contribution-filter-reset" type="button" onClick={clearContributionFilters}>
          {community.clearContributionFilters}
        </button>
      ) : null}
    </fieldset>
  );
}
