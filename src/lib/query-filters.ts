import { parse, type ExprNode } from "groq-js";
import { defaultFilters, type SearchFilters } from "./types";

// Read only the root selector: semantic functions later in the pipeline do not
// need a local implementation, and preferences must never become hard filters.
export function queryFilters(query: string): SearchFilters | null {
  const start = query.match(/^\s*\*\s*\[/);
  if (!start) return null;
  let depth = 1,
    quote = "",
    end = start[0].length;
  for (; end < query.length; end++) {
    const char = query[end];
    if (quote) {
      if (char === "\\") end++;
      else if (char === quote) quote = "";
    } else if (char === '"' || char === "'") quote = char;
    else if (
      query.slice(end, end + 2) === "//" ||
      query.slice(end, end + 2) === "/*"
    )
      return null;
    else if (char === "[") depth++;
    else if (char === "]" && --depth === 0) break;
  }
  if (depth !== 0) return null;
  try {
    const root = parse(query.slice(0, end + 1));
    if (root.type !== "Filter" || root.base.type !== "Everything") return null;
    const filters = { ...defaultFilters };
    function path(node: ExprNode): string {
      if (node.type === "Deref") return path(node.base) + "->";
      if (node.type !== "AccessAttribute") return "";
      if (!node.base) return node.name;
      const parent = path(node.base);
      return parent
        ? parent + (parent.endsWith("->") ? "" : ".") + node.name
        : "";
    }
    function visit(node: ExprNode) {
      if (node.type === "And") {
        visit(node.left);
        visit(node.right);
        return;
      }
      if (node.type === "Group") {
        visit(node.base);
        return;
      }
      // Never promote optional OR branches or nested selectors into requirements.
      if (node.type !== "OpCall" || node.right.type !== "Value") return;
      const field = path(node.left),
        value = node.right.value;
      if (
        field === "monthlyRent" &&
        node.op === "<" &&
        typeof value === "number" &&
        value > 0
      )
        filters.maxRent = String(
          Math.min(Number(filters.maxRent) || Infinity, value),
        );
      if (field === "bedrooms" && node.op === "==" && [1, 2, 3].includes(value))
        filters.bedrooms = String(value);
      if (
        ["furnished", "petsAllowed", "inUnitLaundry"].includes(field) &&
        node.op === "==" &&
        value === true
      )
        filters[field as "furnished" | "petsAllowed" | "inUnitLaundry"] = true;
      if (
        field === "availableFrom" &&
        node.op === "<=" &&
        typeof value === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(value)
      )
        filters.availableBy =
          filters.availableBy && filters.availableBy < value
            ? filters.availableBy
            : value;
      if (
        field === "neighbourhood->slug.current" &&
        node.op === "==" &&
        typeof value === "string"
      ) {
        const names: Record<string, string> = {
          williamsburg: "Williamsburg",
          greenpoint: "Greenpoint",
          "long-island-city": "Long Island City",
          "east-village": "East Village",
        };
        if (names[value]) filters.neighbourhood = names[value];
      }
    }
    visit(root.expr);
    return filters;
  } catch {
    return null;
  }
}
