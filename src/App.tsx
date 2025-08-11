import React, { useEffect, useMemo, useState } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/* ============================================================
   Family Farmhouse — Reservations + Contacts (Supabase)
   ============================================================ */

/* 🔐 Password Gate */
const SESSION_KEY = "farmhouse_auth";
const PASSWORD = "WhiteGate"; // change as needed

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
    } else {
      alert("Incorrect password");
    }
  };
  if (ok) return <>{children}</>;
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <h1 className="text-2xl font-semibold">Family Farmhouse</h1>
        <p className="text-sm text-stone-600">Enter the family password to view and make reservations.</p>
        <form onSubmit={handle} className="space-y-3">
          <input
            className="w-full border rounded-xl px-3 py-2"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Family password"
            autoFocus
          />
          <button className="w-full rounded-xl bg-black text-white py-2 font-medium">Enter</button>
        </form>
      </div>
    </div>
  );
}

/* 🗃️ Types */
export type Reservation = {
  id: string;
  name: string;
  room: string; // must match one in ROOMS
  start_date: string; // YYYY-MM-DD inclusive
  end_date: string; // YYYY-MM-DD checkout (non-inclusive)
  status: "definitely" | "hopefully";
  notes?: string;
  created_at?: string;
};

export type Contact = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
  created_at?: string;
};

/* Rooms (rename later as you like) */
const ROOMS = [
  "Queen Next to Bathroom",
  "The One With the Sleeping Porch",
  "Above the Kitchen",
  "Left at Top of Stairs",
  "Upstairs Library",
  "Blacksmith's Shop",
];

/* 🔌 Supabase client + fallback */
const SB_URL = (window as any).SUPABASE_URL as string | undefined;
const SB_KEY = (window as any).SUPABASE_ANON_KEY as string | undefined;

function makeClient(): SupabaseClient | null {
  if (!SB_URL || !SB_KEY) return null;
  return createClient(SB_URL, SB_KEY);
}

/* LocalStorage fallback for reservations */
const LS_KEY = "farmhouse_reservations_v6";
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
    update: async (id: string, patch: Partial<Reservation>) =>
      setRows((s) => s.map((r) => (r.id === id ? { ...r, ...patch } : r))),
  } as const;
}

function useData() {
  const ls = useLocalStore();
  const client = makeClient();
  if (!client) return ls; // fallback to localStorage
  return {
    list: async (): Promise<Reservation[]> => {
      const { data, error } = await client.from("reservations").select("*").order("start_date", { ascending: true });
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
    update: async (id: string, patch: Partial<Reservation>) => {
      const { error } = await client.from("reservations").update(patch).eq("id", id);
      if (error) throw error;
    },
  } as const;
}

/* Contacts store (Supabase table: contacts) */
function useContacts() {
  const client = makeClient();
  const [rows, setRows] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!client) throw new Error("Supabase not configured");
      const { data, error } = await client.from("contacts").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      setRows(data as Contact[]);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = async (c: Contact) => {
    if (!client) throw new Error("Supabase not configured");
    const { error } = await client.from("contacts").insert(c);
    if (error) throw error;
    await refresh();
  };

  const remove = async (id: string) => {
    if (!client) throw new Error("Supabase not configured");
    const { error } = await client.from("contacts").delete().eq("id", id);
    if (error) throw error;
    await refresh();
  };

  return { rows, loading, error, add, remove } as const;
}

/* 📅 Date helpers */
function fmt(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function dateRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const A1 = new Date(aStart),
    A2 = new Date(aEnd);
  const B1 = new Date(bStart),
    B2 = new Date(bEnd);
  return A1 < B2 && B1 < A2; // end is checkout (non-inclusive)
}
function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? (crypto as any).randomUUID()
    : Math.random().toString(36).slice(2);
}
function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function daysInRange(startISO: string, endISO: string) {
  const out: string[] = [];
  let d = new Date(startISO + "T00:00:00");
  const end = new Date(endISO + "T00:00:00");
  while (d < end) {
    out.push(toISO(d));
    d = addDays(d, 1);
  }
  return out;
}
function monthGrid(year: number, monthIdx0: number) {
  const first = new Date(Date.UTC(year, monthIdx0, 1));
  const last = new Date(Date.UTC(year, monthIdx0 + 1, 0));
  const weeks: (Date | null)[][] = [];
  const start = new Date(first);
  start.setUTCDate(1 - start.getUTCDay());
  let d = start;
  while (d <= last || d.getUTCDay() !== 0) {
    const wk: (Date | null)[] = [];
    for (let i = 0; i < 7; i++) {
      wk.push(d.getUTCMonth() === monthIdx0 ? new Date(d) : null);
      d = addDays(d, 1);
    }
    weeks.push(wk);
    if (d > last && d.getUTCDay() === 0) break;
  }
  return weeks;
}

/* 🧩 UI bits */
type BadgeProps = { children: React.ReactNode; tone?: "stone" | "green" | "amber" };
function Badge({ children, tone = "stone" }: BadgeProps) {
  const map: Record<string, string> = {
    stone: "bg-stone-100 text-stone-700",
    green: "bg-green-100 text-green-700",
    amber: "bg-amber-100 text-amber-800",
  };
  return <span className={`px-2 py-1 rounded-full text-xs font-medium ${map[tone]}`}>{children}</span>;
}

function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-6" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end p-2">
          <button className="px-2 py-1 text-sm" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="px-4 pb-4">{children}</div>
      </div>
    </div>
  );
}

/* Header + simple pages */
type Page = "reservations" | "contacts";
function Header({ page, setPage }: { page: Page; setPage: (p: Page) => void }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">Family Farmhouse</h1>
        <p className="text-sm text-stone-600">Reserve rooms, check availability, share contacts.</p>
      </div>
      <div className="flex items-center gap-2">
        <nav className="flex rounded-xl border overflow-hidden text-sm">
          <button
            onClick={() => setPage("reservations")}
            className={`px-3 py-1 ${page === "reservations" ? "bg-black text-white" : "bg-white"}`}
          >
            Reservations
          </button>
          <button
            onClick={() => setPage("contacts")}
            className={`px-3 py-1 ${page === "contacts" ? "bg-black text-white" : "bg-white"}`}
          >
            Contacts
          </button>
        </nav>
        <button
          onClick={() => {
            sessionStorage.removeItem(SESSION_KEY);
            location.reload();
          }}
          className="text-sm underline text-stone-600 hover:text-stone-900"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}

/* 📝 Reservation Form (filters rooms to availability) */
function ReservationForm({
  existing,
  onAdd,
  defaultStart,
  defaultEnd,
  allowedRooms,
}: {
  existing: Reservation[];
  onAdd: (r: Reservation) => Promise<void>;
  defaultStart?: string;
  defaultEnd?: string;
  allowedRooms?: string[];
}) {
  const [name, setName] = useState("");
  const [start, setStart] = useState<string>(defaultStart || "");
  const [end, setEnd] = useState<string>(defaultEnd || "");
  const [status, setStatus] = useState<Reservation["status"]>("hopefully");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  // Compute availability given current dates
  const availability = useMemo(() => {
    if (!start || !end)
      return { free: ROOMS.slice(), booked: [] as { room: string; by: string; range: string }[] };
    const booked: { room: string; by: string; range: string }[] = [];
    const free: string[] = [];
    ROOMS.forEach((room) => {
      const r = existing.find((x) => x.room === room && dateRangesOverlap(start, end, x.start_date, x.end_date));
      if (r) booked.push({ room, by: r.name, range: `${fmt(r.start_date)} → ${fmt(r.end_date)}` });
      else free.push(room);
    });
    return { free, booked };
  }, [existing, start, end]);

  // If allowedRooms provided (from calendar click), intersect
  const selectableRooms = useMemo(() => {
    const base = availability.free;
    return allowedRooms ? base.filter((r) => allowedRooms.includes(r)) : base;
  }, [availability.free, allowedRooms]);

  const [room, setRoom] = useState<string>(selectableRooms[0] || "");
  useEffect(() => {
    if (!selectableRooms.includes(room)) setRoom(selectableRooms[0] || "");
  }, [selectableRooms, room]);

  const canSubmit = name && room && start && end && new Date(end) > new Date(start);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    const rec: Reservation = {
      id: newId(),
      name,
      room,
      start_date: start,
      end_date: end,
      status,
      notes,
      created_at: new Date().toISOString(),
    };
    await onAdd(rec);
    setBusy(false);
    setName("");
    setNotes("");
  };

  return (
    <div className="space-y-3">
      <form onSubmit={handle} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end bg-white p-4 rounded-2xl shadow">
        <div className="md:col-span-2">
          <label className="text-xs text-stone-600">Your name</label>
          <input
            className="w-full border rounded-xl px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Hartman family"
          />
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
          <label className="text-xs text-stone-600">Room</label>
          <select className="w-full border rounded-xl px-3 py-2" value={room} onChange={(e) => setRoom(e.target.value)}>
            {selectableRooms.length ? (
              selectableRooms.map((r) => <option key={r}>{r}</option>)
            ) : (
              <option value="" disabled>
                No rooms free
              </option>
            )}
          </select>
        </div>
        <div>
          <label className="text-xs text-stone-600">Status</label>
          <select
            className="w-full border rounded-xl px-3 py-2"
            value={status}
            onChange={(e) => setStatus(e.target.value as Reservation["status"])}
          >
            <option value="definitely">Definitely coming</option>
            <option value="hopefully">Hopefully coming</option>
          </select>
        </div>
        <div className="md:col-span-6">
          <label className="text-xs text-stone-600">Notes (optional)</label>
          <textarea
            className="w-full border rounded-xl px-3 py-2"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., bringing toddler"
          />
        </div>
        <div className="md:col-span-6 flex flex-wrap items-center gap-3">
          <button disabled={!canSubmit || busy || !room} className="rounded-xl bg-black text-white px-4 py-2 disabled:opacity-50">
            Reserve
          </button>

          {/* Availability summary */}
          {!start || !end ? null : availability.booked.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="amber">Booked on these dates:</Badge>
              {availability.booked.map((c) => (
                <Badge key={c.room} tone="amber">
                  {c.room}: {c.by} ({c.range})
                </Badge>
              ))}
            </div>
          ) : (
            <Badge tone="green">All rooms free</Badge>
          )}
        </div>
      </form>
    </div>
  );
}

/* 📋 Room Board + Edit dialog */
function RoomBoard({
  rows,
  onRemove,
  onEdited,
}: {
  rows: Reservation[];
  onRemove: (id: string) => Promise<void>;
  onEdited: () => void;
}) {
  const [editing, setEditing] = useState<Reservation | null>(null);

  const grouped = useMemo(() => {
    const map: Record<string, Reservation[]> = {};
    ROOMS.forEach((r) => (map[r] = []));
    rows.forEach((r) => {
      if (!map[r.room]) map[r.room] = [];
      map[r.room].push(r);
    });
    Object.values(map).forEach((arr) => arr.sort((a, b) => a.start_date.localeCompare(b.start_date)));
    return map;
  }, [rows]);

  return (
    <>
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
                    <div className="font-medium truncate">
                      {fmt(r.start_date)} → {fmt(r.end_date)}
                    </div>
                    <div className="text-sm text-stone-600 truncate">
                      {r.name}
                      {r.notes ? ` — ${r.notes}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={r.status === "definitely" ? "green" : "stone"}>
                      {r.status === "definitely" ? "definite" : "hopeful"}
                    </Badge>
                    <button onClick={() => setEditing(r)} className="text-xs text-stone-700 hover:underline">
                      edit
                    </button>
                    <button onClick={() => onRemove(r.id)} className="text-xs text-red-600 hover:underline" title="Delete reservation">
                      delete
                    </button>
                  </div>
                </li>
              ))}
              {!grouped[room]?.length && <li className="text-sm text-stone-500">No reservations yet.</li>}
            </ul>
          </div>
        ))}
      </div>
      <EditDialog editing={editing} onClose={() => setEditing(null)} onEdited={onEdited} />
    </>
  );
}

function EditDialog({
  editing,
  onClose,
  onEdited,
}: {
  editing: Reservation | null;
  onClose: () => void;
  onEdited: () => void;
}) {
  const data = useData();
  const [form, setForm] = useState<Reservation | null>(editing);
  useEffect(() => setForm(editing), [editing]);
  if (!form) return null;

  const canSubmit =
    form.name && form.room && form.start_date && form.end_date && new Date(form.end_date) > new Date(form.start_date);

  const save = async () => {
    if (!canSubmit) return;
    try {
      await data.update(form.id, {
        name: form.name,
        room: form.room,
        start_date: form.start_date,
        end_date: form.end_date,
        status: form.status,
        notes: form.notes || "",
      });
      onClose();
      onEdited(); // refresh parent
    } catch (e: any) {
      alert("Failed to update: " + (e.message || String(e)));
    }
  };

  return (
    <Modal open={!!editing} onClose={onClose}>
      <h3 className="text-lg font-semibold mb-3">Edit reservation</h3>
      <div className="grid grid-cols-1 gap-3">
        <label className="text-xs text-stone-600">
          Name
          <input
            className="w-full border rounded-xl px-3 py-2"
            value={form.name}
            onChange={(e) => setForm({ ...(form as Reservation), name: e.target.value })}
          />
        </label>
        <label className="text-xs text-stone-600">
          Room
          <select
            className="w-full border rounded-xl px-3 py-2"
            value={form.room}
            onChange={(e) => setForm({ ...(form as Reservation), room: e.target.value })}
          >
            {ROOMS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-stone-600">
            Arrive
            <input
              type="date"
              className="w-full border rounded-xl px-3 py-2"
              value={form.start_date}
              onChange={(e) => setForm({ ...(form as Reservation), start_date: e.target.value })}
            />
          </label>
          <label className="text-xs text-stone-600">
            Depart
            <input
              type="date"
              className="w-full border rounded-xl px-3 py-2"
              value={form.end_date}
              onChange={(e) => setForm({ ...(form as Reservation), end_date: e.target.value })}
            />
          </label>
        </div>
        <label className="text-xs text-stone-600">
          Status
          <select
            className="w-full border rounded-xl px-3 py-2"
            value={form.status}
            onChange={(e) => setForm({ ...(form as Reservation), status: e.target.value as Reservation["status"] })}
          >
            <option value="definitely">Definitely coming</option>
            <option value="hopefully">Hopefully coming</option>
          </select>
        </label>
        <label className="text-xs text-stone-600">
          Notes
          <textarea
            className="w-full border rounded-xl px-3 py-2"
            rows={2}
            value={form.notes || ""}
            onChange={(e) => setForm({ ...(form as Reservation), notes: e.target.value })}
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-2 rounded-xl border">
            Cancel
          </button>
          <button disabled={!canSubmit} onClick={save} className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50">
            Save changes
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* 🗓️ Master Calendar (click to open reservation modal) */
function MasterCalendar({
  rows,
  onClickDate,
}: {
  rows: Reservation[];
  onClickDate: (startISO: string, endISO: string) => void;
}) {
  const today = new Date();
  const [y, setY] = useState(today.getFullYear());
  const [m, setM] = useState(today.getMonth());
  const grid = useMemo(() => monthGrid(y, m), [y, m]);

  const daily = useMemo(() => {
    const namesPerDay = new Map<string, string[]>();
    const roomsPerDay = new Map<string, Set<string>>();
    rows.forEach((r) => {
      for (const d of daysInRange(r.start_date, r.end_date)) {
        const n = namesPerDay.get(d) || [];
        if (!n.includes(r.name)) n.push(r.name);
        namesPerDay.set(d, n);
        const s = roomsPerDay.get(d) || new Set<string>();
        s.add(r.room);
        roomsPerDay.set(d, s);
      }
    });
    const out = new Map<string, { names: string[]; remaining: number }>();
    for (const [d, s] of roomsPerDay) {
      out.set(d, { names: namesPerDay.get(d) || [], remaining: Math.max(0, ROOMS.length - s.size) });
    }
    return out;
  }, [rows]);

  const monthName = new Date(y, m, 1).toLocaleString(undefined, { month: "long", year: "numeric" });

  const handleCellClick = (d: Date | null) => {
    if (!d) return;
    const start = toISO(d);
    const end = toISO(addDays(d, 1)); // default one night
    onClickDate(start, end);
  };

  return (
    <div className="bg-white rounded-2xl shadow p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button
          className="px-3 py-1 rounded-lg border"
          onClick={() => {
            const d = new Date(y, m - 1, 1);
            setY(d.getFullYear());
            setM(d.getMonth());
          }}
        >
          &larr; Prev
        </button>
        <div className="font-semibold text-sm sm:text-base">{monthName}</div>
        <button
          className="px-3 py-1 rounded-lg border"
          onClick={() => {
            const d = new Date(y, m + 1, 1);
            setY(d.getFullYear());
            setM(d.getMonth());
          }}
        >
          Next &rarr;
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-2 text-[10px] sm:text-xs text-stone-500">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {grid.flat().map((d, i) => (
          <button
            key={i}
            className={`min-h-[72px] sm:min-h-[96px] border rounded-lg p-1 sm:p-2 text-left ${d ? "bg-white hover:bg-stone-50" : "bg-stone-100"}`}
            onClick={() => handleCellClick(d)}
            disabled={!d}
            aria-label={d ? `Select ${toISO(d)}` : "Empty"}
          >
            {d && (
              <>
                <div className="text-[10px] sm:text-xs font-medium text-stone-600">{d.getUTCDate()}</div>
                <div className="mt-1 space-y-0.5">
                  {(() => {
                    const iso = toISO(d);
                    const entry = daily.get(iso);
                    const names = entry?.names || [];
                    const remaining = entry?.remaining ?? ROOMS.length;
                    const max = 2;
                    return (
                      <div className="text-[10px] sm:text-[11px] leading-tight text-stone-700">
                        {names.slice(0, max).map((n, idx) => (
                          <div key={idx} className="truncate">
                            {n}
                          </div>
                        ))}
                        {names.length > max && <div className="text-stone-500">+{names.length - max} more</div>}
                        <div className="mt-0.5 sm:mt-1 text-stone-500">{remaining} rooms available</div>
                      </div>
                    );
                  })()}
                </div>
              </>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/* 📇 Contacts page */
function ContactsPage() {
  const { rows, loading, error, add, remove } = useContacts();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    try {
      await add({ id: newId(), name, email, phone, notes, created_at: new Date().toISOString() });
      setName("");
      setEmail("");
      setPhone("");
      setNotes("");
    } catch (e: any) {
      alert("Failed to save: " + (e.message || String(e)));
    }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Add your contact info</h2>
        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white p-4 rounded-2xl shadow items-end">
          <div>
            <label className="text-xs text-stone-600">Name</label>
            <input className="w-full border rounded-xl px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="text-xs text-stone-600">Email</label>
            <input className="w-full border rounded-xl px-3 py-2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-stone-600">Phone</label>
            <input className="w-full border rounded-xl px-3 py-2" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="md:col-span-4">
            <label className="text-xs text-stone-600">Notes</label>
            <textarea
              className="w-full border rounded-xl px-3 py-2"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., best time to reach me"
            />
          </div>
          <div className="md:col-span-4">
            <button className="rounded-xl bg-black text-white px-4 py-2">Save</button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Family contact list</h2>
        {loading ? (
          <div className="text-stone-600">Loading…</div>
        ) : error ? (
          <div className="text-red-600">{error}</div>
        ) : rows.length === 0 ? (
          <div className="text-stone-600">No contacts yet.</div>
        ) : (
          <div className="bg-white rounded-2xl shadow overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-stone-500">
                  <th className="p-3">Name</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">Notes</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="p-3 align-top">{c.name}</td>
                    <td className="p-3 align-top">{c.email ? <a className="underline" href={`mailto:${c.email}`}>{c.email}</a> : ""}</td>
                    <td className="p-3 align-top">{c.phone ? <a className="underline" href={`tel:${c.phone}`}>{c.phone}</a> : ""}</td>
                    <td className="p-3 align-top whitespace-pre-wrap">{c.notes}</td>
                    <td className="p-3 align-top text-right">
                      <button onClick={() => remove(c.id)} className="text-red-600 text-xs underline">
                        delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/* 🔧 Main App */
export default function App() {
  const data = useData();
  const [rows, setRows] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<Page>("reservations");

  const [reserveOpen, setReserveOpen] = useState(false);
  const [presetStart, setPresetStart] = useState<string | undefined>(undefined);
  const [presetEnd, setPresetEnd] = useState<string | undefined>(undefined);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await data.list();
      setRows(r);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onAdd = async (r: Reservation) => {
    try {
      await data.add(r);
      await refresh();
    } catch (e: any) {
      alert("Failed to save: " + (e.message || String(e)));
    }
  };

  const onRemove = async (id: string) => {
    if (!confirm("Delete this reservation?")) return;
    try {
      await data.remove(id);
      await refresh();
    } catch (e: any) {
      alert("Failed to delete: " + (e.message || String(e)));
    }
  };

  // Calendar click → open reservation modal prefilled to that night
  const openReserveForDate = (startISO: string, endISO: string) => {
    setPresetStart(startISO);
    setPresetEnd(endISO);
    setReserveOpen(true);
    setPage("reservations");
  };

  return (
    <PasswordGate>
      <div className="min-h-screen bg-stone-50">
        <div className="max-w-6xl mx-auto p-6 space-y-6">
          <Header page={page} setPage={setPage} />

          {page === "reservations" ? (
            <>
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">
                  Master calendar <span className="text-sm font-normal text-stone-500">(tap a date to reserve)</span>
                </h2>
                <MasterCalendar rows={rows} onClickDate={openReserveForDate} />
              </section>

              <section className="space-y-3">
                <h2 className="text-lg font-semibold">Make a reservation</h2>
                {loading ? (
                  <div className="text-stone-600">Loading…</div>
                ) : error ? (
                  <div className="text-red-600">{error}</div>
                ) : (
                  <ReservationForm existing={rows} onAdd={onAdd} />
                )}
              </section>

              <section className="space-y-3">
                <h2 className="text-lg font-semibold">Reservations by room</h2>
                {loading ? (
                  <div className="text-stone-600">Loading…</div>
                ) : error ? (
                  <div className="text-red-600">{error}</div>
                ) : (
                  <RoomBoard rows={rows} onRemove={onRemove} onEdited={refresh} />
                )}
              </section>

              <Modal open={reserveOpen} onClose={() => setReserveOpen(false)}>
                <h3 className="text-lg font-semibold mb-3">Reserve these dates</h3>
                <ReservationForm
                  existing={rows}
                  onAdd={async (r) => {
                    await onAdd(r);
                    setReserveOpen(false);
                  }}
                  defaultStart={presetStart}
                  defaultEnd={presetEnd}
                />
              </Modal>
            </>
          ) : (
            <ContactsPage />
          )}

          <p className="text-xs text-stone-500">
            Storage: {SB_URL && SB_KEY ? "Supabase (shared)" : "localStorage (demo)"}. Checkout is on your departure date.
          </p>
        </div>
      </div>
    </PasswordGate>
  );
}
