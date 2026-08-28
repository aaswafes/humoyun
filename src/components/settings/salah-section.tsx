"use client";

import * as React from "react";
import { Crosshair, Globe2, MapPin, MoonStar, Sunrise } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { addDays, dayName, formatDuration, formatTime, todayISO } from "@/lib/date";
import { CALC_METHODS, CITY_PRESETS, currentPrayer, prayerTimesFor } from "@/lib/prayer";
import { PRAYER_LABELS, PRAYER_NAMES } from "@/lib/types";
import { useNow } from "@/hooks/use-hotkeys";
import { Button, Input, Segmented } from "@/components/ui/primitives";
import { Field } from "@/components/ui/form";
import { MenuItem, Popover } from "@/components/ui/overlays";
import { Callout, Group, Pane, Row, SelectField, StaticField } from "./ui";

const COORD = /^-?\d{1,3}(\.\d+)?$/;
const COMPARE_METHODS = ["MuslimWorldLeague", "Egyptian", "Karachi", "UmmAlQura", "NorthAmerica", "Turkey"];

type Which = "latitude" | "longitude";

/**
 * One reason a coordinate was rejected, in words, or null when it is fine.
 * An empty field is not an error yet — you have to be able to clear it and retype.
 */
function coordError(raw: string, which: Which): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!COORD.test(trimmed)) return "Digits and one decimal point only — for example 41.2995.";
  const limit = which === "latitude" ? 90 : 180;
  const value = Number(trimmed);
  if (Math.abs(value) > limit) {
    return which === "latitude"
      ? "Latitude runs from −90 to 90."
      : "Longitude runs from −180 to 180.";
  }
  return null;
}

export function SalahSection() {
  const profile = useStore((s) => s.profile);
  const hour12 = useStore((s) => s.hour12);
  const updateProfile = useStore((s) => s.updateProfile);
  const toast = useStore((s) => s.toast);
  const now = useNow(30_000);

  const latitude = profile?.latitude ?? 41.2995;
  const longitude = profile?.longitude ?? 69.2401;
  const method = profile?.calc_method ?? "MuslimWorldLeague";
  const madhab = profile?.madhab ?? "hanafi";

  // Seeded once. The preset picker is the only other writer and rewrites them
  // by hand, and the pane remounts whenever you come back to it.
  const [city, setCity] = React.useState(profile?.city ?? "");
  const [lat, setLat] = React.useState(String(latitude));
  const [lng, setLng] = React.useState(String(longitude));
  const [reverted, setReverted] = React.useState<Which | null>(null);
  const [locating, setLocating] = React.useState(false);

  const latError = coordError(lat, "latitude");
  const lngError = coordError(lng, "longitude");

  // Times follow the draft coordinates so they move while you are still typing.
  const draftLat = latError ? latitude : Number(lat);
  const draftLng = lngError ? longitude : Number(lng);

  const today = todayISO();
  const config = React.useMemo(
    () => ({ latitude: draftLat, longitude: draftLng, method, madhab }),
    [draftLat, draftLng, method, madhab],
  );
  const times = React.useMemo(() => prayerTimesFor(today, config), [today, config]);

  const week = React.useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(today, i + 1))
      .map((date) => ({ date, times: prayerTimesFor(date, config) })),
    [today, config],
  );

  const comparison = React.useMemo(
    () => COMPARE_METHODS.map((id) => ({
      id,
      label: CALC_METHODS.find((m) => m.id === id)?.label ?? id,
      times: prayerTimesFor(today, { ...config, method: id }),
    })),
    [today, config],
  );

  const nowDate = new Date(now);
  const minutesNow = nowDate.getHours() * 60 + nowDate.getMinutes();
  const cursor = currentPrayer(times, minutesNow);

  function commitCoord(which: Which, raw: string) {
    const error = coordError(raw, which) ?? (raw.trim() ? null : "empty");
    if (error) {
      // Say so, then put the stored value back — a silent snap looks like a bug.
      if (which === "latitude") setLat(String(latitude));
      else setLng(String(longitude));
      setReverted(which);
      return;
    }
    setReverted(null);
    const value = Number(raw.trim());
    if (which === "latitude") {
      if (value !== latitude) updateProfile({ latitude: value });
    } else if (value !== longitude) {
      updateProfile({ longitude: value });
    }
  }

  function locate() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast({ title: "No location available", description: "This browser will not share a position.", tone: "danger" });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const nextLat = Math.round(pos.coords.latitude * 1e4) / 1e4;
        const nextLng = Math.round(pos.coords.longitude * 1e4) / 1e4;
        setLat(String(nextLat));
        setLng(String(nextLng));
        setReverted(null);
        updateProfile({ latitude: nextLat, longitude: nextLng });
        toast({
          title: "Coordinates updated",
          description: "The city name is still yours to write — nothing was looked up online.",
          tone: "success",
        });
      },
      (err) => {
        setLocating(false);
        toast({
          title: "Could not get a position",
          description: err.code === err.PERMISSION_DENIED
            ? "The browser blocked it. Allow location for this site, or type the coordinates."
            : "Try again, or type the coordinates by hand.",
          tone: "danger",
        });
      },
      { timeout: 10_000, maximumAge: 300_000 },
    );
  }

  return (
    <Pane
      title="Salah"
      description="Prayer times are calculated on your device from your coordinates. Nothing is sent anywhere and nothing is looked up online."
    >
      <div className="mb-5 rounded-lg border border-line bg-sunken p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            Today in {city.trim() || "your location"}
          </p>
          <p className="text-[12px] text-ink-3">
            {PRAYER_LABELS[cursor.next]} in{" "}
            <span className="tnum text-ink-2">{formatDuration(Math.max(0, cursor.minutesUntil))}</span>
          </p>
        </div>

        <div className="mt-3 grid grid-cols-5 gap-1">
          {PRAYER_NAMES.map((name) => {
            const active = cursor.current === name;
            return (
              <div
                key={name}
                className={cn(
                  "rounded-md px-1 py-2 text-center transition-colors duration-200",
                  active ? "bg-accent-soft" : "bg-transparent",
                )}
              >
                <p
                  className={cn(
                    "text-[10.5px] font-semibold uppercase tracking-[0.06em]",
                    active ? "text-accent" : "text-ink-3",
                  )}
                >
                  {PRAYER_LABELS[name]}
                </p>
                <p className={cn("display-serif mt-1 text-[22px] leading-none tnum", active ? "text-accent" : "text-ink")}>
                  {formatTime(times[name], hour12)}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line pt-2.5 text-[12px] text-ink-3">
          <span className="inline-flex items-center gap-1.5">
            <Sunrise className="size-3.5" />
            Sunrise <span className="tnum text-ink-2">{formatTime(times.sunrise, hour12)}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MoonStar className="size-3.5" />
            Last third <span className="tnum text-ink-2">{formatTime(times.lastThird, hour12)}</span>
          </span>
        </div>
      </div>

      <Group title="Where you are">
        <Row label="City" hint="Only a label — it does not change the calculation. Pick a preset to fill everything in one go.">
          <div className="flex items-center gap-2">
            <Input
              value={city}
              aria-label="City name"
              onChange={(e) => setCity(e.target.value)}
              onBlur={() => {
                const next = city.trim();
                if (!next) { setCity(profile?.city ?? ""); return; }
                if (next !== profile?.city) updateProfile({ city: next });
              }}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              className="w-[152px]"
            />
            <Popover
              align="end"
              className="max-h-[300px] w-[264px] overflow-y-auto"
              trigger={
                <button
                  aria-label="Choose a city preset"
                  className={cn(
                    "flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-line bg-raised px-2.5",
                    "text-[13px] text-ink transition-colors duration-150 hover:border-line-strong",
                  )}
                >
                  <MapPin className="size-3.5 text-ink-3" />
                  Presets
                </button>
              }
            >
              {(close) => (
                <>
                  {CITY_PRESETS.map((preset) => (
                    <MenuItem
                      key={preset.name}
                      checked={preset.name === city.trim()}
                      shortcut={`${preset.latitude.toFixed(2)}, ${preset.longitude.toFixed(2)}`}
                      onClick={() => {
                        updateProfile({
                          city: preset.name,
                          latitude: preset.latitude,
                          longitude: preset.longitude,
                          timezone: preset.timezone,
                        });
                        setCity(preset.name);
                        setLat(String(preset.latitude));
                        setLng(String(preset.longitude));
                        setReverted(null);
                        close();
                      }}
                    >
                      {preset.name}
                    </MenuItem>
                  ))}
                </>
              )}
            </Popover>
          </div>
        </Row>

        <Row
          label="Coordinates"
          hint="Decimal degrees. The times above follow along as you type — they only get saved when the field is valid."
          stacked
        >
          <div>
            <div className="flex flex-wrap items-start gap-3">
              <Field label="Latitude" error={latError} className="w-[132px]">
                {(wiring) => (
                  <Input
                    {...wiring}
                    value={lat}
                    inputMode="decimal"
                    autoComplete="off"
                    onChange={(e) => { setLat(e.target.value); setReverted(null); }}
                    onBlur={() => commitCoord("latitude", lat)}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                    className={cn("text-center tnum", latError && "border-danger")}
                  />
                )}
              </Field>

              <Field label="Longitude" error={lngError} className="w-[132px]">
                {(wiring) => (
                  <Input
                    {...wiring}
                    value={lng}
                    inputMode="decimal"
                    autoComplete="off"
                    onChange={(e) => { setLng(e.target.value); setReverted(null); }}
                    onBlur={() => commitCoord("longitude", lng)}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                    className={cn("text-center tnum", lngError && "border-danger")}
                  />
                )}
              </Field>

            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button size="sm" loading={locating} onClick={locate}>
                <Crosshair className="size-3.5" />
                Use my location
              </Button>
              <span className="text-[12px] text-ink-4">
                Fills the two fields from your device. The city name stays as you wrote it.
              </span>
            </div>

            {reverted && (
              <p role="status" className="mt-2 text-[12px] text-ink-3">
                {reverted === "latitude" ? "Latitude" : "Longitude"} was not a usable number, so the saved value{" "}
                <span className="tnum text-ink-2">{reverted === "latitude" ? latitude : longitude}</span> was put back.
              </p>
            )}
          </div>
        </Row>

        <Row label="Time zone" hint="Set by the city preset. Times are always shown in your device's local time.">
          <StaticField icon={Globe2}>{profile?.timezone || "Local"}</StaticField>
        </Row>
      </Group>

      <Group title="How they are worked out">
        <Row label="Calculation method" hint="Different authorities use different twilight angles for Fajr and Isha.">
          <SelectField
            label="Calculation method"
            value={method}
            onChange={(v) => updateProfile({ calc_method: v })}
            options={CALC_METHODS.map((m) => ({ value: m.id as string, label: m.label }))}
          />
        </Row>

        <Row label="Asr madhab" hint="Hanafi puts Asr roughly an hour later than Shafi, Maliki and Hanbali.">
          <Segmented
            value={madhab === "hanafi" ? "hanafi" : "shafi"}
            onChange={(v) => updateProfile({ madhab: v })}
            options={[
              { value: "hanafi", label: "Hanafi" },
              { value: "shafi", label: "Shafi" },
            ]}
          />
        </Row>

        <Row
          label="What the other methods would say"
          hint="Fajr and Isha for today at your coordinates. The difference between authorities is real, not rounding."
          stacked
        >
          <div className="w-full max-w-[420px] overflow-x-auto">
            <table className="w-full min-w-[320px] text-[12.5px]">
              <caption className="sr-only">Fajr and Isha today under six calculation methods</caption>
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-ink-3">
                  <th scope="col" className="pb-1.5 font-semibold">Method</th>
                  <th scope="col" className="pb-1.5 text-right font-semibold">Fajr</th>
                  <th scope="col" className="pb-1.5 text-right font-semibold">Isha</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((m) => {
                  const active = m.id === method;
                  return (
                    <tr key={m.id} className={cn("border-t border-line", active && "bg-accent-soft")}>
                      <th
                        scope="row"
                        className={cn("truncate py-1.5 pr-3 text-left font-normal", active ? "text-accent" : "text-ink-2")}
                      >
                        {m.label}
                      </th>
                      <td className={cn("py-1.5 text-right tnum", active ? "text-accent" : "text-ink")}>
                        {formatTime(m.times.fajr, hour12)}
                      </td>
                      <td className={cn("py-1.5 text-right tnum", active ? "text-accent" : "text-ink")}>
                        {formatTime(m.times.isha, hour12)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Row>
      </Group>

      <Group title="The coming week" description="Calculated the same way, seven days ahead, so you can see the drift.">
        <div className="mt-1 overflow-x-auto">
          <table className="w-full min-w-[420px] text-[12.5px]">
            <caption className="sr-only">Prayer times for the next seven days</caption>
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.06em] text-ink-3">
                <th scope="col" className="pb-1.5 text-left font-semibold">Day</th>
                {PRAYER_NAMES.map((n) => (
                  <th key={n} scope="col" className="pb-1.5 text-right font-semibold">{PRAYER_LABELS[n]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {week.map(({ date, times: t }) => (
                <tr key={date} className="border-t border-line">
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink-2">
                    {dayName(date, "short")} {date.slice(8)}
                  </th>
                  {PRAYER_NAMES.map((n) => (
                    <td key={n} className="py-1.5 text-right text-ink tnum">{formatTime(t[n], hour12)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {Math.abs(latitude) > 55 && (
          <Callout tone="warn" title="High latitude" className="mt-3">
            Above about 55 degrees the twilight never fully ends for part of the year, and every method
            starts guessing at Fajr and Isha. Check the times against your local mosque before relying on them.
          </Callout>
        )}
      </Group>
    </Pane>
  );
}
