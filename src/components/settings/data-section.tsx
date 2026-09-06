"use client";

import * as React from "react";
import { useShallow } from "zustand/react/shallow";
import {
  CircleAlert, Download, RotateCcw, Sparkles, Table, Trash2, TriangleAlert, Upload,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { SOLO } from "@/lib/local-db";
import { toISO, todayISO } from "@/lib/date";
import {
  PRAYER_NAMES, TABLE_OF,
  type Accent, type CollectionKey, type Profile,
} from "@/lib/types";
import { Badge, Button, Checkbox, Input, Segmented } from "@/components/ui/primitives";
import { ConfirmDialog, Modal } from "@/components/ui/overlays";
import { Callout, DANGER_SOLID, FoldGroup, Pane, Row } from "./ui";
import { loadSampleData, resetSampleData, sampleDataPresent } from "./sample-data";

const KEYS = Object.keys(TABLE_OF) as CollectionKey[];

const LABELS: Record<CollectionKey, string> = {
  tasks: "Tasks",
  books: "Books",
  media: "Films & anime",
  notes: "Notes",
  noteCategories: "Note categories",
  habits: "Habits",
  habitLogs: "Habit logs",
  goals: "Goals",
  projects: "Projects",
  templates: "Templates",
  prayers: "Prayers",
  dayLogs: "Day logs",
  focusSessions: "Focus sessions",
  reviews: "Reviews",
  tags: "Tags",
};

type AnyRow = Record<string, unknown>;

interface Backup {
  app: string;
  version: number;
  exported_at: string;
  profile: Partial<Profile> | null;
  collections: Partial<Record<CollectionKey, AnyRow[]>>;
}

type ImportMode = "add" | "merge" | "replace";

// The store's CRUD is generic per collection key. Looping over the key union
// erases that link, so the three casts live here and nowhere else.
const insertRow = (key: CollectionKey, row: AnyRow) =>
  (useStore.getState().insert as unknown as (k: CollectionKey, r: AnyRow) => void)(key, row);

const patchRow = (key: CollectionKey, id: string, row: AnyRow) =>
  (useStore.getState().patch as unknown as (k: CollectionKey, i: string, r: AnyRow) => void)(key, id, row);

const clearCollection = (key: CollectionKey) =>
  (useStore.getState().removeWhere as unknown as (k: CollectionKey, p: () => boolean) => void)(key, () => true);

// ---------------------------------------------------------
// Validation — every row is checked before anything is written
// ---------------------------------------------------------
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown) => typeof v === "string";
const dateish = (v: unknown) => v == null || (str(v) && ISO_DATE.test(v));
const oneOf = (v: unknown, list: readonly string[]) => v == null || (str(v) && list.includes(v));

/** Returns the reason a row cannot be imported, or null when it is fine. */
const VALIDATORS: Record<CollectionKey, (r: AnyRow) => string | null> = {
  tasks: (r) =>
    !str(r.title) ? "no title"
      : !dateish(r.date) ? "date is not yyyy-mm-dd"
        : !oneOf(r.status, ["todo", "doing", "done", "dropped"]) ? "unknown status"
          : null,
  books: (r) => (!str(r.title) ? "no title" : r.total_pages != null && typeof r.total_pages !== "number" ? "total_pages is not a number" : null),
  media: (r) => (!str(r.title) ? "no title" : !oneOf(r.kind, ["film", "anime", "series", "youtube", "playlist"]) ? "unknown kind" : null),
  notes: (r) => (typeof r.body === "string" || str(r.title) ? null : "no body"),
  noteCategories: (r) => (str(r.name) ? null : "no name"),
  habits: (r) => (!str(r.name) ? "no name" : !oneOf(r.cadence, ["daily", "weekly", "custom"]) ? "unknown cadence" : null),
  habitLogs: (r) => (!str(r.habit_id) ? "no habit_id" : !ISO_DATE.test(String(r.date)) ? "date is not yyyy-mm-dd" : null),
  goals: (r) => (!str(r.title) ? "no title" : !oneOf(r.horizon, ["life", "year", "quarter", "month", "week"]) ? "unknown horizon" : null),
  projects: (r) =>
    !str(r.name) ? "no name"
      : !oneOf(r.status, ["idea", "active", "paused", "done", "dropped"]) ? "unknown status"
        : !dateish(r.due_date) ? "due_date is not yyyy-mm-dd"
          : null,
  templates: (r) => (!str(r.name) ? "no name" : r.items != null && !Array.isArray(r.items) ? "items is not a list" : null),
  prayers: (r) =>
    !ISO_DATE.test(String(r.date)) ? "date is not yyyy-mm-dd"
      : !oneOf(r.name, PRAYER_NAMES) ? "unknown prayer"
        : !oneOf(r.status, ["none", "prayed", "jamaah", "late", "qadha", "missed"]) ? "unknown status"
          : null,
  dayLogs: (r) => (ISO_DATE.test(String(r.date)) ? null : "date is not yyyy-mm-dd"),
  focusSessions: (r) => (r.seconds != null && typeof r.seconds !== "number" ? "seconds is not a number" : null),
  reviews: (r) => (ISO_DATE.test(String(r.week_start)) ? null : "week_start is not yyyy-mm-dd"),
  tags: (r) => (str(r.name) ? null : "no name"),
};

interface KeyPlan {
  key: CollectionKey;
  incoming: number;
  fresh: AnyRow[];
  existing: { id: string; row: AnyRow }[];
  invalid: { reason: string; count: number }[];
}

function buildPlan(data: Backup): KeyPlan[] {
  const s = useStore.getState();
  const plans: KeyPlan[] = [];

  for (const key of KEYS) {
    const rows = data.collections[key];
    if (!Array.isArray(rows) || rows.length === 0) continue;

    const known = new Set((s[key] as unknown as { id: string }[]).map((r) => r.id));
    const seen = new Set<string>();
    const fresh: AnyRow[] = [];
    const existing: { id: string; row: AnyRow }[] = [];
    const invalid = new Map<string, number>();

    for (const raw of rows) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        invalid.set("not an object", (invalid.get("not an object") ?? 0) + 1);
        continue;
      }
      const row = raw as AnyRow;
      const reason = VALIDATORS[key](row);
      if (reason) {
        invalid.set(reason, (invalid.get(reason) ?? 0) + 1);
        continue;
      }
      const id = str(row.id) ? (row.id as string) : null;
      if (id && seen.has(id)) {
        invalid.set("duplicated inside the file", (invalid.get("duplicated inside the file") ?? 0) + 1);
        continue;
      }
      if (id) seen.add(id);
      if (id && known.has(id)) existing.push({ id, row });
      else fresh.push(row);
    }

    plans.push({
      key,
      incoming: rows.length,
      fresh,
      existing,
      invalid: [...invalid.entries()].map(([reason, count]) => ({ reason, count })),
    });
  }

  return plans;
}

function isBackup(value: unknown): value is Backup {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.app === "humoyun" && !!v.collections && typeof v.collections === "object";
}

// ---------------------------------------------------------
// Files
// ---------------------------------------------------------
function download(name: string, body: string, type: string) {
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking straight away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toCsv(rows: AnyRow[]): string {
  if (!rows.length) return "";
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v: unknown) => {
    if (v == null) return "";
    const text = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
}

/** Timestamps are UTC; the day they belong to is local. */
function localDay(timestamp: string | undefined): string | null {
  if (!timestamp) return null;
  const d = new Date(timestamp);
  return Number.isNaN(d.getTime()) ? null : toISO(d);
}

// ---------------------------------------------------------
// Typed confirmation — deleting a whole life needs more than a yes
// ---------------------------------------------------------
function TypedConfirm({
  open, onClose, onConfirm, word, title, description, confirmLabel,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  word: string;
  title: string;
  description: string;
  confirmLabel: string;
}) {
  const [value, setValue] = React.useState("");
  const matches = value.trim().toUpperCase() === word;

  function dismiss() {
    setValue("");
    onClose();
  }

  return (
    <Modal open={open} onClose={dismiss} width={420} title={title}>
      <div className="p-5">
        <div className="flex items-start gap-3 rounded-lg bg-danger-soft p-3">
          <TriangleAlert className="mt-px size-4 shrink-0 text-danger" />
          <p className="text-[12.5px] leading-relaxed text-ink-2">{description}</p>
        </div>

        <label htmlFor="typed-confirm" className="mt-4 block text-[12.5px] text-ink-3">
          Type <span className="font-semibold text-ink">{word}</span> to confirm
        </label>
        <Input
          id="typed-confirm"
          autoFocus
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && matches) { setValue(""); onConfirm(); } }}
          className="mt-1.5"
        />

        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={dismiss}>Cancel</Button>
          {/* Same treatment ConfirmDialog paints, from the one shared constant. */}
          <Button disabled={!matches} onClick={() => { setValue(""); onConfirm(); }} className={DANGER_SOLID}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------
// Pane
// ---------------------------------------------------------
export function DataSection() {
  const counts = useStore(useShallow((s) => KEYS.map((k) => (s[k] as unknown[]).length)));
  const toast = useStore((s) => s.toast);
  const total = counts.reduce((a, b) => a + b, 0);

  const fileRef = React.useRef<HTMLInputElement>(null);
  const [selected, setSelected] = React.useState<Set<CollectionKey>>(() => new Set(KEYS));
  const [pending, setPending] = React.useState<{ name: string; data: Backup; plan: KeyPlan[] } | null>(null);
  const [mode, setMode] = React.useState<ImportMode>("add");
  const [exportPrefs, setExportPrefs] = React.useState(true);
  const [importPrefs, setImportPrefs] = React.useState(true);
  const [seedOpen, setSeedOpen] = React.useState(false);
  const [resetOpen, setResetOpen] = React.useState(false);
  const [wipeOpen, setWipeOpen] = React.useState(false);

  const byKey = React.useMemo(
    () => Object.fromEntries(KEYS.map((k, i) => [k, counts[i]])) as Record<CollectionKey, number>,
    [counts],
  );
  const populated = KEYS.filter((k) => byKey[k] > 0);
  const chosen = populated.filter((k) => selected.has(k));
  const chosenRows = chosen.reduce((a, k) => a + byKey[k], 0);
  const seeded = sampleDataPresent();

  function toggle(key: CollectionKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function exportSelected() {
    const s = useStore.getState();
    const collections: Backup["collections"] = {};
    chosen.forEach((k) => { collections[k] = s[k] as unknown as AnyRow[]; });

    const payload: Backup = {
      app: "humoyun",
      version: 1,
      exported_at: new Date().toISOString(),
      profile: exportPrefs ? s.profile : null,
      collections,
    };
    const name = chosen.length === populated.length
      ? `humoyun-${todayISO()}.json`
      : `humoyun-${chosen.length === 1 ? chosen[0] : "partial"}-${todayISO()}.json`;

    download(name, JSON.stringify(payload, null, 2), "application/json");
    toast({
      title: "Backup downloaded",
      description: `${chosenRows} rows from ${chosen.length} collection${chosen.length === 1 ? "" : "s"}.`,
      tone: "success",
    });
  }

  function exportCsv(key: CollectionKey) {
    const rows = useStore.getState()[key] as unknown as AnyRow[];
    download(`humoyun-${key}-${todayISO()}.csv`, toCsv(rows), "text/csv;charset=utf-8");
    toast({ title: `${LABELS[key]} exported`, description: `${rows.length} rows as CSV.`, tone: "success" });
  }

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isBackup(parsed)) throw new Error("That file is not a Humoyun backup — it has no `app: \"humoyun\"` marker.");
      const plan = buildPlan(parsed);
      if (!plan.length) throw new Error("The file parsed, but there is not a single row in it.");
      setMode("add");
      setPending({ name: file.name, data: parsed, plan });
    } catch (err) {
      toast({
        title: "Could not read that file",
        description: err instanceof Error ? err.message : "Invalid JSON.",
        tone: "danger",
      });
    }
  }

  function applyImport() {
    if (!pending) return;
    let added = 0;
    let updated = 0;
    let removed = 0;
    let skipped = 0;

    pending.plan.forEach((p) => {
      if (mode === "replace") {
        removed += byKey[p.key];
        clearCollection(p.key);
        [...p.fresh, ...p.existing.map((e) => e.row)].forEach((row) => {
          const { user_id: _owner, ...rest } = row;
          void _owner;
          insertRow(p.key, rest);
          added++;
        });
        return;
      }

      p.fresh.forEach((row) => {
        const { user_id: _owner, ...rest } = row;
        void _owner;
        insertRow(p.key, rest);
        added++;
      });

      p.existing.forEach(({ id, row }) => {
        if (mode === "add") { skipped++; return; }
        const { user_id: _owner, id: _id, created_at: _c, ...rest } = row;
        void _owner; void _id; void _c;
        patchRow(p.key, id, rest);
        updated++;
      });
    });

    if (importPrefs && pending.data.profile && typeof pending.data.profile === "object") {
      const s = useStore.getState();
      const { id: _id, created_at: _c, updated_at: _u, ...prefs } = pending.data.profile;
      void _id; void _c; void _u;
      s.updateProfile(prefs);
      if (prefs.accent) s.setAccent(prefs.accent as Accent);
      if (prefs.theme) s.setTheme(prefs.theme);
    }

    setPending(null);
    toast({
      title: "Backup imported",
      description: [
        added ? `${added} added` : null,
        updated ? `${updated} updated` : null,
        removed ? `${removed} replaced` : null,
        skipped ? `${skipped} left alone` : null,
      ].filter(Boolean).join(", ") || "Nothing changed.",
      tone: "success",
    });
  }

  function seed() {
    setSeedOpen(false);
    try {
      const n = loadSampleData();
      if (n === 0) {
        toast({
          title: "The sample is already here",
          description: "Use “Reset preview data” to lay a fresh copy down.",
        });
        return;
      }
      toast({ title: "Sample data loaded", description: `${n} rows across 91 days. Open Today to see it.`, tone: "success" });
    } catch (err) {
      toast({
        title: "Could not load the sample",
        description: err instanceof Error ? err.message : "Something went wrong.",
        tone: "danger",
      });
    }
  }

  function reset() {
    setResetOpen(false);
    try {
      const n = resetSampleData();
      toast({ title: "Preview data rebuilt", description: `${n} fresh rows. Everything that was here is gone.`, tone: "success" });
    } catch (err) {
      toast({
        title: "Could not rebuild the sample",
        description: err instanceof Error ? err.message : "Something went wrong.",
        tone: "danger",
      });
    }
  }

  function wipe() {
    const removed = total;
    KEYS.forEach(clearCollection);
    setWipeOpen(false);
    toast({ title: "Everything deleted", description: `${removed} rows removed.`, tone: "danger" });
  }

  // ---- import summary numbers, per chosen mode ----
  const planTotals = React.useMemo(() => {
    if (!pending) return { add: 0, update: 0, skip: 0, invalid: 0, replace: 0 };
    return pending.plan.reduce(
      (acc, p) => {
        const invalid = p.invalid.reduce((a, i) => a + i.count, 0);
        if (mode === "replace") {
          acc.add += p.fresh.length + p.existing.length;
          acc.replace += byKey[p.key];
        } else {
          acc.add += p.fresh.length;
          if (mode === "merge") acc.update += p.existing.length;
          else acc.skip += p.existing.length;
        }
        acc.invalid += invalid;
        return acc;
      },
      { add: 0, update: 0, skip: 0, invalid: 0, replace: 0 },
    );
  }, [pending, mode, byKey]);

  return (
    <Pane
      title="Data"
      description="Everything you put into Humoyun stays yours. Take it out one collection at a time, put it back, or start over."
    >
      {total === 0 && (
        <Callout
          tone="info"
          title="This workspace is empty"
          className="mb-5"
          action={
            <Button variant="primary" size="sm" onClick={seed}>
              <Sparkles className="size-3.5" />
              Load sample data
            </Button>
          }
        >
          Ninety-one days of a believable life — tasks, four books on reading plans, six habits with two
          months of history, prayers, focus sessions, goals, notes and a set of templates. It is
          real data: edit it, or delete all of it in one click.
        </Callout>
      )}

      {/* ---------- export ---------- */}
      <FoldGroup
        title="Export"
        storageKey="humoyun.settings.exportOpen"
        summary={
          populated.length
            ? `${total} rows across ${populated.length} collection${populated.length === 1 ? "" : "s"}, as JSON or CSV`
            : "Nothing to export yet"
        }
        description="A Humoyun backup is plain JSON — every row, exactly as stored. Importing one rebuilds the workspace."
      >
        <div className="mt-1 overflow-hidden rounded-lg border border-line">
          <div className="flex items-center gap-3 border-b border-line bg-sunken px-3 py-2">
            <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              Collections
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set(chosen.length === populated.length ? [] : populated))}
              disabled={!populated.length}
            >
              {chosen.length === populated.length && populated.length > 0 ? "Select none" : "Select all"}
            </Button>
          </div>

          {populated.length ? (
            <ul>
              {populated.map((key) => (
                <li key={key} className="flex items-center gap-3 border-b border-line px-3 py-1.5 last:border-b-0">
                  <Checkbox
                    checked={selected.has(key)}
                    onChange={() => toggle(key)}
                    size="sm"
                    label={`Include ${LABELS[key]} in the export`}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{LABELS[key]}</span>
                  <span className="shrink-0 text-[12px] text-ink-3 tnum">{byKey[key]}</span>
                  <Button size="sm" variant="ghost" onClick={() => exportCsv(key)}>
                    <Table className="size-3.5" />
                    CSV
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-4 text-[12.5px] text-ink-4">Nothing to export yet.</p>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="primary" size="sm" onClick={exportSelected} disabled={!chosen.length}>
            <Download className="size-3.5" />
            Download {chosenRows} row{chosenRows === 1 ? "" : "s"}
          </Button>
          <span className="flex items-center gap-2 text-[12.5px] text-ink-2">
            <Checkbox
              checked={exportPrefs}
              onChange={setExportPrefs}
              size="sm"
              label="Include preferences in the export"
            />
            Include preferences
          </span>
        </div>
      </FoldGroup>

      {/* ---------- import ---------- */}
      <FoldGroup
        title="Import"
        storageKey="humoyun.settings.importOpen"
        summary="Read a backup back in — you see the plan before anything is written"
        description="Invalid rows are named and dropped, never guessed at."
      >
        <Row
          label="Choose a backup"
          hint="A .json file exported from Humoyun. You pick what happens to rows that are already here."
        >
          <>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={pickFile}
            />
            <Button size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="size-3.5" />
              Choose a file
            </Button>
          </>
        </Row>
      </FoldGroup>

      {/* ---------- sample data ---------- */}
      <FoldGroup
        title="Sample data"
        storageKey="humoyun.settings.sampleOpen"
        summary={seeded ? "Ninety-one days of sample data are loaded" : "Ninety-one days of a believable life, in one click"}
        description={
          SOLO
            ? "This build runs entirely in your browser, so the sample is the workspace until you replace it with your own."
            : "A full workspace you can poke at without inventing three months of your own life first."
        }
      >
        <Row
          label={seeded ? "Sample data is loaded" : "Load sample data"}
          hint={
            seeded
              ? "Ninety-one days of tasks, reading plans, habits, prayers, focus sessions, goals and notes."
              : "Ninety-one days centred on today: every day has something, the past is mostly done, the future is planned."
          }
        >
          <Button size="sm" onClick={() => (total > 0 && !seeded ? setSeedOpen(true) : seeded ? setResetOpen(true) : seed())}>
            {seeded ? <RotateCcw className="size-3.5" /> : <Sparkles className="size-3.5" />}
            {seeded ? "Reset preview data" : "Load sample data"}
          </Button>
        </Row>

        {seeded && (
          <Row
            label="What reset does"
            hint="Clears every collection and the local snapshot, then lays a fresh copy of the sample down. Anything of your own in here goes with it."
          />
        )}
      </FoldGroup>

      {/* ---------- danger ---------- */}
      <FoldGroup
        title="Danger zone"
        storageKey="humoyun.settings.dangerOpen"
        summary="Delete every row in this workspace"
      >
        <Row
          label="Delete all my data"
          hint="Removes every task, book, habit, prayer, goal, node and template. Your sign-in and preferences stay. There is no undo — export first."
        >
          <Button size="sm" variant="danger" disabled={total === 0} onClick={() => setWipeOpen(true)}>
            <Trash2 className="size-3.5" />
            Delete everything
          </Button>
        </Row>
      </FoldGroup>

      {/* ---------- import report ---------- */}
      <Modal open={!!pending} onClose={() => setPending(null)} width={520} title="What this import will do">
        {pending && (
          <div className="max-h-[64vh] overflow-y-auto p-5">
            <p className="text-[13px] leading-relaxed text-ink-2">
              <span className="font-medium text-ink">{pending.name}</span>
              {localDay(pending.data.exported_at)
                ? <> was exported on <span className="tnum">{localDay(pending.data.exported_at)}</span>.</>
                : " has no export date."}
            </p>

            <div className="mt-4">
              <Segmented
                value={mode}
                onChange={(v) => setMode(v as ImportMode)}
                options={[
                  { value: "add", label: "Add new only", title: "Rows already here are left exactly as they are" },
                  { value: "merge", label: "Add and update", title: "Rows with a matching id are overwritten" },
                  { value: "replace", label: "Replace", title: "Each collection in the file is emptied first" },
                ]}
              />
              <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
                {mode === "add" && "Anything with an id you already have is skipped. The safest option, and the default."}
                {mode === "merge" && "Rows with a matching id are overwritten by the file's version. Ids you do not have are added."}
                {mode === "replace" && "Every collection present in the file is emptied first, then refilled from it. Collections not in the file are untouched."}
              </p>
            </div>

            <div className="mt-4 overflow-hidden rounded-lg border border-line">
              <div className="grid grid-cols-[minmax(0,1fr)_54px_54px_54px] gap-2 border-b border-line bg-sunken px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                <span>Collection</span>
                <span className="text-right">{mode === "replace" ? "In" : "Add"}</span>
                <span className="text-right">{mode === "merge" ? "Update" : mode === "add" ? "Skip" : "Out"}</span>
                <span className="text-right">Bad</span>
              </div>
              <ul>
                {pending.plan.map((p) => {
                  const invalid = p.invalid.reduce((a, i) => a + i.count, 0);
                  const second = mode === "replace" ? byKey[p.key] : p.existing.length;
                  const first = mode === "replace" ? p.fresh.length + p.existing.length : p.fresh.length;
                  return (
                    <li key={p.key} className="border-b border-line px-3 py-1.5 last:border-b-0">
                      <div className="grid grid-cols-[minmax(0,1fr)_54px_54px_54px] items-center gap-2 text-[12.5px]">
                        <span className="truncate text-ink">{LABELS[p.key]}</span>
                        <span className={cn("text-right tnum", first ? "text-success" : "text-ink-4")}>{first || "—"}</span>
                        <span className={cn("text-right tnum", second ? "text-ink-2" : "text-ink-4")}>{second || "—"}</span>
                        <span className={cn("text-right tnum", invalid ? "text-danger" : "text-ink-4")}>{invalid || "—"}</span>
                      </div>
                      {p.invalid.length > 0 && (
                        <p className="mt-1 text-[11.5px] leading-snug text-ink-4">
                          dropped: {p.invalid.map((i) => `${i.count} × ${i.reason}`).join(", ")}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {planTotals.add > 0 && <Badge tint="emerald">{planTotals.add} added</Badge>}
              {planTotals.update > 0 && <Badge tint="blue">{planTotals.update} updated</Badge>}
              {planTotals.replace > 0 && <Badge tint="red">{planTotals.replace} deleted first</Badge>}
              {planTotals.skip > 0 && <Badge tint="slate">{planTotals.skip} left alone</Badge>}
              {planTotals.invalid > 0 && <Badge tint="orange">{planTotals.invalid} dropped</Badge>}
            </div>

            {pending.data.profile && (
              <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-line p-3">
                <Checkbox
                  checked={importPrefs}
                  onChange={setImportPrefs}
                  size="sm"
                  label="Also import preferences"
                  className="mt-px"
                />
                <span className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-ink-2">
                  Also take the preferences — theme, accent, city, working hours and calculation method.
                </span>
              </div>
            )}

            {mode === "replace" && planTotals.replace > 0 && (
              <Callout tone="danger" className="mt-4">
                <span className="tnum font-medium">{planTotals.replace}</span> rows already here will be deleted
                before the file is written in. Export first if you are not sure.
              </Callout>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={() => setPending(null)}>Cancel</Button>
              <Button
                variant={mode === "replace" ? "secondary" : "primary"}
                className={mode === "replace" ? DANGER_SOLID : undefined}
                onClick={applyImport}
                disabled={planTotals.add + planTotals.update === 0}
              >
                {mode === "replace" ? "Replace and import" : `Import ${planTotals.add + planTotals.update} rows`}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ---------- seeding on top of real data ---------- */}
      <Modal open={seedOpen} onClose={() => setSeedOpen(false)} width={420} title="Add the sample on top?">
        <div className="p-5">
          <div className="flex items-start gap-3 rounded-lg border border-line bg-sunken p-3">
            <CircleAlert className="mt-px size-4 shrink-0 text-ink-3" />
            <p className="text-[12.5px] leading-relaxed text-ink-2">
              You already have <span className="tnum font-medium text-ink">{total}</span> rows. The sample is
              added alongside them — nothing you have is touched, but ninety-one days of someone else&apos;s
              life will land on your calendar.
            </p>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button onClick={() => setSeedOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={seed}>Add it anyway</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={reset}
        title="Rebuild the preview data?"
        description={`All ${total} rows are deleted and a fresh copy of the sample is written in their place. Anything you have added yourself goes too.`}
        confirmLabel="Delete and rebuild"
      />

      <TypedConfirm
        open={wipeOpen}
        onClose={() => setWipeOpen(false)}
        onConfirm={wipe}
        word="DELETE"
        title="Delete everything"
        description={`All ${total} rows will be permanently removed from this account. This cannot be undone and there is no backup unless you made one.`}
        confirmLabel="Delete everything"
      />
    </Pane>
  );
}
