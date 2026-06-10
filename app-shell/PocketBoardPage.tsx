/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pocket Board — a global view of every saved place (the Research Pocket) as the Plan
 * workspace MINUS the calendar. Pure composition: it reuses MapPanel + PocketPanel as-is,
 * so the existing filter / search / group / relevance controls in the bucket list are the
 * screening UI, and the map shows all saved spots spatially. Selecting a chip and a marker
 * stay in sync via the shared selectedItemId the two panels already speak.
 *
 * NOT wired to a route yet — mounting this needs `currentView += 'pocket'`, which is pending
 * Agent 9 sign-off (coordination note: output/coordination-pocket-board-currentview.md).
 * This file changes no contract; it's ready to drop into App's render chain on approval.
 */
import { useState, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { PocketColumn, PlaceItem } from '@/shared/types/index';
import MapPanel from '@/modules/map/MapPanel';
import PocketPanel from '@/modules/pocket/PocketPanel';

interface PocketBoardPageProps {
  pocket: PocketColumn[];
  selectedItemId?: string;
  onSelectItem: (id: string | undefined) => void;
  onAddPocketItem: (columnId: string, item: PlaceItem) => void;
  onPromoteItem: (item: PlaceItem) => void;
  onClearAll: () => void;
  onRemovePocketItem?: (itemId: string) => void;
  /** Reserved copilot call-out — wired only if/when the board needs the assistant. */
  onAskCopilot?: () => void;
}

export default function PocketBoardPage({
  pocket,
  selectedItemId,
  onSelectItem,
  onAddPocketItem,
  onPromoteItem,
  onClearAll,
  onRemovePocketItem,
  onAskCopilot,
}: PocketBoardPageProps) {
  // The whole pocket, flattened — the board is global (no focused day, so no day-relevance lens).
  const pocketItems = pocket.flatMap(col => col.items);
  // Shared geographic level-of-detail: the map's live zoom drives the list's "Group by Area"
  // granularity (region → province → city → district), so list + map stay at the same scale.
  const [mapZoom, setMapZoom] = useState(2);

  // Draggable split — the user can enlarge either panel.
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState(480);
  const startDrag = (e: ReactMouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = ev.clientX - rect.left;
      setLeftWidth(Math.max(300, Math.min(rect.width - 340, x)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.userSelect = 'none';
  };

  return (
    <div ref={containerRef} className="w-full h-full flex">
      {/* Bucket list — LEFT (resizable). Its own filter / search / group / sort are the controls. */}
      <div style={{ width: `${leftWidth}px` }} className="min-w-0 shrink-0 flex flex-col">
        <PocketPanel
          pocket={pocket}
          onAddPocketItem={onAddPocketItem}
          onPromoteItem={onPromoteItem}
          onClearAll={onClearAll}
          onRemovePocketItem={onRemovePocketItem}
          selectedItemId={selectedItemId}
          onSelectItem={onSelectItem}
          mapZoom={mapZoom}
        />
      </div>

      {/* Drag handle — resize either panel (double-click to reset) */}
      <div
        onMouseDown={startDrag}
        onDoubleClick={() => setLeftWidth(480)}
        className="w-3 hover:w-4 flex items-center justify-center cursor-col-resize group self-stretch select-none shrink-0 transition-all"
        title="Drag to resize · double-click to reset"
      >
        <div className="w-1 h-12 rounded-full bg-slate-200 group-hover:bg-primary/50 group-active:bg-primary transition-all pointer-events-none" />
      </div>

      {/* Map — RIGHT, fills the rest. All saved spots as markers (no day route). */}
      <div className="flex-1 min-w-0 flex flex-col">
        <MapPanel
          items={[]}
          selectedItemId={selectedItemId}
          onSelectItem={onSelectItem}
          pocketItems={pocketItems}
          onZoomChange={setMapZoom}
        />
      </div>
    </div>
  );
}
