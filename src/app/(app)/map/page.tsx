"use client";

import * as React from "react";
import { CalendarRange, Network, Plus, Waypoints } from "lucide-react";
import { useStore } from "@/lib/store";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Button, EmptyState, Segmented } from "@/components/ui/primitives";
import { BoardSwitcher } from "@/components/map/board-switcher";
import { MapCanvas, type MapControls } from "@/components/map/map-canvas";

const LAST_BOARD = "humoyun.map.board";
const LAST_MODE = "humoyun.map.timeline";

const readLocal = (key: string) => {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(key); } catch { return null; }
};

export default function MapPage() {
  const boards = useStore((s) => s.boards);
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const insert = useStore((s) => s.insert);

  const [boardId, setBoardId] = React.useState<string | null>(() => readLocal(LAST_BOARD));
  const [timelineMode, setTimelineMode] = React.useState(() => readLocal(LAST_MODE) === "1");
  const controls = React.useRef<MapControls | null>(null);

  const sorted = React.useMemo(
    () => [...boards].sort((a, b) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at)),
    [boards],
  );
  const active = sorted.find((b) => b.id === boardId) ?? sorted[0] ?? null;

  React.useEffect(() => {
    if (!active) return;
    try { localStorage.setItem(LAST_BOARD, active.id); } catch { /* private mode */ }
  }, [active]);

  React.useEffect(() => {
    try { localStorage.setItem(LAST_MODE, timelineMode ? "1" : "0"); } catch { /* private mode */ }
  }, [timelineMode]);

  const boardNodes = active
    ? nodes.filter((n) => n.board_id === active.id || (n.board_id === null && active.id === sorted[0]?.id))
    : [];
  const nodeIds = new Set(boardNodes.map((n) => n.id));
  const boardEdges = edges.filter((e) => nodeIds.has(e.source_id) && nodeIds.has(e.target_id));
  const dated = boardNodes.filter((n) => n.date).length;

  function createFirstBoard() {
    const board = insert("boards", { name: "Mind Map", color: "blue", order_index: 0 });
    setBoardId(board.id);
  }

  return (
    <>
      <PageHeader
        title="Mind Map"
        subtitle={
          active ? (
            <span className="tnum">
              {boardNodes.length} node{boardNodes.length === 1 ? "" : "s"} · {boardEdges.length} link
              {boardEdges.length === 1 ? "" : "s"} · {dated} dated
            </span>
          ) : undefined
        }
        actions={
          <div className="flex items-center gap-1.5">
            <Segmented
              value={timelineMode ? "timeline" : "canvas"}
              onChange={(v) => setTimelineMode(v === "timeline")}
              options={[
                {
                  value: "canvas",
                  title: "Free canvas",
                  label: (
                    <span className="flex items-center gap-1.5">
                      <Waypoints className="size-3.5" />
                      Canvas
                    </span>
                  ),
                },
                {
                  value: "timeline",
                  title: "Lay dated nodes out along a time axis",
                  label: (
                    <span className="flex items-center gap-1.5">
                      <CalendarRange className="size-3.5" />
                      Timeline
                    </span>
                  ),
                },
              ]}
            />
            <Button
              variant="primary"
              size="sm"
              disabled={!active}
              onClick={() => controls.current?.addNode()}
            >
              <Plus className="size-3.5" />
              Node
            </Button>
          </div>
        }
      >
        {active && <BoardSwitcher boards={sorted} active={active} onSelect={setBoardId} />}
      </PageHeader>

      {active ? (
        <PageBody className="h-full max-w-none px-0 py-0 md:px-0">
          <MapCanvas
            key={active.id}
            ref={controls}
            board={active}
            timelineMode={timelineMode}
            adoptOrphans={active.id === sorted[0]?.id}
          />
        </PageBody>
      ) : (
        <PageBody>
          <EmptyState
            icon={Network}
            title="Start a mind map"
            description="Boards hold nodes you can link together and anchor to real dates, so an idea in May visibly points at the one it becomes in June."
            action={
              <Button variant="primary" size="sm" onClick={createFirstBoard}>
                <Plus className="size-3.5" />
                Create a board
              </Button>
            }
          />
        </PageBody>
      )}
    </>
  );
}
