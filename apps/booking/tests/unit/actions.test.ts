import { beforeAll, describe, expect, it, vi } from "vitest";
import { nextDate, studio } from "./factories";
import { zonedToUtc } from "@/server/scheduling/time";
import { BUSINESS } from "@db/seed-data";

// Only Next.js runtime pieces are mocked (session lookup, revalidation, redirect). Authorization,
// validation and database writes run for real.
const state = vi.hoisted(() => ({ user: null as null | { id: string; name: string; email: string; role: string } }));
vi.mock("@/server/session", () => ({
  getSession: async () => (state.user ? { user: state.user } : null),
  requireUser: async () => {
    if (!state.user) throw Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/sign-in;307;" });
    return state.user;
  },
  requireUserApi: async () => {
    if (!state.user) throw Object.assign(new Error("unauthorized"), { status: 401 });
    return state.user;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` });
  },
  notFound: () => {
    throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  },
}));

const { holdAction, confirmAction, cancelAction, rescheduleAction, outcomeAction, markReadAction } = await import("@/server/actions/bookings");

type Studio = Awaited<ReturnType<typeof studio>>;
let s: Studio;
let day: string;
const at = (hhmm: string, date = day) => zonedToUtc(date, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), BUSINESS.timezone).toISOString();
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const idle = { status: "idle" as const };

beforeAll(async () => {
  s = await studio();
  day = nextDate((wd) => wd === 4); // Thursday: Sam 9-17
});

describe("booking actions", () => {
  it("asks signed-out visitors to sign in instead of holding", async () => {
    state.user = null;
    expect(await holdAction({ serviceId: s.svc("deep-tissue-massage").id, staffId: "any", start: at("10:00") })).toEqual({ ok: false, signIn: true, message: "Please sign in to book." });
  });

  it("holds, confirms (redirecting to the booking) and returns alternatives on conflict", async () => {
    state.user = s.customer;
    const input = { serviceId: s.svc("deep-tissue-massage").id, staffId: s.staff.sam.id, start: at("10:00") };
    const held = await holdAction(input);
    expect(held.ok).toBe(true);
    const id = (held as { bookingId: string }).bookingId;
    await expect(confirmAction(id, idle, fd({ notes: "Hi" }))).rejects.toMatchObject({ digest: expect.stringContaining(`/my/${id}?booked=1`) });

    state.user = s.other;
    const lost = await holdAction(input);
    expect(lost.ok).toBe(false);
    if (!lost.ok) {
      expect(lost.message).toMatch(/just taken/);
      expect(lost.alternatives?.length).toBeGreaterThan(0);
    }
    // Validation errors come back as safe messages, not exceptions.
    const bad = await holdAction({ serviceId: "x", staffId: "any", start: "nope" });
    expect(bad).toMatchObject({ ok: false, message: "Some fields are invalid." });
  });

  it("confirm validates notes length", async () => {
    state.user = s.other;
    const held = await holdAction({ serviceId: s.svc("deep-tissue-massage").id, staffId: s.staff.sam.id, start: at("14:00") });
    const id = (held as { bookingId: string }).bookingId;
    const res = await confirmAction(id, idle, fd({ notes: "x".repeat(501) }));
    expect(res.status).toBe("error");
    expect(res.fieldErrors?.notes?.[0]).toMatch(/500/);
  });

  it("enforces authorization on cancel, reschedule and outcome", async () => {
    state.user = s.customer;
    const held = await holdAction({ serviceId: s.svc("assisted-stretch").id, staffId: s.staff.sam.id, start: at("16:00") });
    const id = (held as { bookingId: string }).bookingId;
    await confirmAction(id, idle, fd({})).catch(() => {});

    state.user = s.other;
    expect(await cancelAction(id, 2)).toMatchObject({ status: "error", message: "Booking not found." });
    expect(await rescheduleAction({ bookingId: id, version: 2, staffId: "any", start: at("15:00") })).toMatchObject({ ok: false, message: "Booking not found." });
    expect(await outcomeAction(id, 2, "completed")).toMatchObject({ status: "error" });

    state.user = s.customer;
    expect(await outcomeAction(id, 2, "completed")).toMatchObject({ status: "error", message: "You don't have permission to do that." });
    const moved = await rescheduleAction({ bookingId: id, version: 2, staffId: "any", start: at("15:30") });
    expect(moved.ok).toBe(true);
    expect(await cancelAction(id, 3)).toEqual({ status: "success", message: "Booking cancelled." });

    state.user = s.owner;
    expect(await markReadAction()).toMatchObject({ status: "success" });
    state.user = null;
    await expect(cancelAction(id, 4)).rejects.toMatchObject({ digest: expect.stringContaining("/sign-in") });
  });
});
