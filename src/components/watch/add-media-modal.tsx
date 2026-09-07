"use client";

import * as React from "react";
import { Film, Sparkles, Tv } from "lucide-react";
import { useStore } from "@/lib/store";
import type { Media, MediaKind, Tint } from "@/lib/types";
import { Button, Input, Segmented } from "@/components/ui/primitives";
import { Modal, TintPicker } from "@/components/ui/overlays";
import { MediaCover } from "./media-cover";
import { mediaFacetValues } from "./facets";
import { Field, NumberField, SuggestInput } from "./watch-fields";

const KIND_OPTIONS: { value: MediaKind; label: React.ReactNode }[] = [
  { value: "film", label: <span className="inline-flex items-center gap-1.5"><Film className="size-3.5" />Film</span> },
  { value: "anime", label: <span className="inline-flex items-center gap-1.5"><Sparkles className="size-3.5" />Anime</span> },
  { value: "series", label: <span className="inline-flex items-center gap-1.5"><Tv className="size-3.5" />Series</span> },
];

const ADD_LABEL: Record<MediaKind, string> = {
  film: "Add film",
  anime: "Add anime",
  series: "Add series",
  youtube: "Add video",
  playlist: "Add playlist",
};

const CREATOR_PLACEHOLDER: Record<MediaKind, string> = {
  film: "Christopher Nolan",
  anime: "Studio Ghibli",
  series: "HBO",
  youtube: "Channel name",
  playlist: "Channel name",
};

/**
 * Mounted only while open, so each visit starts from a clean sheet.
 *
 * The kind switch at the top is the whole dialog's hinge: a film is a
 * one-episode title, so it asks for a running time and nothing else. Anime and
 * series ask for an episode count and, optionally, the length of one episode.
 */
export function AddMediaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const media = useStore((s) => s.media);
  const insert = useStore((s) => s.insert);
  const toast = useStore((s) => s.toast);

  const [kind, setKind] = React.useState<MediaKind>("film");
  const [title, setTitle] = React.useState("");
  const [creator, setCreator] = React.useState("");
  const [genre, setGenre] = React.useState("");
  const [topic, setTopic] = React.useState("");
  const [series, setSeries] = React.useState("");
  const [tint, setTint] = React.useState<Tint>("violet");
  const [episodes, setEpisodes] = React.useState(12);
  // Two runtimes, not one: a feature film and one episode of a show are
  // different orders of magnitude, and switching kind should not leave a
  // 100-minute default sitting in an "each episode" box.
  const [filmRuntime, setFilmRuntime] = React.useState(100);
  const [episodeRuntime, setEpisodeRuntime] = React.useState(24);

  const isFilm = kind === "film";
  const creatorLabel = isFilm ? "Director" : "Studio";
  const runtime = isFilm ? filmRuntime : episodeRuntime;
  const totalEpisodes = isFilm ? 1 : Math.max(1, Math.round(episodes));
  const canSave = title.trim().length > 0;

  // The cover needs a whole Media to draw; nothing here is ever saved.
  const preview: Media = {
    id: "preview",
    user_id: "",
    deleted_at: null,
    title,
    creator: creator.trim() || null,
    url: null,
    channel: null,
    kind,
    genre: genre.trim() || null,
    topic: topic.trim() || null,
    series: series.trim() || null,
    color: tint,
    cover_url: null,
    total_episodes: totalEpisodes,
    current_episode: 0,
    episodes_per_day: null,
    runtime_min: runtime > 0 ? runtime : null,
    start_date: null,
    end_date: null,
    status: "planned",
    rating: null,
    notes: null,
    order_index: 0,
    created_at: "",
    updated_at: "",
  };

  function save() {
    if (!canSave) return;
    insert("media", {
      title: title.trim(),
      creator: creator.trim() || null,
      kind,
      genre: genre.trim() || null,
      topic: topic.trim() || null,
      series: series.trim() || null,
      color: tint,
      total_episodes: totalEpisodes,
      current_episode: 0,
      runtime_min: runtime > 0 ? Math.round(runtime) : null,
      // Nothing lands on a day until it is dragged there. Adding a title is
      // shelving it, not committing to a night.
      status: "planned",
      start_date: null,
      end_date: null,
      episodes_per_day: null,
      order_index: media.length ? Math.max(...media.map((m) => m.order_index)) + 1 : 0,
    });

    toast({
      title: "Added to your shelf",
      description: "Drag it onto a day in Calendar when you want to watch it.",
    });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Add to Films & Anime" width={520}>
      <div className="max-h-[70vh] overflow-y-auto px-4 py-4">
        <Segmented<MediaKind>
          value={kind}
          onChange={setKind}
          options={KIND_OPTIONS}
          className="mb-4 w-full [&>button]:flex-1"
        />

        <div className="flex gap-4">
          <div className="w-[92px] shrink-0">
            <MediaCover item={preview} />
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <Field label="Title">
              <Input
                autoFocus
                aria-label="Title"
                placeholder={isFilm ? "Arrival" : "Mushishi"}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canSave) save(); }}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={creatorLabel}>
                <SuggestInput
                  label={creatorLabel}
                  placeholder={CREATOR_PLACEHOLDER[kind]}
                  value={creator}
                  suggestions={mediaFacetValues(media, "creator")}
                  onChange={setCreator}
                  onCommit={setCreator}
                />
              </Field>
              <Field label="Genre" hint="optional">
                <SuggestInput
                  label="Genre"
                  placeholder="Science fiction"
                  value={genre}
                  suggestions={mediaFacetValues(media, "genre")}
                  onChange={setGenre}
                  onCommit={setGenre}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Topic" hint="optional">
                <SuggestInput
                  label="Topic"
                  placeholder="Memory and language"
                  value={topic}
                  suggestions={mediaFacetValues(media, "topic")}
                  onChange={setTopic}
                  onCommit={setTopic}
                />
              </Field>
              <Field label="Series" hint="optional">
                <SuggestInput
                  label="Series or collection"
                  placeholder="Ghibli run"
                  value={series}
                  suggestions={mediaFacetValues(media, "series")}
                  onChange={setSeries}
                  onCommit={setSeries}
                />
              </Field>
            </div>

            {isFilm ? (
              <div className="grid grid-cols-[130px_minmax(0,1fr)] items-start gap-3">
                <Field label="Runtime" hint="optional">
                  <NumberField
                    label="Runtime in minutes"
                    value={filmRuntime}
                    min={0}
                    max={900}
                    step={5}
                    suffix="min"
                    onChange={setFilmRuntime}
                  />
                </Field>
                <Field label="Colour" plain>
                  <div className="-ml-1">
                    <TintPicker value={tint} onChange={(t) => t && setTint(t)} />
                  </div>
                </Field>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Episodes">
                    <NumberField
                      label="Total episodes"
                      value={episodes}
                      min={1}
                      max={5000}
                      step={1}
                      onChange={setEpisodes}
                    />
                  </Field>
                  <Field label="Each episode" hint="optional">
                    <NumberField
                      label="Minutes per episode"
                      value={episodeRuntime}
                      min={0}
                      max={600}
                      step={5}
                      suffix="min"
                      onChange={setEpisodeRuntime}
                    />
                  </Field>
                </div>
                <Field label="Colour" plain>
                  <div className="-ml-1">
                    <TintPicker value={tint} onChange={(t) => t && setTint(t)} />
                  </div>
                </Field>
              </>
            )}
          </div>
        </div>

        <p className="mt-5 border-t border-line pt-4 text-[12px] leading-relaxed text-ink-3">
          {isFilm
            ? "Goes to your shelf unscheduled. Drag it onto a day in Calendar when you want to watch it — a film takes one evening, so it lands as one block."
            : "Goes to your shelf unscheduled. Drag it onto a day in Calendar, or open it and use Plan, when you want episodes laid out day by day."}
        </p>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="sm" disabled={!canSave} onClick={save}>
          {ADD_LABEL[kind]}
        </Button>
      </div>
    </Modal>
  );
}
