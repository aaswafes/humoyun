// =========================================================
// The words a playlist plan uses.
//
// All the arithmetic — pacing, projection, the reschedule diff — is the watch
// surface's, imported rather than copied: a playlist paces exactly like a
// series, and two copies of that maths would eventually disagree. Only the
// vocabulary differs, and it lives here.
// =========================================================

import {
  shortDate, type EpisodeRange, type WatchPlanDraft, type WatchPlanResult,
} from "@/components/watch/watch-plan";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "2 videos/day". Never called for a single video — one sitting has no rate. */
export const videoRateLabel = (perDay: number): string =>
  `${perDay} ${perDay === 1 ? "video" : "videos"}/day`;

/** "video 4" or "videos 4–6". */
export const videoRangeLabel = (r: EpisodeRange | null): string => {
  if (!r) return "—";
  return r.from === r.to ? `video ${r.from}` : `videos ${r.from}–${r.to}`;
};

/**
 * The shared planner speaks in episodes, because a series is what it was
 * written for. A playlist counts videos, so its refusals are re-worded rather
 * than re-implemented.
 */
const inVideos = (sentence: string): string =>
  sentence.replace(/\bepisodes\b/g, "videos").replace(/\bepisode\b/g, "video");

/** The live sentence under the plan controls — reads forwards or backwards. */
export function youtubePlanSentence(draft: WatchPlanDraft, result: WatchPlanResult): string {
  if (!result.valid) return inVideos(result.reason ?? "");
  if (result.single) return `One sitting on ${shortDate(result.endDate)}`;
  if (draft.mode === "perDay") {
    return `${videoRateLabel(result.perDay)} → ${plural(result.days, "day", "days")}, done by ${shortDate(result.endDate)}`;
  }
  return `Done by ${shortDate(result.endDate)} → ${videoRateLabel(result.perDay)} over ${plural(result.days, "day", "days")}`;
}
