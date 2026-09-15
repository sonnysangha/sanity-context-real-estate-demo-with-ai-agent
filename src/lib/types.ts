export type Listing = {
  _id: string;
  title: string;
  slug: string;
  monthlyRent: number;
  currency: "USD";
  bedrooms: number;
  bathrooms: number;
  squareFeet: number;
  furnished: boolean;
  petsAllowed: boolean;
  inUnitLaundry: boolean;
  status: "available" | "rented";
  availableFrom: string;
  description: string;
  neighbourhood: string;
  borough: string;
  image: string;
  imageAlt: string;
  features: string[];
  _score?: number;
};
export type SearchFilters = {
  neighbourhood: string;
  maxRent: string;
  bedrooms: string;
  furnished: boolean;
  petsAllowed: boolean;
  inUnitLaundry: boolean;
  availableBy: string;
  sort: "price-asc" | "price-desc" | "recommended";
};
export const defaultFilters: SearchFilters = {
  neighbourhood: "",
  maxRent: "",
  bedrooms: "",
  furnished: false,
  petsAllowed: false,
  inUnitLaundry: false,
  availableBy: "",
  sort: "recommended",
};
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  manualFilters?: Partial<SearchFilters>;
  parts?: ChatPart[];
};
export type ChatPart =
  | { type: "text"; text: string }
  | { type: "tool"; call: AgentToolCall }
  | { type: "filters"; activity: import("./filter-activity").FilterActivity };
export type QueryTrace = {
  query: string;
  querySource?: "executed" | "submitted";
  resultCount: number;
  listingIds: string[];
  durationMs: number;
  timestamp: string;
};
export const HERO_PROMPT =
  "Find available furnished two-bedroom apartments in Williamsburg, Brooklyn, under $4,500 per month that allow pets and have in-unit laundry. Sort by lowest rent.";
export const affiliateUrl = "https://www.sanity.io/sonny";
export const money = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
export const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

export type AgentToolCall = {
  id: string;
  name: "groq_query" | "schema_explorer";
  status: "running" | "completed" | "error" | "cancelled";
  input: Record<string, string>;
  startedAt: string;
  durationMs?: number;
  summary?: string;
  trace?: QueryTrace;
};
