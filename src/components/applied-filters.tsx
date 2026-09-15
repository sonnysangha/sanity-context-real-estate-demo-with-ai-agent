import { ChevronDown, SlidersHorizontal, ArrowRight } from "lucide-react";
import {
  filterChanges,
  filterLabels,
  filterValue,
  type FilterActivity,
} from "@/lib/filter-activity";
import type { SearchFilters } from "@/lib/types";
export default function AppliedFilters({
  activity,
}: {
  activity: FilterActivity;
}) {
  const changes = filterChanges(activity);
  const active = (Object.keys(filterLabels) as (keyof SearchFilters)[]).filter(
    (key) => key !== "sort" && Boolean(activity.after[key]),
  );
  if (activity.source !== "agent" || !changes.length) return null;
  return (
    <details className="applied-filters" aria-label="Applied filters">
      <summary>
        <SlidersHorizontal size={16} aria-hidden="true" />
        <span className="filter-widget-title">
          <strong>Applied filters</strong>
          <small>
            {changes.length
              ? `${changes.length} ${changes.length === 1 ? "change" : "changes"}`
              : "Unchanged"}{" "}
            ·{" "}
            {activity.source === "agent"
              ? "From agent results"
              : "Changed by you"}
          </small>
        </span>
        <span className="filter-widget-count">
          {activity.resultCount} {activity.resultCount === 1 ? "home" : "homes"}
        </span>
        <ChevronDown
          size={14}
          className="filter-widget-chevron"
          aria-hidden="true"
        />
      </summary>
      <div className="filter-widget-body">
        <p className="filter-activity-source">
          {activity.source === "agent"
            ? "From agent results · synced in browser"
            : "Changed in browser · by you"}
        </p>
        {changes.length ? (
          <dl>
            {changes.map((change) => (
              <div key={change.key}>
                <dt>{change.label}</dt>
                <dd>
                  <span>{change.before}</span>
                  <ArrowRight size={12} aria-hidden="true" />
                  <strong>{change.after}</strong>
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="filter-unchanged">
            Filters unchanged. Results refreshed.
          </p>
        )}
        <div className="filter-active-chips">
          {active.length ? (
            active.map((key) => (
              <span key={key}>
                {filterLabels[key]}: {filterValue(key, activity.after[key])}
              </span>
            ))
          ) : (
            <span>No additional browser filters</span>
          )}
        </div>
        <footer>
          {activity.resultCount} {activity.resultCount === 1 ? "home" : "homes"}{" "}
          shown · Refines the current results
        </footer>
      </div>
    </details>
  );
}
