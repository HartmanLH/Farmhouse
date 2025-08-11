import React, { useEffect, useMemo, useState } from "react";
// import { createClient } from "@supabase/supabase-js"; // Optional if using Supabase

/*********************************
 * 🔐 Password Gate (shared secret)
 *********************************/
type PasswordGateProps = {
  children: React.ReactNode;
};
const PASSWORD = "WhiteGate"; // change before deploying
const SESSION_KEY = "farmhouse_auth";

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
      <div className="max-w-md w-full bg-white shadow-xl rounded-2xl p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Family Farmhouse</h1>
        <p className="text-sm text-stone-600">Enter the family password to view and make reservations.</p>
        <form onSubmit={handle} className="space-y-3">
          <input
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            type="password"
            className="w-full border rounded-xl px-3 py-2"
            placeholder="Family password"
            autoFocus
          />
          <button className="w-full rounded-xl bg-black text-white py-2 font-medium">Enter</button>
        </form>
      </div>
    </div>
  );
}

/*********************************
 * 🗃️ Data Layer
 *********************************/
export type Reservation = {
  id: string;
  name: string;
  room: string;
  start_date: string;
  end_date: string;
  status: "definitely" | "hopefully";
  notes?: string;
  created_at?: string;
};

const ROOMS = [
  "Queen Next to Bathroom",
  "The One With the Sleeping Porch",
  "Above the Kitchen",
  "Left at Top of Stairs",
  "Upstairs Library",
  "Blacksmith's Shop",
];

const LS_KEY = "farmhouse_reservations_v1";

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

function useData() {
  const ls = useLocalStore();
  return ls; // default to localStorage
}

/*********************************
 * 📅 Utils
 *********************************/
function fmt(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function dateRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const A1 = new Date(aStart);
  const A2 = new Date(aEnd);
  const B1 = new Date(bStart);
  const B2 = new Date(bEnd);
  return A1 < B2 && B1 < A2;
}
function newId() {
  return (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? (crypto as any).randomUUID()
    : Math.random().toString(36).slice(2);
}

/*********************************
 * 🧩 UI Components
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
        <p className="text-sm text-stone-600">Reserve rooms, mark your plans, and avoid double-booking.</p>
      </div>
      <button
        onClick={() => {
          sessionStorage.removeItem(SESSION_KEY);
          location.reload();
        }}
        className="text-sm underline text-stone-600 hover:text-stone-900"
      >
        Sign out
      </button>
    </header>
  );
}

function ReservationForm({ existing, onAdd }: { existing: Reservation[]; onAdd: (r: Reservation) => Promise<void> }) {
  const [name, setName] = useState("");
  const [room, setRoom] = useState(ROOMS[0]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [status, setStatus] = useState<Reservation["status"]>("hopefully");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const canSubmit = name && room && start && end && new Date(end) > new Date(start);

  const checkOverlap = () => {
    return existing.filter((r) => r.room === room && dateRangesOverlap(start, end, r.start_date, r.end_date));
  };

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const conflicts = checkOverlap();
    if (conflicts.length) {
      const list = conflicts.map((c) => `${fmt(c.start_date)} → ${fmt(c.end_date)} (${c.name})`).join("\n");
      if (!confirm(`That room is already reserved for:\n\n${list}\n\nContinue anyway?`)) return;
    }
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
    setStart("");
    setEnd("");
    setStatus("hopefully");
    setNotes("");
  };

  return (
    <form onSubmit={handle} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end bg-white p-4 rounded-2xl shadow">
      <div className="md:col-span-2">
        <label className="text-xs text-stone-600">Your name</label>
        <input className="w-full border rounded-xl px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="text-xs text-stone-600">Room</label>
        <select className="w-full border rounded-xl px-3 py-2" value={room} onChange={(e) => setRoom(e.target.value)}>
          {ROOMS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
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
        <label className="text-xs text-stone-600">Notes</label>
        <textarea className="w-full border rounded-xl px-3 py-2" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="md:col-span-6 flex gap-3">
        <button disabled={!canSubmit || busy} className="rounded-xl bg-black text-white px-4 py-2 disabled:opacity-50">Reserve</button>
        <OverlapHelper room={room} start={start} end={end} existing={existing} />
      </div>
    </form>
  );
}

function OverlapHelper({ room, start, end, existing }: { room: string; start: string; end: string; existing: Reservation[] }) {
  if (!room || !start || !end) return null;
  const conflicts = existing.filter((r) => r.room === room && dateRangesOverlap(start, end, r.start_date, r.end_date));
  if (!conflicts.length) return <Badge>Looks available</Badge>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="amber">Possible conflicts:</Badge>
      {conflicts.map((c) => (
        <Badge key={c.id} tone={c.status === "definitely" ? "amber" : "stone"}>
          {fmt(c.start_date)}→{fmt(c.end_date)} • {c.name} • {c.status === "definitely" ? "definite" : "hopeful"}
        </Badge>
      ))}
    </div>
  );
}

function RoomBoard({ rows, onRemove }: { rows: Reservation[]; onRemove: (id: string) => Promise<void> }) {
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
                  <button onClick={() => onRemove(r.id)} className="text-xs text-red-600 hover:underline">delete</button>
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

function Legend() {
  return (
    <div className="flex items-center gap-3 text-sm text-stone-600">
      <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-green-500" /> definite</span>
      <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-stone-400" /> hopeful</span>
      <span className="mx-2">•</span>
      <span>Checkout is on your <em>departure date</em> (end date isn’t booked overnight).</span>
    </div>
  );
}

function FooterNote() {
  return (
    <p className="text-xs text-stone-500">
      Data storage: Browser localStorage (demo only). Room names are placeholders — swap for your real rooms & add photos later.
    </p>
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
    refresh();
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

  return (
    <PasswordGate>
      <div className="min-h-screen bg-stone-50">
        <div className="max-w-6xl mx-auto p-6 space-y-6">
          <Header />
          <Legend />

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Make a reservation</h2>
            <ReservationForm existing={rows} onAdd={onAdd} />
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Reservations by room</h2>
            {loading ? (
              <div className="text-stone-600">Loading…</div>
            ) : error ? (
              <div className="text-red-600">{error}</div>
            ) : (
              <RoomBoard rows={rows} onRemove={onRemove} />
            )}
          </section>

          <FooterNote />
        </div>
      </div>
    </PasswordGate>
  );
}
