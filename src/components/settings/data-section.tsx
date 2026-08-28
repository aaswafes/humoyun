"use client";

import * as React from "react";
import { useShallow } from "zustand/react/shallow";
import { Download, Sparkles, Trash2, TriangleAlert, Upload } from "lucide-react";
import { useStore } from "@/lib/store";
import { todayISO } from "@/lib/date";
import { TABLE_OF, type Accent, type CollectionKey, type Profile } from "@/lib/types";
import { Button, Input } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlays";
import { Pane, Row } from "./ui";
import { loadSampleData } from "./sample-data";

const KEYS = Object.keys(TABLE_OF) as CollectionKey[];

const LABELS: Record<CollectionKey, string> = {
  tasks: "Tasks",
  books: "Books",
  habits: "Habits",
  habitLogs: "Habit logs",
  goals: "Goals",
  boards: "Boards",
  nodes: "Map nodes",
  edges: "Map edges",
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

// The store's CRUD is generic per collection key. Looping over the key union
// erases that link, so the two casts live here and nowhere else.
const insertRow = (key: CollectionKey, row: AnyRow) =>
  (useStore.getState().insert as unknown as (k: CollectionKey, r: AnyRow) => void)(key, row);

const clearCollection = (key: CollectionKey) =>
  (useStore.getState().removeWhere as unknown as (k: CollectionKey, p: () => boolean) => void)(key, () => true);

function isBackup(value: unknown): value is Backup {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.app === "humoyun" && !!v.collections && typeof v.collections === "object";
}

/** Deleting a whole life needs more than a button that says yes. */
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
          <Button
            disabled={!matches}
            onClick={() => { setValue(""); onConfirm(); }}
            className="bg-danger text-canvas hover:brightness-110"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function DataSection() {
  const counts = useStore(useShallow((s) => KEYS.map((k) => (s[k] as unknown[]).length)));
  const toast = useStore((s) => s.toast);
  const total = counts.reduce((a, b) => a + b, 0);

  const fileRef = React.useRef<HTMLInputElement>(null);
  const [pending, setPending] = React.useState<{ name: string; data: Backup } | null>(null);
  const [seedOpen, setSeedOpen] = React.useState(false);
  const [wipeOpen, setWipeOpen] = React.useState(false);

  const filename = `humoyun-${todayISO()}.json`;

  function exportAll() {
    const s = useStore.getState();
    const collections: Backup["collections"] = {};
    KEYS.forEach((k) => { collections[k] = s[k] as unknown as AnyRow[]; });

    const payload: Backup = {
      app: "humoyun",
      version: 1,
      exported_at: new Date().toISOString(),
      profile: s.profile,
      collections,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoking straight away can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast({ title: "Backup downloaded", description: `${total} rows in ${filename}`, tone: "success" });
  }

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isBackup(parsed)) throw new Error("That file is not a Humoyun backup.");
      setPending({ name: file.name, data: parsed });
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
    const s = useStore.getState();
    let added = 0;
    let skipped = 0;

    KEYS.forEach((key) => {
      const incoming = pending.data.collections[key];
      if (!Array.isArray(incoming)) return;
      const seen = new Set((s[key] as unknown as { id: string }[]).map((r) => r.id));
      incoming.forEach((row) => {
        if (!row || typeof row !== "object") return;
        // user_id must belong to *this* account or the row is rejected by RLS.
        const { user_id: _owner, ...rest } = row;
        void _owner;
        const id = typeof rest.id === "string" ? rest.id : null;
        if (id && seen.has(id)) { skipped++; return; }
        if (id) seen.add(id);
        insertRow(key, rest);
        added++;
      });
    });

    const p = pending.data.profile;
    if (p && typeof p === "object") {
      const { id: _id, created_at: _c, updated_at: _u, ...prefs } = p;
      void _id; void _c; void _u;
      s.updateProfile(prefs);
      if (prefs.accent) s.setAccent(prefs.accent as Accent);
      if (prefs.theme) s.setTheme(prefs.theme);
    }

    setPending(null);
    toast({
      title: "Backup imported",
      description: skipped ? `${added} rows added, ${skipped} already here.` : `${added} rows added.`,
      tone: "success",
    });
  }

  function seed() {
    setSeedOpen(false);
    try {
      const n = loadSampleData();
      toast({ title: "Sample week loaded", description: `${n} rows added. Open Today to see it.`, tone: "success" });
    } catch (err) {
      toast({
        title: "Could not load the sample week",
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

  const populated = KEYS.map((k, i) => ({ key: k, n: counts[i] })).filter((c) => c.n > 0);
  const incomingCounts = pending
    ? KEYS.map((k) => ({ key: k, n: pending.data.collections[k]?.length ?? 0 })).filter((c) => c.n > 0)
    : [];

  return (
    <Pane
      title="Data"
      description="Everything you put into Humoyun stays yours. Take it out, put it back, or start over."
    >
      {total === 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-line bg-sunken p-4">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-medium text-ink">This workspace is empty</p>
            <p className="mt-1 max-w-[52ch] text-[12.5px] leading-relaxed text-ink-3">
              Load a sample week to see how tasks, reading plans, habits, salah and the mind map
              hold together. It is real data — you can edit it, or delete all of it in one click.
            </p>
            <Button variant="primary" size="sm" className="mt-3" onClick={seed}>
              <Sparkles className="size-3.5" />
              Load sample data
            </Button>
          </div>
        </div>
      )}

      <Row
        label="Export everything"
        hint="One JSON file holding every row and your preferences. This is a real backup — importing it rebuilds the workspace."
        stacked
      >
        <div>
          {populated.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {populated.map((c) => (
                <span
                  key={c.key}
                  className="inline-flex items-center gap-1.5 rounded-md bg-hover px-2 py-1 text-[11.5px] text-ink-2"
                >
                  {LABELS[c.key]}
                  <span className="tnum text-ink-3">{c.n}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[12.5px] text-ink-4">Nothing to export yet.</p>
          )}
          <Button variant="primary" size="sm" className="mt-3" onClick={exportAll} disabled={total === 0}>
            <Download className="size-3.5" />
            Download {filename}
          </Button>
        </div>
      </Row>

      <Row
        label="Import a backup"
        hint="Rows already here are left alone — anything new is merged in. Your preferences come across too."
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

      <Row
        label="Load sample data"
        hint="A believable week: tasks across ten days, two books on a reading schedule, four habits with three weeks of history, two weeks of prayers, goals, a mind map and two templates."
      >
        <Button size="sm" onClick={() => (total > 0 ? setSeedOpen(true) : seed())}>
          <Sparkles className="size-3.5" />
          Load sample week
        </Button>
      </Row>

      <Row
        label="Delete all my data"
        hint="Removes every task, book, habit, prayer, goal, node and template from this account. Your sign-in and preferences stay. There is no undo — export first."
      >
        <Button
          size="sm"
          variant="danger"
          disabled={total === 0}
          onClick={() => setWipeOpen(true)}
        >
          <Trash2 className="size-3.5" />
          Delete everything
        </Button>
      </Row>

      {/* ---- import confirmation ---- */}
      <Modal open={!!pending} onClose={() => setPending(null)} width={440} title="Import this backup?">
        <div className="p-5">
          <p className="text-[13px] leading-relaxed text-ink-2">
            <span className="font-medium text-ink">{pending?.name}</span> was exported on{" "}
            <span className="tnum">{pending?.data.exported_at?.slice(0, 10) ?? "an unknown date"}</span>.
            These rows will be merged into your workspace.
          </p>

          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {incomingCounts.length ? (
              incomingCounts.map((c) => (
                <span
                  key={c.key}
                  className="inline-flex items-center gap-1.5 rounded-md bg-hover px-2 py-1 text-[11.5px] text-ink-2"
                >
                  {LABELS[c.key]}
                  <span className="tnum text-ink-3">{c.n}</span>
                </span>
              ))
            ) : (
              <span className="text-[12.5px] text-ink-4">This backup has no rows in it.</span>
            )}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Button onClick={() => setPending(null)}>Cancel</Button>
            <Button variant="primary" onClick={applyImport} disabled={!incomingCounts.length}>
              Import {incomingCounts.reduce((a, c) => a + c.n, 0)} rows
            </Button>
          </div>
        </div>
      </Modal>

      {/* ---- seeding on top of real data ---- */}
      <Modal open={seedOpen} onClose={() => setSeedOpen(false)} width={420} title="Add the sample week?">
        <div className="p-5">
          <p className="text-[13px] leading-relaxed text-ink-2">
            You already have <span className="tnum font-medium text-ink">{total}</span> rows. The sample
            week is added alongside them — nothing you have is touched, but your calendar will get busy.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button onClick={() => setSeedOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={seed}>Add it anyway</Button>
          </div>
        </div>
      </Modal>

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
