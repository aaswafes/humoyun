"use client";

import * as React from "react";
import { formatDate } from "@/lib/date";
import { Button, Input, Segmented } from "@/components/ui/primitives";
import { Field, Toggle } from "@/components/ui/form";
import { farzFromBirth, owedDays, spanLabel, type QazoConfig } from "./qazo-data";

type Mode = "birthday" | "date";

/**
 * The one question the debt hangs on: since when has salah been fard on you,
 * and since when have you prayed regularly. Either the date itself, or a
 * birthday and the age it became fard — the form works the date out.
 */
export function QazoSetup({
  today, initial, onSave, onCancel,
}: {
  today: string;
  initial: QazoConfig | null;
  onSave: (config: QazoConfig) => void;
  onCancel?: () => void;
}) {
  const [mode, setMode] = React.useState<Mode>(initial && !initial.birth ? "date" : "birthday");
  const [birth, setBirth] = React.useState(initial?.birth ?? "");
  const [age, setAge] = React.useState(initial?.age ? String(initial.age) : "12");
  const [farzDate, setFarzDate] = React.useState(initial?.farz ?? "");
  const [regular, setRegular] = React.useState(initial?.regular ?? today);
  const [witr, setWitr] = React.useState(initial?.witr ?? true);

  const ageNum = Number(age);
  const ageOk = Number.isFinite(ageNum) && ageNum >= 7 && ageNum <= 20;
  const farz = mode === "date" ? farzDate : birth && ageOk ? farzFromBirth(birth, ageNum) : "";

  let error: string | null = null;
  if (mode === "birthday" && age && !ageOk) error = "The age should be between 7 and 20.";
  else if (farz && farz > today) error = "That date is still ahead — nothing is owed yet.";
  else if (farz && regular && regular < farz) error = "Regular praying can't start before salah became fard.";
  else if (regular > today) error = "The regular start can't be in the future.";

  const ready = !!farz && !!regular && !error;
  const days = ready ? owedDays({ farz, regular }) : 0;
  const prayers = witr ? 6 : 5;

  function save() {
    if (!ready) return;
    onSave({
      farz,
      regular,
      witr,
      prior: initial?.prior ?? 0,
      adjust: initial?.adjust ?? {},
      birth: mode === "birthday" ? birth : null,
      age: mode === "birthday" ? ageNum : null,
    });
  }

  return (
    <section data-tour="salah.qazo.setup" className="surface mx-auto w-full max-w-[560px] p-5 sm:p-6">
      <h2 className="text-[17px] font-semibold text-ink">When did salah become fard on you?</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
        Sizga namoz qachon farz bo&lsquo;lgan? Everything from that day until you started praying
        regularly is counted as qazo, and this tab helps you pay it back.
      </p>

      <Segmented
        className="mt-5"
        value={mode}
        onChange={setMode}
        options={[
          { value: "birthday", label: "From my birthday" },
          { value: "date", label: "I know the date" },
        ]}
      />

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {mode === "birthday" ? (
          <>
            <Field label="Birthday">
              <Input type="date" value={birth} max={today} onChange={(e) => setBirth(e.target.value)} />
            </Field>
            <Field label="Fard from age" description="Usually 12–15, when you reached puberty.">
              <Input
                type="number"
                inputMode="numeric"
                min={7}
                max={20}
                value={age}
                onChange={(e) => setAge(e.target.value)}
              />
            </Field>
          </>
        ) : (
          <Field label="Fard since" className="sm:col-span-2">
            <Input type="date" value={farzDate} max={today} onChange={(e) => setFarzDate(e.target.value)} />
          </Field>
        )}
        <Field
          label="Praying regularly since"
          description="The day you stopped missing. Leave it on today if you're just starting."
          className="sm:col-span-2"
        >
          <Input type="date" value={regular} max={today} onChange={(e) => setRegular(e.target.value)} />
        </Field>
      </div>

      <Toggle
        className="mt-5"
        checked={witr}
        onChange={setWitr}
        label="Count Witr too"
        description="Witr is wajib in the Hanafi madhab, so it is made up like the five."
      />

      <div className="hairline-t mt-5 pt-4" aria-live="polite">
        {error ? (
          <p role="alert" className="text-[13px] text-danger">{error}</p>
        ) : ready ? (
          <p className="text-[13px] leading-relaxed text-ink-2">
            Fard since <b className="font-medium text-ink">{formatDate(farz, { weekday: false, year: true })}</b>. That is{" "}
            <span className="tnum">{days.toLocaleString()}</span> days ({spanLabel(days)}) —{" "}
            <b className="tnum font-semibold text-ink">{(days * prayers).toLocaleString()}</b> prayers to make up.
          </p>
        ) : (
          <p className="text-[13px] text-ink-4">Fill in the dates and the count shows here.</p>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button variant="primary" disabled={!ready} onClick={save}>
          {initial ? "Save" : "Count my qazo"}
        </Button>
      </div>
    </section>
  );
}
