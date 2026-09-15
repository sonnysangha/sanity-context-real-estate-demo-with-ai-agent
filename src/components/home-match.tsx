"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { appendResponseEvent, interruptResponse } from "@/lib/chat-transcript";
import {
  filterListings,
  neighbourhoodOptions,
  bedroomOptions,
} from "@/lib/filter-listings";
import { suggestedPrompts, semanticFollowUp } from "@/lib/suggested-prompts";
import AgentProgress from "@/components/agent-progress";
import AppliedFilters from "@/components/applied-filters";
import AgentToolsOverview from "@/components/agent-tools-overview";
import { applyManualFilters } from "@/lib/manual-filters";
import QueryInspector from "@/components/query-inspector";
import { useSavedHomes } from "@/lib/use-saved-homes";
import * as Dialog from "@radix-ui/react-dialog";
import Markdown from "react-markdown";
import {
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  Heart,
  MapPin,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Square,
  X,
  BedDouble,
  Bath,
  Maximize,
  RotateCcw,
} from "lucide-react";
import {
  affiliateUrl,
  dateLabel,
  defaultFilters,
  money,
  type ChatMessage,
  type Listing,
  type SearchFilters,
} from "@/lib/types";
export default function HomeMatch({
  initialListings,
  initialError,
}: {
  initialListings: Listing[];
  initialError: string;
}) {
  const [catalogue, setCatalogue] = useState(initialListings),
    [matches, setMatches] = useState<Listing[] | null>(null),
    [error, setError] = useState(initialError),
    [view, setView] = useState<"browse" | "saved">("browse"),
    [filters, setFilters] = useState<SearchFilters>(defaultFilters),
    [filtersOpen, setFiltersOpen] = useState(false),
    [selected, setSelected] = useState<Listing | null>(null),
    [messages, setMessages] = useState<ChatMessage[]>([]),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [chatError, setChatError] = useState("");
  const manualFilters = useRef<Partial<SearchFilters>>({});
  const detailTrigger = useRef<HTMLButtonElement | null>(null);
  const { saved, toggle } = useSavedHomes();
  const abortRef = useRef<AbortController | null>(null),
    threadRef = useRef(""),
    chatRef = useRef<HTMLDivElement>(null),
    lastPrompt = useRef("");
  useEffect(() => {
    threadRef.current = crypto.randomUUID();
    return () => abortRef.current?.abort();
  }, []);
  useEffect(() => {
    if (messages.length)
      chatRef.current?.scrollTo({
        top: chatRef.current.scrollHeight,
        behavior: "instant",
      });
  }, [messages, status]);
  function toggleSave(id: string) {
    try {
      toggle(id);
    } catch {
      setError(
        "Your browser could not save this shortlist. Enable local storage and try again.",
      );
    }
  }
  async function showSaved() {
    setView("saved");
    if (!saved.length) return;
    try {
      const response = await fetch("/api/listings?ids=" + saved.join(","));
      if (!response.ok) throw Error();
      const data = await response.json();
      setCatalogue((prev) => [
        ...prev.filter((x) => !saved.includes(x._id)),
        ...data.listings,
      ]);
    } catch {
      setError(
        "Saved homes could not be refreshed. Refresh the page to try again.",
      );
    }
  }
  function changeFilters(after: SearchFilters, clear = false) {
    const next = applyManualFilters(
      filters,
      after,
      matches,
      manualFilters.current,
    );
    setFilters(next.filters);
    setMatches(clear ? null : next.matches);
    manualFilters.current = clear ? { ...after } : next.overrides;
  }
  async function search(prompt: string, retry = false) {
    if (!prompt.trim() || busy) return;
    lastPrompt.current = prompt;
    setInput("");
    setChatError("");
    setBusy(true);
    setStatus("Connecting to your home finder…");
    const history = retry
      ? messages.filter((x) => x.content).slice(0, -1)
      : messages.filter((x) => x.content);
    const user: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt,
      manualFilters: { ...manualFilters.current },
    };
    const responseId = crypto.randomUUID();
    setMessages([
      ...history,
      user,
      { id: responseId, role: "assistant", content: "" },
    ]);
    const requestThread = threadRef.current;
    const abort = new AbortController();
    abortRef.current = abort;
    let pending: Listing[] | null = null;
    let pendingFilters: SearchFilters | null = null;
    let completed = false;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: threadRef.current,
          messages: [...history, user].map(
            ({ role, content, manualFilters }) => ({
              role,
              content,
              manualFilters,
            }),
          ),
        }),
        signal: abort.signal,
      });
      if (!response.ok) {
        const data = await response.json();
        throw Error(data.error || "Search failed. Try again.");
      }
      if (!response.body) throw Error("No search response received.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line) continue;
          if (threadRef.current !== requestThread) return;
          const event = JSON.parse(line);
          if (event.type === "tool" || event.type === "text")
            setMessages((previous) =>
              appendResponseEvent(previous, responseId, event),
            );
          if (event.type === "status") setStatus(event.text);
          if (event.type === "text") setStatus("Writing response…");
          if (event.type === "results") {
            pending = event.listings;
            pendingFilters = event.filters ?? null;
          }
          if (event.type === "error") throw Error(event.text);
          if (event.type === "done") completed = true;
        }
      }
      if (threadRef.current !== requestThread) return;
      if (!completed)
        throw Error("The connection ended early. Try the search again.");
      if (pending !== null) {
        setMatches(pending);
        const applied =
          pendingFilters &&
          filterListings(pending, pendingFilters).length === pending.length
            ? pendingFilters
            : { ...defaultFilters };
        setFilters(applied);
        manualFilters.current = {};
        setMessages((previous) =>
          appendResponseEvent(previous, responseId, {
            type: "filters",
            activity: {
              source: "agent",
              before: { ...filters },
              after: { ...applied },
              resultCount: pending!.length,
            },
          }),
        );
        setView("browse");
      }
    } catch (e) {
      if (threadRef.current !== requestThread) return;
      setMessages((previous) =>
        interruptResponse(
          previous,
          responseId,
          abort.signal.aborted ? "cancelled" : "error",
        ),
      );
      if (abort.signal.aborted)
        setChatError("Search stopped. Your previous results are still here.");
      else
        setChatError(
          e instanceof Error ? e.message : "Search failed. Try again.",
        );
    } finally {
      if (threadRef.current === requestThread) {
        setBusy(false);
        setStatus("");
      }
      if (abortRef.current === abort) abortRef.current = null;
    }
  }
  function reset() {
    abortRef.current?.abort();
    setBusy(false);
    setStatus("");
    setMessages([]);
    setMatches(null);
    setFilters(defaultFilters);
    manualFilters.current = {};
    setChatError("");
    threadRef.current = crypto.randomUUID();
  }
  const source =
    view === "saved"
      ? catalogue.filter((x) => saved.includes(x._id))
      : (matches ?? catalogue);
  const listings = filterListings(source, filters, view === "saved");
  const filterCount = Object.entries(filters).filter(
    ([k, v]) => k !== "sort" && Boolean(v),
  ).length;
  return (
    <>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="HomeMatch NYC home">
          <span className="brand-mark">
            <span />
            <span />
          </span>
          HomeMatch<span className="city-tag">NYC</span>
        </Link>
        <nav aria-label="Main navigation">
          <button
            aria-current={view === "browse" ? "page" : undefined}
            className={view === "browse" ? "nav-active" : ""}
            onClick={() => setView("browse")}
          >
            Find a home
          </button>
          <button
            aria-current={view === "saved" ? "page" : undefined}
            className={view === "saved" ? "nav-active" : ""}
            onClick={showSaved}
          >
            Saved homes{" "}
            {saved.length > 0 && <span className="count">{saved.length}</span>}
          </button>
        </nav>
        <a
          className="build-link"
          href={affiliateUrl}
          target="_blank"
          rel="sponsored noopener noreferrer"
        >
          Build your own <ArrowUpRight size={16} />
        </a>
      </header>
      <main className="page-shell">
        <section className="intro">
          <div>
            <p className="eyebrow">
              <span className="blue-dot" /> NEW YORK, YOUR WAY
            </p>
            <h1>
              A city of possibilities.
              <br />
              Find <span>your kind of home.</span>
            </h1>
          </div>
          <p className="intro-note">
            The right neighbourhood. The little must-haves.
            <br />
            Tell us what matters. We’ll narrow it down.
          </p>
        </section>
        <div className="workspace">
          <section className="catalogue" aria-label="Apartment results">
            <div className="catalogue-toolbar">
              <div>
                <span className="location-label">
                  <MapPin size={16} /> New York City <ChevronDown size={14} />
                </span>
                <p>
                  {view === "saved"
                    ? "Your shortlist"
                    : busy
                      ? "Searching… previous results shown"
                      : matches
                        ? "Your search results"
                        : "Explore the collection"}
                </p>
              </div>
              <button
                id="filters-toggle"
                className="filter-button"
                aria-expanded={filtersOpen}
                aria-controls="home-filters"
                onClick={() => setFiltersOpen(!filtersOpen)}
              >
                <SlidersHorizontal size={17} /> Filters
                {filterCount > 0 && (
                  <span className="count">{filterCount}</span>
                )}
                <ChevronDown
                  className="filters-chevron"
                  size={15}
                  aria-hidden="true"
                />
              </button>
            </div>
            <section
              id="home-filters"
              className="filter-accordion"
              data-open={filtersOpen}
              aria-labelledby="filters-toggle"
              aria-hidden={!filtersOpen}
              inert={!filtersOpen}
            >
              <div className="filter-accordion-clip">
                <fieldset className="filter-configuration" disabled={busy}>
                  <legend className="sr-only">Your must-haves</legend>
                  <div className="filter-configuration-heading">
                    <div>
                      <h2>Your must-haves</h2>
                      <p>Homes update as you make changes.</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => changeFilters(defaultFilters, true)}
                    >
                      Clear filters
                    </button>
                  </div>
                  <div className="filter-fields">
                    <label>
                      Neighbourhood
                      <select
                        value={filters.neighbourhood}
                        onChange={(e) =>
                          changeFilters({
                            ...filters,
                            neighbourhood: e.target.value,
                          })
                        }
                      >
                        <option value="">All neighbourhoods</option>
                        {neighbourhoodOptions.map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Monthly rent under
                      <input
                        type="number"
                        min="1"
                        placeholder="Any budget"
                        value={filters.maxRent}
                        onChange={(e) =>
                          changeFilters({
                            ...filters,
                            maxRent: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Bedrooms
                      <select
                        value={filters.bedrooms}
                        onChange={(e) =>
                          changeFilters({
                            ...filters,
                            bedrooms: e.target.value,
                          })
                        }
                      >
                        <option value="">Any</option>
                        {bedroomOptions.map((x) => (
                          <option key={x} value={x}>
                            {x} bedroom{x > 1 ? "s" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Available by
                      <input
                        type="date"
                        value={filters.availableBy}
                        onChange={(e) =>
                          changeFilters({
                            ...filters,
                            availableBy: e.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="filter-amenities">
                    {(
                      [
                        ["furnished", "Furnished"],
                        ["petsAllowed", "Pets allowed"],
                        ["inUnitLaundry", "In-unit laundry"],
                      ] as const
                    ).map(([key, label]) => (
                      <label className="checkbox-row" key={key}>
                        <input
                          type="checkbox"
                          checked={filters[key]}
                          onChange={(e) =>
                            changeFilters({
                              ...filters,
                              [key]: e.target.checked,
                            })
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
            </section>
            <div className="results-heading">
              <p>
                <strong>
                  {listings.length} {listings.length === 1 ? "home" : "homes"}
                </strong>{" "}
                {view === "saved"
                  ? "saved for later"
                  : matches
                    ? "matching your search"
                    : "to make your own"}
              </p>
              <label className="sort-label">
                <span className="sr-only">Sort apartments</span>
                <select
                  value={filters.sort}
                  disabled={busy}
                  onChange={(e) => {
                    const after = {
                      ...filters,
                      sort: e.target.value as SearchFilters["sort"],
                    };
                    changeFilters(after);
                  }}
                >
                  <option value="recommended">
                    {matches ? "Search order" : "Featured"}
                  </option>
                  <option value="price-asc">Rent: low to high</option>
                  <option value="price-desc">Rent: high to low</option>
                </select>
              </label>
            </div>
            {error && (
              <div className="error-banner" role="alert">
                {error}
                <button onClick={() => location.reload()}>Refresh</button>
              </div>
            )}
            {listings.length === 0 && !error ? (
              <div className="empty-state">
                <MapPin size={32} />
                <h2>
                  {view === "saved"
                    ? "Keep your favourites close."
                    : "No homes fit just yet."}
                </h2>
                <p>
                  {view === "saved"
                    ? "Tap the heart on any home to add it to your shortlist."
                    : "Try a different budget or neighbourhood, or tell the assistant which must-have you can change."}
                </p>
                <button
                  className="primary-button"
                  onClick={() => {
                    setView("browse");
                    reset();
                  }}
                >
                  Explore homes
                </button>
              </div>
            ) : (
              <div className="listing-grid">
                {listings.map((listing, index) => (
                  <article className="listing-card" key={listing._id}>
                    <div className="card-image">
                      <button
                        onClick={(e) => {
                          detailTrigger.current = e.currentTarget;
                          setSelected(listing);
                        }}
                        aria-label={"View " + listing.title}
                      >
                        <Image
                          src={listing.image}
                          alt={listing.imageAlt}
                          fill
                          sizes="(max-width:640px) 100vw, (max-width:1000px) 50vw, 30vw"
                          priority={index < 2}
                        />
                      </button>
                      <span className="image-label">
                        {listing.status === "rented"
                          ? "Rented"
                          : listing.furnished
                            ? "Furnished"
                            : "Unfurnished"}
                      </span>
                      <button
                        className={
                          "save-button " +
                          (saved.includes(listing._id) ? "is-saved" : "")
                        }
                        aria-label={
                          (saved.includes(listing._id) ? "Unsave " : "Save ") +
                          listing.title
                        }
                        aria-pressed={saved.includes(listing._id)}
                        onClick={() => toggleSave(listing._id)}
                      >
                        <Heart
                          size={18}
                          fill={
                            saved.includes(listing._id)
                              ? "currentColor"
                              : "none"
                          }
                        />
                      </button>
                    </div>
                    <div className="card-copy">
                      <div className="price-row">
                        <p>
                          <strong>{money(listing.monthlyRent)}</strong>
                          <span> / month</span>
                        </p>
                        <ArrowUpRight size={19} />
                      </div>
                      <button
                        className="listing-title"
                        onClick={(e) => {
                          detailTrigger.current = e.currentTarget;
                          setSelected(listing);
                        }}
                      >
                        {listing.title}
                      </button>
                      <p className="card-location">
                        {listing.neighbourhood}, {listing.borough}
                      </p>
                      <div className="specs">
                        <span>
                          <BedDouble size={15} />
                          {listing.bedrooms} bed
                          {listing.bedrooms !== 1 ? "s" : ""}
                        </span>
                        <span>
                          <Bath size={15} />
                          {listing.bathrooms} bath
                          {listing.bathrooms !== 1 ? "s" : ""}
                        </span>
                        <span>
                          <Maximize size={13} />
                          {listing.squareFeet.toLocaleString()} sqft
                        </span>
                      </div>
                      <div className="card-footer">
                        <span>
                          {listing.petsAllowed ? "Pet friendly" : "No pets"}
                        </span>
                        <span>
                          {listing.inUnitLaundry
                            ? "In-unit laundry"
                            : "Shared laundry"}
                        </span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <p className="catalogue-footnote">
              A fictional NYC catalogue, built for discovery. Prices are monthly
              base rent. Images are illustrative.
            </p>
          </section>
          <aside className="assistant-panel" aria-label="AI home finder">
            <div className="assistant-header">
              <div className="assistant-symbol">
                <Sparkles size={20} />
              </div>
              <div>
                <h2>Your home finder</h2>
                <p>Powered by Sanity Context</p>
              </div>
              <button
                className="icon-button"
                aria-label="Start a new conversation"
                disabled={busy}
                onClick={reset}
              >
                <Plus size={21} />
              </button>
            </div>
            <div
              className="chat-scroll"
              tabIndex={0}
              role="region"
              aria-label="Conversation"
              ref={chatRef}
              aria-live="polite"
              aria-relevant="additions text"
            >
              {messages.length === 0 ? (
                <div className="welcome">
                  <div className="welcome-icon">
                    <Sparkles size={28} />
                  </div>
                  <h3>
                    Let’s find your <br />
                    New York.
                  </h3>
                  <p>
                    A sunny spot. Space for your dog. A shorter shortlist. Tell
                    me what home looks like to you.
                  </p>
                  <div className="prompt-list">
                    <span>TRY A SEARCH</span>
                    {suggestedPrompts.map((suggestion) => (
                      <button
                        key={suggestion.id}
                        disabled={busy}
                        onClick={() => search(suggestion.prompt)}
                      >
                        {suggestion.title}
                        <br />
                        <small>{suggestion.detail}</small>
                        <ArrowUpRight size={16} />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="messages">
                  {messages.map((message) =>
                    message.parts?.[0]?.type === "filters" ? (
                      <AppliedFilters
                        key={message.id}
                        activity={message.parts[0].activity}
                      />
                    ) : message.role === "user" ? (
                      <div className="message user" key={message.id}>
                        <div>
                          <Markdown>{message.content}</Markdown>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="assistant-turn"
                        key={message.id}
                        data-response-id={message.id}
                      >
                        {(
                          message.parts ??
                          (message.content
                            ? [{ type: "text" as const, text: message.content }]
                            : [])
                        ).map((part, index) =>
                          part.type === "tool" ? (
                            <QueryInspector
                              key={part.call.id}
                              calls={[part.call]}
                            />
                          ) : part.type === "filters" ? (
                            <AppliedFilters
                              key={`filters-${index}`}
                              activity={part.activity}
                            />
                          ) : (
                            <div
                              className="message assistant"
                              key={`text-${index}`}
                            >
                              <span className="message-avatar">
                                <Sparkles size={14} />
                              </span>
                              <div>
                                <Markdown>{part.text}</Markdown>
                              </div>
                            </div>
                          ),
                        )}
                        {busy &&
                          message.id === messages.at(-1)?.id &&
                          !message.content && (
                            <AgentProgress text={status || "Thinking…"} />
                          )}
                      </div>
                    ),
                  )}
                </div>
              )}
              {busy && messages.at(-1)?.content && (
                <AgentProgress
                  className="search-status"
                  text={status || "Writing response…"}
                />
              )}
              {chatError && (
                <div className="chat-error" role="alert">
                  <p>{chatError}</p>
                  <button
                    onClick={() => search(lastPrompt.current, true)}
                    disabled={busy}
                  >
                    <RotateCcw size={14} /> Retry search
                  </button>
                </div>
              )}
            </div>
            <div className="composer-area">
              {messages.length > 0 && !busy && (
                <div className="follow-ups">
                  <button onClick={() => search(semanticFollowUp)}>
                    More light & workspace
                  </button>
                  <button
                    onClick={() =>
                      search(
                        "Keep the same criteria, but lower the budget to under $4,000.",
                      )
                    }
                  >
                    Under $4,000
                  </button>
                  <button
                    onClick={() =>
                      search(
                        "Keep the same criteria and check live availability again.",
                      )
                    }
                  >
                    Check again
                  </button>
                </div>
              )}
              <form
                noValidate
                className="composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  search(input);
                }}
              >
                <label className="sr-only" htmlFor="home-prompt">
                  Describe your ideal home
                </label>
                <textarea
                  className="resize-none"
                  id="home-prompt"
                  placeholder="Tell me about your ideal home…"
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height =
                      Math.min(e.target.scrollHeight, 130) + "px";
                  }}
                  rows={2}
                  maxLength={6000}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      search(input);
                    }
                  }}
                />
                <div className="composer-bottom">
                  <span>
                    <Sparkles size={12} /> Your criteria. Live content.
                  </span>
                  {busy ? (
                    <button
                      type="button"
                      className="send-button"
                      aria-label="Stop search"
                      onClick={() => abortRef.current?.abort()}
                    >
                      <Square size={14} />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      className="send-button"
                      aria-label="Search for homes"
                      disabled={!input.trim()}
                    >
                      <ArrowUp size={19} />
                    </button>
                  )}
                </div>
              </form>
              <p className="ai-note">
                AI can make mistakes. Check each home’s details.
              </p>
            </div>
          </aside>
        </div>
        <AgentToolsOverview />
        <footer className="site-footer">
          <span className="brand small-brand">
            HomeMatch <span className="city-tag">NYC</span>
          </span>
          <span>Good context. Better places to start.</span>
          <a
            href={affiliateUrl}
            target="_blank"
            rel="sponsored noopener noreferrer"
          >
            A Sanity Context demo <ArrowUpRight size={14} />
          </a>
        </footer>
      </main>
      <Dialog.Root
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="modal-overlay" />
          <Dialog.Content
            className="modal detail-modal"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              detailTrigger.current?.focus();
            }}
          >
            {selected && (
              <>
                <div className="detail-image">
                  <Image
                    src={selected.image}
                    alt={selected.imageAlt}
                    fill
                    sizes="720px"
                  />
                </div>
                <Dialog.Close
                  className="icon-button modal-close"
                  aria-label="Close home details"
                >
                  <X />
                </Dialog.Close>
                <div className="detail-copy">
                  <p className="eyebrow">
                    {selected.neighbourhood} · {selected.borough}
                  </p>
                  <Dialog.Title>{selected.title}</Dialog.Title>
                  <Dialog.Description>
                    {selected.description}
                  </Dialog.Description>
                  <p className="detail-price">
                    {money(selected.monthlyRent)}{" "}
                    <span>/ month, base rent</span>
                  </p>
                  <div className="detail-specs">
                    <span>{selected.bedrooms} bedrooms</span>
                    <span>{selected.bathrooms} bathrooms</span>
                    <span>{selected.squareFeet} sqft</span>
                  </div>
                  <p className="availability">
                    <span className="blue-dot" />
                    {selected.status === "rented"
                      ? "This home is rented"
                      : `Available from ${dateLabel(selected.availableFrom)}`}
                  </p>
                  <ul className="feature-list">
                    {[
                      selected.furnished ? "Furnished" : "Unfurnished",
                      selected.petsAllowed ? "Pets allowed" : "No pets",
                      selected.inUnitLaundry
                        ? "In-unit laundry"
                        : "Shared laundry",
                      ...selected.features,
                    ].map((x) => (
                      <li key={x}>
                        <Check size={15} />
                        {x}
                      </li>
                    ))}
                  </ul>
                  <button
                    className="primary-button"
                    onClick={() => toggleSave(selected._id)}
                  >
                    <Heart size={16} />
                    {saved.includes(selected._id)
                      ? "Remove from saved homes"
                      : "Save this home"}
                  </button>
                  <p className="ai-note">
                    Fictional demonstration listing. No bookings or
                    applications.
                  </p>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
