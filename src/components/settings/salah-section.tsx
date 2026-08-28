"use client";

import * as React from "react";
import { Globe2, MapPin, Sunrise, MoonStar } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatDuration, formatTime, todayISO } from "@/lib/date";
import { CALC_METHODS, CITY_PRESETS, currentPrayer, prayerTimesFor } from "@/lib/prayer";
import { PRAYER_LABELS, PRAYER_NAMES } from "@/lib/types";
import { useNow } from "@/hooks/use-hotkeys";
import { Input, Segmented } from "@/components/ui/primitives";
import { MenuItem, Popover } from "@/components/ui/overlays";
import { Pane, Row, SelectField } from "./ui";

const COORD = /^-?\d{1,3}(\.\d+)?$/;

export function SalahSection() {
  const profile = useStore((s) => s.profile);
  const hour12 = useStore((s) => s.hour12);
  const updateProfile = useStore((s) => s.updateProfile);
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

  // Times follow the draft coordinates so they move while you are still typing.
  const draftLat = COORD.test(lat.trim()) ? Number(lat) : latitude;
  const draftLng = COORD.test(lng.trim()) ? Number(lng) : longitude;
  const validLat = Math.abs(draftLat) <= 90;
  const validLng = Math.abs(draftLng) <= 180;

  const today = todayISO();
  const times = React.useMemo(
    () => prayerTimesFor(today, {
      latitude: validLat ? draftLat : latitude,
      longitude: validLng ? draftLng : longitude,
      method,
      madhab,
    }),
    [today, draftLat, draftLng, validLat, validLng, latitude, longitude, method, madhab],
  );

  const nowDate = new Date(now);
  const minutesNow = nowDate.getHours() * 60 + nowDate.getMinutes();
  const cursor = currentPrayer(times, minutesNow);

  function commitCoord(which: "latitude" | "longitude", raw: string) {
    const trimmed = raw.trim();
    const value = Number(trimmed);
    const limit = which === "latitude" ? 90 : 180;
    if (!COORD.test(trimmed) || Math.abs(value) > limit) {
      // Out of range or nonsense — snap the field back to what is stored.
      if (which === "latitude") setLat(String(latitude));
      else setLng(String(longitude));
      return;
    }
    if (which === "latitude") {
      if (value !== latitude) updateProfile({ latitude: value });
    } else if (value !== longitude) {
      updateProfile({ longitude: value });
    }
  }

  return (
    <Pane
      title="Salah"
      description="Prayer times are calculated on your device from your coordinates. Nothing is sent anywhere."
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

      <Row label="City" hint="Pick a preset to fill the coordinates and time zone in one go.">
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

      <Row label="Coordinates" hint="Latitude and longitude in decimal degrees. The times above update as you type.">
        <div className="flex items-center gap-2">
          <Input
            value={lat}
            aria-label="Latitude"
            inputMode="decimal"
            onChange={(e) => setLat(e.target.value)}
            onBlur={() => commitCoord("latitude", lat)}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            className={cn("w-[104px] text-center tnum", !validLat && "border-danger")}
          />
          <Input
            value={lng}
            aria-label="Longitude"
            inputMode="decimal"
            onChange={(e) => setLng(e.target.value)}
            onBlur={() => commitCoord("longitude", lng)}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            className={cn("w-[104px] text-center tnum", !validLng && "border-danger")}
          />
        </div>
      </Row>

      <Row label="Time zone" hint="Set by the city preset. Prayer times are always shown in your device's local time.">
        <div className="flex h-8 items-center gap-2 rounded-md border border-line bg-hover px-2.5 text-[13px] text-ink-2">
          <Globe2 className="size-3.5 shrink-0 text-ink-4" />
          <span className="truncate">{profile?.timezone || "Local"}</span>
        </div>
      </Row>

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
    </Pane>
  );
}
