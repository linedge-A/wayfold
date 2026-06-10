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
import { FolderOpen, Sparkles } from 'lucide-react';
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

  return (
    <div className="w-full h-full flex flex-col gap-2">
      {/* Header — title + reserved copilot call-out */}
      <header className="flex items-center justify-between px-3 py-2 bg-white border border-border-subtle rounded-2xl shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FolderOpen className="w-4 h-4 text-primary shrink-0" />
          <h1 className="text-sm font-bold text-on-surface">Saved Places</h1>
          <span className="text-[11px] font-medium text-secondary truncate">
            {pocketItems.length} {pocketItems.length === 1 ? 'spot' : 'spots'} across your research
          </span>
        </div>
        {onAskCopilot && (
          <button
            onClick={onAskCopilot}
            className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-primary/20 bg-accent-soft text-primary hover:bg-primary hover:text-white transition-colors cursor-pointer shrink-0"
            title="Ask the copilot about your saved places"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Ask Copilot
          </button>
        )}
      </header>

      {/* Map — all saved spots spatially (no day route; pocket items are the markers) */}
      <div className="shrink-0 h-[42%] min-h-[220px] flex flex-col">
        <MapPanel
          items={[]}
          selectedItemId={selectedItemId}
          onSelectItem={onSelectItem}
          pocketItems={pocketItems}
        />
      </div>

      {/* Bucket list — its own filter / search / group / sort are the screening controls */}
      <div className="flex-1 min-h-0 flex flex-col">
        <PocketPanel
          pocket={pocket}
          onAddPocketItem={onAddPocketItem}
          onPromoteItem={onPromoteItem}
          onClearAll={onClearAll}
          onRemovePocketItem={onRemovePocketItem}
          selectedItemId={selectedItemId}
          onSelectItem={onSelectItem}
        />
      </div>
    </div>
  );
}
