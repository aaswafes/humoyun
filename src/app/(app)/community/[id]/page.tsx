"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, RefreshCw, Users } from "lucide-react";
import { SOLO } from "@/lib/local-db";
import { formatDate, todayISO } from "@/lib/date";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Button, EmptyState, IconButton, Segmented, Skeleton } from "@/components/ui/primitives";
import { MemberRow } from "@/components/community/member-today";
import type { FeedMember } from "@/components/community/community-types";
import { GoalsSection } from "@/components/community/goals-section";
import { RecsSection } from "@/components/community/recs-section";
import { MembersSection } from "@/components/community/members-section";
import {
  fetchFeed, fetchGoals, fetchMyCommunities, fetchRecs, useLoad, useUserId,
} from "@/components/community/community-data";

type View = "today" | "goals" | "recs" | "members";

export default function CommunityDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const userId = useUserId();
  const [view, setView] = React.useState<View>("today");

  const loadMine = React.useCallback(() => fetchMyCommunities(), []);
  const mine = useLoad(loadMine);

  const loadFeed = React.useCallback(() => fetchFeed(id), [id]);
  const feed = useLoad(loadFeed);

  const loadGoals = React.useCallback(() => fetchGoals(id), [id]);
  const goals = useLoad(loadGoals);

  const loadRecs = React.useCallback(() => fetchRecs(id), [id]);
  const recs = useLoad(loadRecs);

  const community = mine.data?.communities.find((c) => c.id === id) ?? null;
  const membership = mine.data?.memberships.find((m) => m.community_id === id && m.user_id === userId) ?? null;
  const members = React.useMemo(() => feed.data ?? [], [feed.data]);

  const reloadAll = React.useCallback(() => {
    mine.reload(); feed.reload(); goals.reload(); recs.reload();
  }, [mine, feed, goals, recs]);

  if (SOLO) {
    return (
      <>
        <PageHeader title="Community" actions={<span />} />
        <PageBody>
          <EmptyState
            icon={Users}
            title="Community needs an account"
            description="This is a local preview with no account and no network. Sign in to use communities."
          />
        </PageBody>
      </>
    );
  }

  // A community you are not a member of is indistinguishable from one that does
  // not exist, and that is on purpose — the roster is not public.
  if (!mine.loading && !community) {
    return (
      <>
        <PageHeader title="Community" actions={<span />} />
        <PageBody>
          <EmptyState
            icon={Users}
            title="Not found"
            description="This community does not exist, or you are not a member of it."
            action={<Link href="/community"><Button>Back to communities</Button></Link>}
          />
        </PageBody>
      </>
    );
  }

  const sharingCount = members.filter((m) => m.plan !== null).length;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-1.5">
            <Link
              href="/community"
              aria-label="Back to communities"
              className="-m-1 grid size-6 place-items-center rounded-md p-1 text-ink-3 hover:bg-hover hover:text-ink cursor-pointer transition-colors"
            >
              <ChevronLeft className="size-4" />
            </Link>
            {community?.name ?? "Community"}
          </span>
        }
        subtitle={members.length > 0 ? `${members.length} ${members.length === 1 ? "member" : "members"}` : undefined}
        actions={
          <IconButton label="Refresh" onClick={reloadAll}>
            <RefreshCw />
          </IconButton>
        }
      >
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "today", label: "Today" },
            { value: "goals", label: "Goals" },
            { value: "recs", label: "Recs" },
            { value: "members", label: "Members" },
          ]}
        />
      </PageHeader>

      <PageBody>
        {view === "today" && (
          <TodayView
            loading={feed.loading}
            error={feed.error}
            members={members}
            sharingCount={sharingCount}
            onRetry={feed.reload}
          />
        )}

        {view === "goals" && (
          <GoalsSection
            communityId={id}
            goals={goals.data?.goals ?? []}
            contributions={goals.data?.contributions ?? []}
            members={members}
            loading={goals.loading}
            onChanged={goals.reload}
          />
        )}

        {view === "recs" && (
          <RecsSection
            communityId={id}
            recs={recs.data?.recs ?? []}
            saves={recs.data?.saves ?? []}
            members={members}
            loading={recs.loading}
            onChanged={recs.reload}
          />
        )}

        {view === "members" && community && (
          <MembersSection
            community={community}
            membership={membership}
            members={members}
            onChanged={reloadAll}
          />
        )}
      </PageBody>
    </>
  );
}

function TodayView({
  loading, error, members, sharingCount, onRetry,
}: {
  loading: boolean;
  error: string | null;
  members: FeedMember[];
  sharingCount: number;
  onRetry: () => void;
}) {
  if (loading) {
    return <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>;
  }

  if (error) {
    return (
      <EmptyState
        icon={Users}
        title="Could not load today"
        description={error}
        action={<Button onClick={onRetry}>Try again</Button>}
      />
    );
  }

  if (members.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Nobody here yet"
        description="Share the invite code from the Members tab and this fills up."
      />
    );
  }

  return (
    <div>
      {/* The one hero on this screen. */}
      <div className="pb-2">
        <p className="display-serif text-[32px] leading-none text-ink tnum">{formatDate(todayISO())}</p>
        <p className="mt-1.5 text-[12.5px] text-ink-3">
          {sharingCount === 0
            ? "Nobody is sharing a plan yet"
            : `${sharingCount} of ${members.length} sharing a plan`}
        </p>
      </div>

      <div className="divide-y divide-line">
        {members.map((m) => <MemberRow key={m.user_id} member={m} />)}
      </div>
    </div>
  );
}
