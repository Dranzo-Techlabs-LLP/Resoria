"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import StarRating, { STAR_WORDS } from "./StarRating";
import { ASPECTS, FeedbackError, getStay, sendFeedback, type AspectKey, type Stay } from "./api";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { site } from "@/lib/content";
import "./feedback.css";

type View =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "error"; message: string }
  | { kind: "form"; stay: Stay }
  | { kind: "already"; stay?: Stay }
  | { kind: "done"; stay: Stay; overall: number };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const parts = (iso: string) => iso.split("-").map(Number) as [number, number, number];
const short = (iso: string) => {
  const [, m, d] = parts(iso);
  return `${d} ${MONTHS[m - 1]}`;
};
const long = (iso: string) => `${short(iso)} ${parts(iso)[0]}`;

/** "10 Nov – 11 Nov 2026 · 1 night" (both years when the stay crosses a new year) */
function stayLine(s: Stay): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(s.checkOut)) return "";
  const sameYear = parts(s.checkIn)[0] === parts(s.checkOut)[0];
  const day = (iso: string) => {
    const [y, m, d] = parts(iso);
    return Date.UTC(y, m - 1, d);
  };
  const nights = Math.max(1, Math.round((day(s.checkOut) - day(s.checkIn)) / 86_400_000));
  return `${sameYear ? short(s.checkIn) : long(s.checkIn)} – ${long(s.checkOut)} · ${nights} ${nights === 1 ? "night" : "nights"}`;
}

const NO_ASPECTS = Object.fromEntries(ASPECTS.map((a) => [a.key, 0])) as Record<AspectKey, number>;

/** Brand band, the card and the contact line: the same frame for every state (and the build-time fallback). */
export function FeedbackShell({ children }: { children: ReactNode }) {
  return (
    <main className="fb" id="top">
      <div className="fb-band">
        <a href="/" className="fb-brand" aria-label={`${site.name} website`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-badge.png" alt="" width={72} height={72} className="fb-logo" />
          <span className="fb-brand-name">
            {site.shortName} <em>{site.suffix}</em>
          </span>
        </a>
      </div>
      <div className="fb-wrap">
        <section className="fb-card">{children}</section>
        <p className="fb-foot">
          Questions? Call or WhatsApp <a href={site.phoneHref}>{site.phone}</a>
          <span aria-hidden="true"> · </span>
          <a href="/">resoriaevora.com</a>
        </p>
      </div>
    </main>
  );
}

export function FeedbackLoading() {
  return (
    <div className="fb-loading" role="status" aria-live="polite">
      <span className="fb-skel fb-skel-title" />
      <span className="fb-skel" />
      <span className="fb-skel fb-skel-short" />
      <span className="sr-only">Loading your stay…</span>
    </div>
  );
}

function Message({ title, children, focus = true }: { title: string; children: ReactNode; focus?: boolean }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus]);
  return (
    <div className="fb-message">
      <h1 ref={ref} tabIndex={-1} className="fb-title">
        {title}
      </h1>
      {children}
    </div>
  );
}

/** WhatsApp chat with the resort, with a first line about the feedback link. */
function WhatsAppButton({ text }: { text: string }) {
  return (
    <a
      href={`https://wa.me/${site.whatsappNumber}?text=${encodeURIComponent(text)}`}
      target="_blank"
      rel="noreferrer"
      className="btn btn-ghost fb-btn"
    >
      <WhatsAppIcon size={18} className="wa-green" />
      Message us on WhatsApp
    </a>
  );
}

function FeedbackForm({ token, stay, onDone }: { token: string; stay: Stay; onDone: (v: View) => void }) {
  const [overall, setOverall] = useState(0);
  const [aspects, setAspects] = useState<Record<AspectKey, number>>(NO_ASPECTS);
  const [comment, setComment] = useState("");
  const [trap, setTrap] = useState("");
  const [sending, setSending] = useState(false);
  const [overallError, setOverallError] = useState("");
  const [sendError, setSendError] = useState("");
  const overallRef = useRef<HTMLDivElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    if (overall < 1) {
      setOverallError("Choose from 1 to 5 stars for your stay.");
      overallRef.current?.querySelector<HTMLInputElement>("input")?.focus();
      return;
    }
    setSending(true);
    setSendError("");
    const rated = Object.fromEntries(ASPECTS.filter((a) => aspects[a.key] > 0).map((a) => [a.key, aspects[a.key]]));
    try {
      await sendFeedback(token, { overall, aspects: rated, comment: comment.trim(), website: trap });
      onDone({ kind: "done", stay, overall });
    } catch (err) {
      const status = err instanceof FeedbackError ? err.status : 0;
      if (status === 409) onDone({ kind: "already", stay });
      else if (status === 404) onDone({ kind: "invalid" });
      else {
        setSendError(
          status === 0 || status >= 500
            ? "Your feedback didn't reach us. Check your connection and press Send again: nothing you wrote is lost."
            : err instanceof Error
              ? err.message
              : "Something went wrong. Please try again.",
        );
        setSending(false);
      }
    }
  }

  const line = stayLine(stay);
  return (
    <form className="fb-form" onSubmit={submit} noValidate>
      <header className="fb-head">
        <p className="fb-eyebrow">Guest feedback</p>
        <h1 className="fb-title">How was your stay{stay.guest ? `, ${stay.guest}` : ""}?</h1>
        <p className="fb-stay">
          {stay.rooms && <span className="fb-stay-rooms">{stay.rooms}</span>}
          {stay.rooms && line && <span aria-hidden="true"> · </span>}
          {line}
        </p>
      </header>

      <div ref={overallRef} className="fb-block">
        <StarRating
          label="Your overall rating"
          value={overall}
          onChange={(v) => {
            setOverall(v);
            setOverallError("");
          }}
          error={overallError}
          errorId="fb-overall-error"
        />
        {overallError && (
          <p id="fb-overall-error" className="fb-error" role="alert">
            {overallError}
          </p>
        )}
      </div>

      <div className="fb-block fb-aspects">
        <p className="fb-sub">
          A little more detail <span>(optional)</span>
        </p>
        {ASPECTS.map((a) => (
          <StarRating
            key={a.key}
            size="sm"
            label={a.label}
            value={aspects[a.key]}
            onChange={(v) => setAspects((x) => ({ ...x, [a.key]: v }))}
          />
        ))}
      </div>

      <div className="fb-block fb-field">
        <label htmlFor="fb-comment">
          Anything you&apos;d like to tell us? <span>(optional)</span>
        </label>
        <textarea
          id="fb-comment"
          rows={5}
          maxLength={3000}
          placeholder="What did you enjoy? What could we do better?"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>

      <div className="hp" aria-hidden="true">
        <label htmlFor="fb-website">Leave this field empty</label>
        <input id="fb-website" name="website" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
      </div>

      {sendError && (
        <p className="fb-error fb-send-error" role="alert">
          {sendError}
        </p>
      )}
      <button type="submit" className="btn btn-primary fb-submit" disabled={sending}>
        {sending ? "Sending…" : sendError ? "Try again" : "Send feedback"}
      </button>
      <p className="fb-note">Your feedback goes straight to the {site.name} team.</p>
    </form>
  );
}

/** /feedback?t=<token>: the guest rates the stay from the link the resort sent them. */
export default function FeedbackPage() {
  const params = useSearchParams();
  const token = (params.get("t") || "").trim();
  const [view, setView] = useState<View>({ kind: "loading" });

  const load = useCallback(async () => {
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(token)) {
      setView({ kind: "invalid" });
      return;
    }
    setView({ kind: "loading" });
    try {
      const stay = await getStay(token);
      setView(stay.submitted ? { kind: "already", stay } : { kind: "form", stay });
    } catch (err) {
      const status = err instanceof FeedbackError ? err.status : 0;
      if (status === 404 || status === 400) setView({ kind: "invalid" });
      else setView({ kind: "error", message: status === 0 ? "Check your internet connection and try again." : "Something went wrong on our side. Please try again in a moment." });
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  let body: ReactNode;
  switch (view.kind) {
    case "loading":
      body = <FeedbackLoading />;
      break;
    case "invalid":
      body = (
        <Message title="This feedback link isn't working" focus={false}>
          <p className="fb-text">
            The link may be incomplete, or it no longer matches a stay. Please open the link exactly as we sent it, or message us and we&apos;ll send you a new one.
          </p>
          <div className="fb-actions">
            <WhatsAppButton text={`Hello ${site.name}! The feedback link you sent me isn't working.`} />
          </div>
        </Message>
      );
      break;
    case "error":
      body = (
        <Message title="We couldn't load your stay" focus={false}>
          <p className="fb-text">{view.message}</p>
          <div className="fb-actions">
            <button type="button" className="btn btn-primary fb-btn" onClick={() => void load()}>
              Try again
            </button>
          </div>
        </Message>
      );
      break;
    case "already":
      body = (
        <Message title="Thank you — we already have your feedback">
          <p className="fb-text">
            {view.stay?.guest ? `Thanks, ${view.stay.guest}. ` : ""}Your feedback for this stay has already reached us. If there&apos;s anything
            you&apos;d like to add, we&apos;d love to hear from you on WhatsApp.
          </p>
          <div className="fb-actions">
            <WhatsAppButton text={`Hello ${site.name}! I'd like to add something to my feedback about my stay.`} />
            <a href="/" className="text-link">
              Visit our website
            </a>
          </div>
        </Message>
      );
      break;
    case "done":
      body = (
        <Message title={`Thank you${view.stay.guest ? `, ${view.stay.guest}` : ""}!`}>
          <p className="fb-done-stars" role="img" aria-label={`You rated your stay ${view.overall} out of 5, ${STAR_WORDS[view.overall]}`}>
            <span aria-hidden="true">{"★".repeat(view.overall)}</span>
            <span aria-hidden="true" className="fb-done-off">{"★".repeat(5 - view.overall)}</span>
          </p>
          <p className="fb-text">
            {view.overall >= 4
              ? "We're so glad you enjoyed your stay. Your feedback has reached the team, and we hope to welcome you back to Resoria soon."
              : "Your feedback has reached the team, and we'll look into what you told us. Thank you for helping us make every stay better."}
          </p>
          <div className="fb-actions">
            <a href="/" className="btn btn-primary fb-btn">
              Visit our website
            </a>
          </div>
        </Message>
      );
      break;
    case "form":
      body = <FeedbackForm token={token} stay={view.stay} onDone={setView} />;
      break;
  }

  return <FeedbackShell>{body}</FeedbackShell>;
}
