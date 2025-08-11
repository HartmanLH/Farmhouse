import React, { useEffect, useMemo, useState } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/*********************************
 * Family Farmhouse Reservations — Supabase Edition
 *
 * What’s new
 * - Shared storage via Supabase (no more per-browser only)
 * - Availability: click a date to see which rooms are free vs booked
 * - Master month calendar: shows who is staying each day + how many rooms remain
 * - Password gate (simple shared secret)
 *
 * Tailwind: use the CDN in index.html → <script src="https://cdn.tailwindcss.com"></script>
 *********************************/

/*********************************
 * 🔐 Password Gate (shared secret)
 *********************************/
const SESSION_KEY = "farmhouse_auth";
const PASSWORD = "WhiteGate"; // ← change anytime

type PasswordGateProps = { children: React.ReactNode };
function PasswordGate({ children }: PasswordGateProps) {
  const [ok, setOk] = useState(false);
  const [pw, setPw] = useState("");
  useEffect(() => {
    const t = sessionStorage.getItem(SESSION_KEY);
    if (t === "ok") setOk(true);
  }, []);
  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw === PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, "ok");
      setOk(true);
    } else alert("Incorrect password");
  };
  if (ok) return <>{children}</>;
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6">
      <div className="max-w-md w-full bg-white shadow-xl rounded-2xl p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Family Farmhouse</h1>
        <p className="text-sm text-stone-600">Enter the family password to view and make reservations.</p>
        <form onSubmit={handle} className="space-y-3">
          <input className="w-full border rounded-xl px-3 py-2" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Family password" autoFocus />
          <button className="w-full rounded-xl bg-black text-white py-2 font-medium">Enter</button>
      </form></div></div>
  );
}

/*********************************
 * 🗃️ Data Layer & Types
 *********************************/
export type Reservation = {
  id: string;
  name: string;
  room: string; // must match one in ROOMS
  start_date: string; // YYYY-MM-DD (inclusive)
  end_date: string;   // YYYY-MM-DD (checkout, non-inclusive)
  status: "definitely" | "hopefully";
  notes?: string;
  created_at?: string;
};

// Five rooms + Blacksmith's Shop (you can rename later)
const ROOMS = [
  "Queen Next to Bathroom",
  "The One With the Sleeping Porch",
  "Above the Kitchen",
  "Left at Top of Stairs",
  "Upstairs Library",
  "Blacksmith's Shop",
];

// -------- LocalStorage fallback (kept as a safety net) --------
const LS_KEY = "farmhouse_reservations_v2";
function useLocalStore() {
  const [rows, setRows] = useState<Reservation[]>([]);
  useEffect(() => {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) setRows(JSON.parse(raw));
  }, []);
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(rows));
  }, [rows]);
  return {
    list: async () => rows,
    add: async (r: Reservation) => setRows((s) => [...s, r]),
    remove: async (id: string) => setRows((s) => s.filter((x) => x.id !== id)),
  } as const;
}

// -------- Supabase backend --------
const SB_URL = (window as any).SUPABASE_URL as string | undefined;
const SB_KEY = (window as any).SUPABASE_ANON_KEY as string | undefined;

function makeClient(): SupabaseClient | null {
  if (!SB_URL || !SB_KEY) return null;
  return createClient(SB_URL, SB_KEY);
}

function useData() {
  const ls = useLocalStore();
  const client = makeClient();
  if (!client) return ls; // fallback
  return {
    list: async (): Promise<Reservation[]> => {
      const { data, error } = await client
        .from("reservations")
        .select("*")
        .order("start_date", { ascending: true });
      if (error) throw error;
      return data as Reservation[];
    },
    add: async (r: Reservation) => {
      const { error } = await client.from("reservations").insert(r);
      if (error) throw error;
    },
    remove: async (id: string) => {
      const { error } = await client.from("reservations").delete().eq("id", id);
      if (error) throw error;
    },
  } as const;
}

/*********************************
 * 📅 Date Helpers
 *********************************/
function fmt(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function dateRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const A1 = new Date(aStart), A2 = new Date(aEnd);
  const B1 = new Date(bStart), B2 = new Date(bEnd);
  return A1 < B2 && B1 < A2; // end is checkout (non-inclusive)
}
function newId() {
  return (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? (crypto as any).randomUUID()
    : Math.random().toString(36).slice(2);
}
function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number) {
  const x = new Date(d); x.setDate(x.getDate() + n); return x;
}
function daysInRange(startISO: string, endISO: string) {
  // produce all ISO dates where start <= d < end
  const out: string[] = [];
  let d = new Date(startISO + "T00:00:00");
  const end = new Date(endISO + "T00:00:00");
  while (d < end) { out.push(toISO(d)); d = addDays(d, 1); }
  return out;
}
function monthGrid(year: number, monthIdx0: number) {
  // return array of weeks; each week is array of Date or null
  const first = new Date(Date.UTC(year, monthIdx0, 1));
  const last = new Date(Date.UTC(year, monthIdx0 + 1, 0));
  const weeks: (Date | null)[][] = [];
  let cur = new Date(first);
  // start from Sunday of the first week
  const start = new Date(cur); start.setUTCDate(1 - start.getUTCDay());
  let d = start;
  while (d <= last || d.getUTCDay() !== 0) {
    const wk: (Date | null)[] = [];
    for (let i = 0; i < 7; i++) {
      const inMonth = d.getUTCMonth() === monthIdx0;
      wk.push(inMonth ? new Date(d) : null);
      d = addDays(d, 1);
    }
    weeks.push(wk);
    if (d > last && d.getUTCDay() === 0) break;
  }
  return weeks;
}

/*********************************
 * 🧩 UI Bits
 *********************************/
type BadgeProps = {
  children: React.ReactNode;
  tone?: "stone" | "green" | "amber";
};

function Badge({ children, tone = "stone" }: BadgeProps) {
  const map: Record<string, string> = {
    stone: "bg-stone-100 text-stone-700",
    green: "bg-green-100 text-green-700",
    amber: "bg-amber-100 text-amber-800",
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${map[tone]}`}>
      {children}
    </span>
  );
}

function Header() {
  return (
    <header className="flex items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">Family Farmhouse</h1>
        <p className="text-sm text-stone-600">Reserve rooms, check availability, and avoid double-booking.</p>
      </div>
      <button onClick={() => { sessionStorage.removeItem(SESSION_KEY); location.reload(); }} className="text-sm underline text-stone-600 hover:text-stone-900">Sign out</button>
    </header>
  );
}

/*********************************
 * 📝 Reservation Form
 *********************************/
function ReservationForm({ existing, onAdd }: { existing: Reservation[]; onAdd: (r: Reservation) => Promise<void> }) {
  const [name, setName] = useState("");
  const [room, setRoom] = useState(ROOMS[0]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [status, setStatus] = useState<Reservation["status"]>("hopefully");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const canSubmit = name && room && start && end && new Date(end) > new Date(start);

  const conflicts = existing.filter((r) => r.room === room && dateRangesOverlap(start || "2100-01-01", end || "2100-01-02", r.start_date, r.end_date));

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (conflicts.length) {
      const list = conflicts.map((c) => `${fmt(c.start_date)} → ${fmt(c.end_date)} (${c.name})`).join("\n");
      if (!confirm(`That room overlaps with:\n\n${list}\n\nContinue anyway?`)) return;
    }
    setBusy(true);
    const rec: Reservation = { id: newId(), name, room, start_date: start, end_date: end, status, notes, created_at: new Date().toISOString() };
    await onAdd(rec);
    setBusy(false);
    setName(""); setStart(""); setEnd(""); setStatus("hopefully"); setNotes("");
  };

  return (
    <form onSubmit={handle} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end bg-white p-4 rounded-2xl shadow">
      <div className="md:col-span-2">
        <label className="text-xs text-stone-600">Your name</label>
        <input className="w-full border rounded-xl px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Hartman family" />
      </div>
      <div>
        <label className="text-xs text-stone-600">Room</label>
        <select className="w-full border rounded-xl px-3 py-2" value={room} onChange={(e) => setRoom(e.target.value)}>{ROOMS.map((r) => <option key={r}>{r}</option>)}</select>
      </div>
      <div>
        <label className="text-xs text-stone-600">Arrive</label>
        <input className="w-full border rounded-xl px-3 py-2" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
      </div>
      <div>
        <label className="text-xs text-stone-600">Depart</label>
        <input className="w-full border rounded-xl px-3 py-2" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>
      <div>
        <label className="text-xs text-stone-600">Status</label>
        <select className="w-full border rounded-xl px-3 py-2" value={status} onChange={(e) => setStatus(e.target.value as Reservation["status"])}>
          <option value="definitely">Definitely coming</option>
          <option value="hopefully">Hopefully coming</option>
        </select>
      </div>
      <div className="md:col-span-6">
        <label className="text-xs text-stone-600">Notes (optional)</label>
        <textarea className="w-full border rounded-xl px-3 py-2" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g., bringing toddler" />
      </div>
      <div className="md:col-span-6 flex flex-wrap items-center gap-3">
        <button disabled={!canSubmit || busy} className="rounded-xl bg-black text-white px-4 py-2 disabled:opacity-50">Reserve</button>
        {!start || !end ? null : conflicts.length ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="amber">Possible conflicts:</Badge>
            {conflicts.map((c) => (
              <Badge key={c.id} tone={c.status === "definitely" ? "amber" : "stone"}>
                {fmt(c.start_date)}→{fmt(c.end_date)} • {c.name}
              </Badge>
            ))}
          </div>
        ) : (
          <Badge tone="green">Looks available</Badge>
        )}
      </div>
    </form>
  );
}

/*********************************
 * 📋 Room Board (by room)
 *********************************/
function RoomBoard({ rows, onRemove }: { rows: Reservation[]; onRemove: (id: string) => Promise<void> }) {
  const grouped = useMemo(() => {
    const map: Record<string, Reservation[]> = {};
    ROOMS.forEach((r) => (map[r] = []));
    rows.forEach((r) => { (map[r.room] ||= []).push(r); });
    Object.values(map).forEach((arr) => arr.sort((a, b) => a.start_date.localeCompare(b.start_date)));
    return map;
  }, [rows]);

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {ROOMS.map((room) => (
        <div key={room} className="bg-white rounded-2xl shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">{room}</h3>
            <span className="text-xs text-stone-500">{grouped[room]?.length || 0} reservations</span>
          </div>
          <ul className="space-y-2">
            {(grouped[room] || []).map((r) => (
              <li key={r.id} className="border rounded-xl px-3 py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{fmt(r.start_date)} → {fmt(r.end_date)}</div>
                  <div className="text-sm text-stone-600 truncate">{r.name}{r.notes ? ` — ${r.notes}` : ""}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={r.status === "definitely" ? "green" : "stone"}>{r.status === "definitely" ? "definite" : "hopeful"}</Badge>
                  <button onClick={() => onRemove(r.id)} className="text-xs text-red-600 hover:underline" title="Delete reservation">delete</button>
                </div>
              </li>
            ))}
            {!grouped[room]?.length && (
              <li className="text-sm text-stone-500">No reservations yet.</li>
            )}
          </ul>
        </div>
      ))}
    </div>
  );
}

/*********************************
 * 🔎 Availability Inspector (click a date)
 *********************************/
function AvailabilityInspector({ rows }: { rows: Reservation[] }) {
  const [date, setDate] = useState<string>(toISO(new Date()));

  const info = useMemo(() => {
    const booked: { room: string; by: string; range: string }[] = [];
    const free: string[] = [];
    ROOMS.forEach((room) => {
      const r = rows.find((x) => x.room === room && dateRangesOverlap(date, toISO(addDays(new Date(date + "T00:00:00"), 1)), x.start_date, x.end_date));
      if (r) booked.push({ room, by: r.name, range: `${fmt(r.start_date)} → ${fmt(r.end_date)}` }); else free.push(room);
    });
    return { booked, free };
  }, [rows, date]);

  return (
    <div className="bg-white rounded-2xl shadow p-4 space-y-3">
      <div className="flex items-end gap-3">
        <div>
          <label className="text-xs text-stone-600">Pick a date</label>
          <input type="date" className="border rounded-xl px-3 py-2" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="text-sm text-stone-600">{ROOMS.length - info.booked.length} rooms available</div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <h4 className="font-medium mb-2">Available</h4>
          {info.free.length ? (
            <ul className="list-disc pl-5 text-sm space-y-1">
              {info.free.map((r) => <li key={r}>{r}</li>)}
            </ul>
          ) : (
            <div className="text-sm text-stone-500">No rooms free that night.</div>
          )}
        </div>
        <div>
          <h4 className="font-medium mb-2">Booked</h4>
          {info.booked.length ? (
            <ul className="list-disc pl-5 text-sm space-y-1">
              {info.booked.map((b) => (
                <li key={b.room}><span className="font-medium">{b.room}</span>: {b.by} — {b.range}</li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-stone-500">No bookings that night.</div>
          )}
        </div>
      </div>
    </div>
  );
}

/*********************************
 * 🗓️ Master Month Calendar
 *********************************/
function MasterCalendar({ rows }: { rows: Reservation[] }) {
  const today = new Date();
  const [y, setY] = useState(today.getFullYear());
  const [m, setM] = useState(today.getMonth()); // 0-based
  const grid = useMemo(() => monthGrid(y, m), [y, m]);

  // Map date ISO -> { names: string[], remaining: number }
  const daily = useMemo(() => {
    const map = new Map<string, { names: string[]; remaining: number }>();
    rows.forEach((r) => {
      for (const d of daysInRange(r.start_date, r.end_date)) {
        const cur = map.get(d) || { names: [], remaining: ROOMS.length };
        // Add r.name only once per room/night
        if (!cur.names.includes(r.name)) cur.names.push(r.name);
        cur.remaining = Math.max(0, ROOMS.length - new Set([...Array.from((map.get(d)?.names || [])), r.name]).size);
        map.set(d, cur);
      }
    });
    // Fix remaining to be (rooms - roomsBooked) not unique names; we need room occupancy per day
    // Recompute properly using rooms per day
    const perDayRooms = new Map<string, Set<string>>();
    rows.forEach((r) => {
      for (const d of daysInRange(r.start_date, r.end_date)) {
        const s = perDayRooms.get(d) || new Set<string>();
        s.add(r.room);
        perDayRooms.set(d, s);
      }
    });
    for (const [d, s] of perDayRooms) {
      const entry = map.get(d) || { names: [], remaining: ROOMS.length };
      entry.remaining = Math.max(0, ROOMS.length - s.size);
      map.set(d, entry);
    }
    return map;
  }, [rows]);

  const monthName = new Date(y, m, 1).toLocaleString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="bg-white rounded-2xl shadow p-4 space-y-3">
      <div className="flex items-center justify-between">
        <button className="px-3 py-1 rounded-lg border" onClick={() => { const d = new Date(y, m - 1, 1); setY(d.getFullYear()); setM(d.getMonth()); }}>&larr; Prev</button>
        <div className="font-semibold">{monthName}</div>
        <button className="px-3 py-1 rounded-lg border" onClick={() => { const d = new Date(y, m + 1, 1); setY(d.getFullYear()); setM(d.getMonth()); }}>Next &rarr;</button>
      </div>
      <div className="grid grid-cols-7 gap-2 text-xs text-stone-500">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => <div key={d} className="text-center">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {grid.flat().map((d, i) => (
          <div key={i} className={`min-h-[88px] border rounded-xl p-2 ${d ? "bg-white" : "bg-stone-100"}`}>
            {d && (
              <>
                <div className="text-xs font-medium text-stone-600">{d.getUTCDate()}</div>
                <div className="mt-1 space-y-1">
                  {(() => {
                    const iso = toISO(d);
                    const entry = daily.get(iso);
                    const names = entry?.names || [];
                    const remaining = entry?.remaining ?? ROOMS.length;
                    return (
                      <div className="text-[11px] leading-tight text-stone-700">
                        {names.map((n, idx) => (<div key={idx}>{n}</div>))}
                        <div className="mt-1 text-stone-500">{remaining} rooms available</div>
                      </div>
                    );
                  })()}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/*********************************
 * 🔧 Main App
 *********************************/
export default function App() {
  const data = useData();
  const [rows, setRows] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true); setError(null);
    try { const r = await data.list(); setRows(r); } catch (e: any) { setError(e.message || String(e)); } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const onAdd = async (r: Reservation) => { try { await data.add(r); await refresh(); } catch (e: any) { alert("Failed to save: " + (e.message || String(e))); } };
  const onRemove = async (id: string) => { if (!confirm("Delete this reservation?")) return; try { await data.remove(id); await refresh(); } catch (e: any) { alert("Failed to delete: " + (e.message || String(e))); } };

  return (
    <PasswordGate>
      <div className="min-h-screen bg-stone-50">
        <div className="max-w-6xl mx-auto p-6 space-y-6">
          <Header />

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Make a reservation</h2>
            <ReservationForm existing={rows} onAdd={onAdd} />
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Availability by date</h2>
            <AvailabilityInspector rows={rows} />
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Master calendar</h2>
            <MasterCalendar rows={rows} />
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Reservations by room</h2>
            {loading ? <div className="text-stone-600">Loading…</div> : error ? <div className="text-red-600">{error}</div> : <RoomBoard rows={rows} onRemove={onRemove} />}
          </section>

          <p className="text-xs text-stone-500">Storage: {SB_URL && SB_KEY ? "Supabase (shared)" : "localStorage (demo)"}. Checkout is on your departure date (end date not booked overnight).</p>
        </div>
      </div>
    </PasswordGate>
  );
}
