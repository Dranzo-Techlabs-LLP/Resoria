// Guest feedback calls to the PHP API (no login: the token in the link is the key).
// Same origin in production (/api); NEXT_PUBLIC_API_BASE is only for `npm run dev`.
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "/api").replace(/\/$/, "");

export const ASPECTS = [
  { key: "rooms", label: "Rooms" },
  { key: "cleanliness", label: "Cleanliness" },
  { key: "food", label: "Food" },
  { key: "service", label: "Service" },
  { key: "value", label: "Value for money" },
] as const;
export type AspectKey = (typeof ASPECTS)[number]["key"];

/** What the link opens: the guest's first name and the stay. */
export interface Stay {
  guest: string;
  rooms: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string;
  submitted: boolean;
}

export interface FeedbackInput {
  overall: number; // 1–5
  aspects: Partial<Record<AspectKey, number>>;
  comment: string;
  website: string; // honeypot: empty for people
}

/** status 0 = the request never reached the server (offline, timeout). */
export class FeedbackError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function call<T>(path: string, init?: { method: string; body: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: init?.method ?? "GET",
      headers: init ? { "Content-Type": "application/json" } : undefined,
      body: init ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new FeedbackError("We couldn't reach Resoria. Check your connection and try again.", 0);
  }
  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // not JSON (a proxy or server error page)
  }
  if (!res.ok) {
    const message = (data as { error?: string })?.error || `Something went wrong (${res.status}). Please try again.`;
    throw new FeedbackError(message, res.status);
  }
  return data as T;
}

export const getStay = (token: string) => call<Stay>(`/feedback/${encodeURIComponent(token)}`);

export const sendFeedback = (token: string, input: FeedbackInput) =>
  call<{ ok: boolean }>(`/feedback/${encodeURIComponent(token)}`, { method: "POST", body: input });
