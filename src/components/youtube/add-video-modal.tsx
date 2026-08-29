"use client";

import * as React from "react";
import { ListVideo, MonitorPlay } from "lucide-react";
import { useStore } from "@/lib/store";
import type { Media, MediaKind, Tint } from "@/lib/types";
import { Button, Input, Segmented } from "@/components/ui/primitives";
import { Modal, TintPicker } from "@/components/ui/overlays";
import { MediaCover } from "@/components/watch/media-cover";
import { Field, NumberField, SuggestInput } from "@/components/watch/watch-fields";
import { youtubeFacetValues } from "./youtube-facets";
import { normalizeUrl, urlHint } from "./youtube-url";

type YoutubeKind = Extract<MediaKind, "youtube" | "playlist">;

const KIND_OPTIONS: { value: YoutubeKind; label: React.ReactNode }[] = [
  { value: "youtube", label: <span className="inline-flex items-center gap-1.5"><MonitorPlay className="size-3.5" />Video</span> },
  { value: "playlist", label: <span className="inline-flex items-center gap-1.5"><ListVideo className="size-3.5" />Playlist</span> },
];

/**
 * Mounted only while open, so each visit starts from a clean sheet.
 *
 * The kind switch at the top is the whole dialog's hinge: a video is a
 * one-sitting title, so it asks for a length and nothing else. A playlist asks
 * how many videos are in it and, optionally, how long one of them runs — the
 * two numbers a pace is built from.
 */
export function AddVideoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const media = useStore((s) => s.media);
  const insert = useStore((s) => s.insert);
  const toast = useStore((s) => s.toast);

  const [kind, setKind] = React.useState<YoutubeKind>("youtube");
  const [title, setTitle] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [channel, setChannel] = React.useState("");
  const [genre, setGenre] = React.useState("");
  const [topic, setTopic] = React.useState("");
  const [series, setSeries] = React.useState("");
  const [tint, setTint] = React.useState<Tint>("red");
  const [videos, setVideos] = React.useState(10);
  // Two lengths, not one: a single video and one video inside a playlist are
  // different guesses, and switching kind should not leave the wrong default
  // sitting in the box.
  const [videoRuntime, setVideoRuntime] = React.useState(12);
  const [perVideoRuntime, setPerVideoRuntime] = React.useState(12);

  const single = kind === "youtube";
  const runtime = single ? videoRuntime : perVideoRuntime;
  const totalVideos = single ? 1 : Math.max(1, Math.round(videos));
  const canSave = title.trim().length > 0;
  // A link is a convenience, never a gate — this line informs, it never blocks.
  const linkHint = urlHint(url);

  // The cover needs a whole Media to draw; nothing here is ever saved.
  const preview: Media = {
    id: "preview",
    user_id: "",
    title,
    creator: null,
    url: normalizeUrl(url),
    channel: channel.trim() || null,
    kind,
    genre: genre.trim() || null,
    topic: topic.trim() || null,
    series: series.trim() || null,
    color: tint,
    cover_url: null,
    total_episodes: totalVideos,
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
      kind,
      url: normalizeUrl(url),
      channel: channel.trim() || null,
      creator: null,
      genre: genre.trim() || null,
      topic: topic.trim() || null,
      series: series.trim() || null,
      color: tint,
      total_episodes: totalVideos,
      current_episode: 0,
      runtime_min: runtime > 0 ? Math.round(runtime) : null,
      // Nothing lands on a day until it is dragged there. Adding a video is
      // saving it for later, not committing to an evening.
      status: "planned",
      start_date: null,
      end_date: null,
      episodes_per_day: null,
      order_index: media.length ? Math.max(...media.map((m) => m.order_index)) + 1 : 0,
    });

    toast({
      title: "Saved for later",
      description: "Drag it onto a day in Calendar when you want to watch it.",
    });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Add to YouTube" width={520}>
      <div className="max-h-[70vh] overflow-y-auto px-4 py-4">
        <Segmented<YoutubeKind>
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
                placeholder={single ? "How to read a paper" : "Linear algebra course"}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canSave) save(); }}
              />
            </Field>

            <Field label="Link" hint="optional">
              <Input
                aria-label="YouTube link"
                type="url"
                inputMode="url"
                placeholder="https://youtube.com/watch?v=…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canSave) save(); }}
              />
            </Field>
            {linkHint && <p className="-mt-1 text-[11px] text-ink-4">{linkHint}</p>}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Channel" hint="optional">
                <SuggestInput
                  label="Channel"
                  placeholder="Veritasium"
                  value={channel}
                  suggestions={youtubeFacetValues(media, "channel")}
                  onChange={setChannel}
                  onCommit={setChannel}
                />
              </Field>
              <Field label="Genre" hint="optional">
                <SuggestInput
                  label="Genre"
                  placeholder="Lecture"
                  value={genre}
                  suggestions={youtubeFacetValues(media, "genre")}
                  onChange={setGenre}
                  onCommit={setGenre}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Topic" hint="optional">
                <SuggestInput
                  label="Topic"
                  placeholder="Linear algebra"
                  value={topic}
                  suggestions={youtubeFacetValues(media, "topic")}
                  onChange={setTopic}
                  onCommit={setTopic}
                />
              </Field>
              <Field label="Series" hint="optional">
                <SuggestInput
                  label="Series or collection"
                  placeholder="Maths refresher"
                  value={series}
                  suggestions={youtubeFacetValues(media, "series")}
                  onChange={setSeries}
                  onCommit={setSeries}
                />
              </Field>
            </div>

            {single ? (
              <div className="grid grid-cols-[130px_minmax(0,1fr)] items-start gap-3">
                <Field label="Length" hint="optional">
                  <NumberField
                    label="Length in minutes"
                    value={videoRuntime}
                    min={0}
                    max={900}
                    step={5}
                    suffix="min"
                    onChange={setVideoRuntime}
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
                  <Field label="Videos">
                    <NumberField
                      label="Videos in the playlist"
                      value={videos}
                      min={1}
                      max={5000}
                      step={1}
                      onChange={setVideos}
                    />
                  </Field>
                  <Field label="Each video" hint="optional">
                    <NumberField
                      label="Minutes per video"
                      value={perVideoRuntime}
                      min={0}
                      max={600}
                      step={5}
                      suffix="min"
                      onChange={setPerVideoRuntime}
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
          {single
            ? "Goes to your watch-later list unscheduled. Drag it onto a day in Calendar when you want to watch it — one video is one sitting, so it lands as one block."
            : "Goes to your watch-later list unscheduled. Drag it onto a day in Calendar, or open it and use Plan, when you want the videos laid out day by day."}
        </p>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="sm" disabled={!canSave} onClick={save}>
          {single ? "Add video" : "Add playlist"}
        </Button>
      </div>
    </Modal>
  );
}
