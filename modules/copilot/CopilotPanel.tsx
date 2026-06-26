/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, RotateCcw, AlertCircle, History, Sparkles, Check, Coffee, Mic, User, ChevronDown, ChevronRight, StickyNote, Plus, X } from 'lucide-react';
import { RevisionDelta, CopilotMessage } from '@/shared/types/index';

interface Note {
  id: string;
  text: string;
}

interface PendingChange {
  updatedItems?: unknown[];
  updatedPocket?: unknown[];
  deltas?: RevisionDelta[];
}

interface CopilotPanelProps {
  messages: CopilotMessage[];
  deltas: RevisionDelta[];
  onSendMessage: (text: string) => void;
  onApplyPreset: (command: string) => void;
  onRevertDelta: (deltaId: string) => void;
  onApplySug: (msgId: string) => void;
  pendingChanges?: Record<string, PendingChange>;
  onApplyChange?: (msgId: string) => void;
  isLoading?: boolean;
}

// ── Copilot colour strategy ───────────────────────────────────────────────
// Bubbles are always neutral (no coloured border). Colour lives only on the
// action button, escalating with commitment:
//   neutral  → info / save-to-bucket / destination chips (additive, low stakes)
//   primary  → confirm adding a NEW stop to the schedule
//   warning  → changing an existing scheduled item (move / shift)
//   danger   → removing an existing scheduled item
type ActionTier = 'neutral' | 'confirm' | 'change' | 'remove';
const TIER_BTN: Record<ActionTier, string> = {
  neutral: 'bg-white border border-border-subtle text-on-surface hover:bg-surface-container-low',
  confirm: 'bg-primary text-white border border-primary hover:bg-accent-primary-hover',
  change: 'bg-[#D48A00] text-white border border-[#D48A00] hover:bg-[#B87600]',
  remove: 'bg-[#D64545] text-white border border-[#D64545] hover:bg-[#B53A3A]',
};

const classifySuggestion = (s: NonNullable<CopilotMessage['suggestion']>): ActionTier => {
  if (s.itemsToAdd && s.itemsToAdd.length > 0) return 'neutral'; // save to bucket
  if (s.type === 'Conflict Alert' || s.timeShift || s.type === 'Suggested Adjustment') return 'change';
  return 'confirm'; // Smart Add of a new stop
};

const classifyDeltas = (ds?: RevisionDelta[]): ActionTier => {
  if (!ds || ds.length === 0) return 'confirm';
  if (ds.some(d => d.type === 'drop')) return 'remove';
  if (ds.some(d => d.type === 'move' || d.type === 'time-shift')) return 'change';
  return 'confirm'; // add-only
};

// Minimal, XSS-safe rich-text rendering for chat messages: **bold** + numbered/bulleted list lines
// + paragraph breaks. Builds React nodes directly (no innerHTML), so model/server output stays inert.
const boldSegments = (line: string, key: number): React.ReactNode => {
  const parts = line.split(/\*\*([^*]+)\*\*/g);
  return (
    <React.Fragment key={key}>
      {parts.map((p, i) => (i % 2 === 1 ? <strong key={i} className="font-bold text-on-surface">{p}</strong> : p))}
    </React.Fragment>
  );
};
const renderRichText = (text?: string): React.ReactNode => {
  if (!text) return null;
  // Numbered items often arrive inline ("…: 1. **A** … 2. **B** …") — break them onto their own lines.
  const normalized = text.replace(/\s(?=\d{1,2}\.\s\*\*)/g, '\n');
  return normalized.split('\n').map((rawLine, idx) => {
    const line = rawLine.trimEnd();
    if (!line.trim()) return <div key={idx} className="h-1.5" />;
    const m = line.match(/^\s*(\d{1,2}[.)]|[-•])\s+(.*)$/);
    if (m) {
      return (
        <div key={idx} className="flex gap-1.5 pl-1 mt-1">
          <span className="shrink-0 font-bold text-primary">{m[1].replace(')', '.')}</span>
          <span className="min-w-0">{boldSegments(m[2], idx)}</span>
        </div>
      );
    }
    return <div key={idx} className={idx > 0 ? 'mt-1' : ''}>{boldSegments(line, idx)}</div>;
  });
};

export default function CopilotPanel({
  messages,
  deltas,
  onSendMessage,
  onApplyPreset,
  onRevertDelta,
  onApplySug,
  pendingChanges,
  onApplyChange,
  isLoading,
}: CopilotPanelProps) {
  const [inputText, setInputText] = useState('');
  const [historyHeight, setHistoryHeight] = useState(140);
  const [notesHeight, setNotesHeight] = useState(100);
  const [showRevisions, setShowRevisions] = useState(false);
  const [isNotesFolded, setIsNotesFolded] = useState(false);
  const [notes, setNotes] = useState<Note[]>([
    { id: '1', text: 'Check Silver Pavilion accessibility' },
    { id: '2', text: 'https://www.japan-guide.com/e/e3907.html' }
  ]);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [noteInputValue, setNoteInputValue] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isAddingNote) {
      noteInputRef.current?.focus();
    }
  }, [isAddingNote]);

  useEffect(() => {
    if (editingNoteId) {
      editInputRef.current?.focus();
    }
  }, [editingNoteId]);

  const handleSend = () => {
    const text = inputText.trim();
    if (!text) return;
    onSendMessage(text);
    setInputText('');
  };

  const handleAddNote = () => {
    const text = noteInputValue.trim();
    if (text) {
      setNotes([{ id: Date.now().toString(), text }, ...notes]);
      setNoteInputValue('');
    }
    setIsAddingNote(false);
  };

  const handleDeleteNote = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNotes(notes.filter(n => n.id !== id));
  };

  const handleUpdateNote = (id: string, newText: string) => {
    const text = newText.trim();
    if (text) {
      setNotes(notes.map(n => n.id === id ? { ...n, text } : n));
    } else {
      setNotes(notes.filter(n => n.id !== id));
    }
    setEditingNoteId(null);
  };

  const renderTextWithLinks = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, i) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  const handleResizeDrag = (type: 'history' | 'notes') => (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const isHistory = type === 'history';
    const startHeight = isHistory ? historyHeight : notesHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const minHeight = isHistory ? 60 : 40;
      const maxHeight = isHistory ? 420 : 300;
      const newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + deltaY));
      
      if (isHistory) {
        setHistoryHeight(newHeight);
      } else {
        setNotesHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.classList.remove('select-none', 'cursor-row-resize');
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.classList.add('select-none', 'cursor-row-resize');
  };

  return (
    <aside className="w-full h-full bg-white border border-border-subtle rounded-[8px] overflow-hidden shadow-sm flex flex-col">
      {/* Travel Notes Section */}
      <div className="border-b border-border-subtle bg-white flex flex-col shrink-0 relative">
        <div className="flex items-center px-3 py-2 hover:bg-[#EDEBE7]/40 transition-colors select-none">
          <div 
            onClick={() => setIsNotesFolded(!isNotesFolded)}
            className="flex items-center gap-2 flex-1 cursor-pointer"
            title={isNotesFolded ? "Click to expand notes" : "Click to fold notes"}
          >
            <StickyNote className="w-4 h-4 text-primary" />
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-on-surface">Notes</h3>
            {notes.length > 0 && (
              <span className="bg-primary/10 text-primary px-1.5 py-0.25 rounded-md text-[9px] font-bold">
                {notes.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsNotesFolded(false);
                setIsAddingNote(true);
              }}
              className="p-1 text-primary hover:bg-primary/10 rounded-md transition-colors cursor-pointer"
              title="Add Note"
            >
              <Plus className="w-4 h-4" />
            </button>
            <div 
              onClick={() => setIsNotesFolded(!isNotesFolded)}
              className="text-secondary cursor-pointer p-0.5 hover:text-primary transition-colors"
            >
              {isNotesFolded ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </div>
          </div>
        </div>

        {!isNotesFolded && (
          <div className="px-3 pb-3 flex flex-col">
            <div 
              style={{ height: `${notesHeight}px` }}
              className="flex flex-col gap-2 overflow-y-auto custom-scrollbar pr-0.5"
            >
              {isAddingNote && (
                <div className="w-full">
                  <textarea
                    ref={noteInputRef}
                    value={noteInputValue}
                    onChange={(e) => setNoteInputValue(e.target.value)}
                    onBlur={handleAddNote}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleAddNote();
                      }
                      if (e.key === 'Escape') {
                        setIsAddingNote(false);
                        setNoteInputValue('');
                      }
                    }}
                    placeholder="Type or paste your note here..."
                    className="w-full p-2.5 bg-white border border-primary/30 rounded-xl text-[10px] outline-none focus:ring-1 focus:ring-primary shadow-sm font-sans resize-none"
                    rows={2}
                  />
                </div>
              )}

              {notes.map((note) => (
                <div
                  key={note.id}
                  onDoubleClick={() => setEditingNoteId(note.id)}
                  className="group relative text-[11px] font-medium bg-white px-3 py-2 rounded-xl border border-border-subtle hover:border-primary/30 hover:shadow-sm transition-all cursor-text w-full"
                >
                  {editingNoteId === note.id ? (
                    <textarea
                      ref={editInputRef}
                      defaultValue={note.text}
                      onBlur={(e) => handleUpdateNote(note.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleUpdateNote(note.id, (e.target as HTMLTextAreaElement).value);
                        }
                      }}
                      className="w-full bg-transparent border-none outline-none resize-none p-0 font-sans leading-normal overflow-hidden"
                      rows={Math.min(3, note.text.split('\n').length + 1)}
                    />
                  ) : (
                    <div className="leading-normal">
                      {renderTextWithLinks(note.text)}
                    </div>
                  )}
                  
                  <button
                    onClick={(e) => handleDeleteNote(note.id, e)}
                    className="absolute top-2 right-2 w-4 h-4 bg-[#F7F6F2] text-secondary hover:bg-amber-100 hover:text-warning rounded-full flex items-center justify-center border border-border-subtle opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <X className="w-2 h-2" />
                  </button>
                </div>
              ))}
            </div>
            {notes.length === 0 && !isAddingNote && (
              <p className="text-[10px] text-secondary italic">No notes yet. Click + to add tips or links.</p>
            )}

            {/* Resize Slider for Notes */}
            <div
              onMouseDown={handleResizeDrag('notes')}
              className="h-2 -mb-2 mt-1 flex items-center justify-center cursor-row-resize group select-none shrink-0 transition-all py-1"
              title="Drag border to resize notes"
            />
          </div>
        )}
      </div>

      {/* Copilot Header — revision log lives here as a pop-card */}
      <div className="px-3 py-2 border-b border-border-subtle flex justify-between items-center bg-white shrink-0 relative">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-on-surface">Travel Copilot</h3>
        </div>

        {/* Revision log trigger */}
        <button
          onClick={() => setShowRevisions(v => !v)}
          className={`relative flex items-center gap-1 px-1.5 py-1 rounded-lg text-[10px] font-bold transition-colors cursor-pointer ${
            showRevisions ? 'bg-primary-soft text-primary' : 'text-secondary hover:bg-surface-container-low hover:text-primary'
          }`}
          title="Revision log"
        >
          <History className="w-4 h-4" />
          {deltas.length > 0 && (
            <span className="min-w-[15px] h-[15px] px-1 inline-flex items-center justify-center bg-primary text-white rounded-full text-[9px] font-bold leading-none">
              {deltas.length}
            </span>
          )}
        </button>

        {/* Revision log pop-card */}
        {showRevisions && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowRevisions(false)} />
            <div className="absolute top-[42px] right-2 w-72 max-h-80 overflow-y-auto custom-scrollbar bg-white border border-border-subtle rounded-xl shadow-lg z-50 animate-fadeIn">
              <div className="px-3 py-2 flex items-center justify-between border-b border-border-subtle sticky top-0 bg-white">
                <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-primary" />
                  Revision Log
                </span>
                <span className="text-[9px] text-tertiary font-bold">{deltas.length}</span>
              </div>
              {deltas.length > 0 ? (
                <div className="py-1">
                  {deltas.map((delta) => {
                    const verb =
                      delta.type === 'move' ? 'Moved' :
                      delta.type === 'add' ? 'Added' :
                      delta.type === 'drop' ? 'Dropped' : 'Shifted';
                    const suffix = delta.to ? ` → ${delta.to}` : delta.from ? ` · ${delta.from}` : '';
                    return (
                      <div key={delta.id} className="group flex items-center gap-2 px-3 py-1.5 hover:bg-surface-container-low transition-colors">
                        <Check className="w-3 h-3 text-success shrink-0" />
                        <span className="flex-1 min-w-0 text-[11px] text-on-surface truncate" title={`${verb} ${delta.itemTitle}${suffix}`}>
                          <span className="font-bold">{verb}</span> {delta.itemTitle}<span className="text-secondary">{suffix}</span>
                        </span>
                        <button
                          onClick={() => onRevertDelta(delta.id)}
                          title="Revert change"
                          className="p-0.5 rounded text-tertiary hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shrink-0"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="px-3 py-4 text-[11px] text-secondary italic text-center">No changes yet this session.</p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Copilot Message Timeline */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3 bg-white">
        {messages.map((msg) => {
          const isAI = msg.sender === 'ai';
          return (
            <div key={msg.id} className={`flex ${isAI ? '' : 'justify-end'}`}>
              <div className="flex flex-col gap-1 max-w-[90%]">
                <div
                  className={`p-2.5 text-xs font-medium leading-snug rounded-2xl ${
                    isAI
                      ? 'bg-surface-container-low text-on-surface rounded-tl-none border border-border-subtle/50'
                      : 'bg-primary text-white rounded-tr-none'
                  }`}
                >
                  {renderRichText(msg.text)}

                  {/* Suggestion — neutral text; colour lives only on the action button */}
                  {isAI && msg.suggestion && (() => {
                    const tier = classifySuggestion(msg.suggestion);
                    const isConflict = msg.suggestion.type === 'Conflict Alert';
                    return (
                      <div className="mt-2 pt-2 border-t border-border-subtle/70 flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          {isConflict
                            ? <AlertCircle className="w-3 h-3 text-[#D48A00]" />
                            : <Sparkles className="w-3 h-3 text-secondary" />}
                          <span className={`text-[9px] font-bold uppercase tracking-wide ${isConflict ? 'text-[#D48A00]' : 'text-secondary'}`}>
                            {msg.suggestion.type}
                          </span>
                        </div>
                        <p className="text-[11px] font-bold leading-tight">{msg.suggestion.title}</p>
                        {msg.suggestion.description && (
                          <p className="text-[10px] text-secondary leading-snug">{msg.suggestion.description}</p>
                        )}
                        {msg.suggestion.timeShift && (
                          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-secondary">
                            <span className="line-through">{msg.suggestion.timeShift.from}</span>
                            <span>&rarr;</span>
                            <span className="font-bold text-[#D48A00]">{msg.suggestion.timeShift.to}</span>
                          </div>
                        )}
                        <button
                          onClick={() => onApplySug(msg.id)}
                          className={`self-start mt-0.5 px-3 py-1 text-[10px] font-bold rounded-lg cursor-pointer transition-colors ${TIER_BTN[tier]}`}
                        >
                          {msg.suggestion.actionLabel || 'Apply'}
                        </button>
                      </div>
                    );
                  })()}

                  {/* Staged schedule change — explicit confirm (blue add / orange shift / red remove) */}
                  {isAI && pendingChanges && pendingChanges[msg.id] && (() => {
                    const pc = pendingChanges[msg.id];
                    const tier = classifyDeltas(pc.deltas);
                    const label = tier === 'remove' ? 'Apply removal' : tier === 'change' ? 'Apply changes' : 'Add to plan';
                    return (
                      <div className="mt-2 pt-2 border-t border-border-subtle/70 flex flex-col gap-1.5">
                        {pc.deltas && pc.deltas.length > 0 && (
                          <div className="flex flex-col gap-0.5">
                            {pc.deltas.slice(0, 4).map(d => {
                              const verb = d.type === 'move' ? 'Move' : d.type === 'add' ? 'Add' : d.type === 'drop' ? 'Remove' : 'Shift';
                              const suffix = d.to ? ` → ${d.to}` : d.from ? ` · ${d.from}` : '';
                              return (
                                <span key={d.id} className="text-[10px] text-secondary truncate" title={`${verb} ${d.itemTitle}${suffix}`}>
                                  <span className="font-bold text-on-surface">{verb}</span> {d.itemTitle}{suffix}
                                </span>
                              );
                            })}
                          </div>
                        )}
                        <button
                          onClick={() => onApplyChange?.(msg.id)}
                          className={`self-start mt-0.5 px-3 py-1 text-[10px] font-bold rounded-lg cursor-pointer transition-colors ${TIER_BTN[tier]}`}
                        >
                          {label}
                        </button>
                      </div>
                    );
                  })()}
                </div>
                <span className="text-[10px] text-tertiary px-1 text-right">
                  {msg.timestamp}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={chatBottomRef} />
      </div>

      {/* Consolidated Action Area */}
      <div className="px-3 py-1.5 border-t border-border-subtle bg-white shrink-0 flex flex-col gap-1.5">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => onApplyPreset('Recommend')}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-0.5 text-[10px] font-bold bg-white hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 text-secondary border border-border-subtle rounded-xl transition-all cursor-pointer shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
            Recommend
          </button>
          <button
            onClick={() => onApplyPreset('Propose')}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-0.5 text-[10px] font-bold bg-white hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 text-secondary border border-border-subtle rounded-xl transition-all cursor-pointer shadow-sm"
          >
            <Coffee className="w-3.5 h-3.5 text-blue-500" />
            Propose
          </button>
          <button
            onClick={() => onApplyPreset('Optimize')}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-0.5 text-[10px] font-bold bg-white hover:bg-primary-50 hover:text-primary hover:border-primary/20 text-secondary border border-border-subtle rounded-xl transition-all cursor-pointer shadow-sm"
          >
            <RotateCcw className="w-3.5 h-3.5 text-primary" />
            Optimize
          </button>
        </div>

        <div className="relative">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask Copilot..."
            rows={2}
            className="w-full pl-3 pr-16 py-2 bg-surface-container-low border border-border-subtle hover:border-primary/30 rounded-xl text-xs outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all resize-none font-sans"
          />
          <div className="absolute right-2 bottom-2.5 flex items-center gap-1">
            <button className="p-1.5 text-secondary hover:text-primary transition-colors cursor-pointer rounded-lg hover:bg-white/60">
              <Mic className="w-4 h-4" />
            </button>
            <button
              onClick={handleSend}
              title={isLoading ? '查詢中…' : inputText.trim() ? '傳送' : '請輸入問題'}
              disabled={isLoading || !inputText.trim()}
              className={`p-1.5 rounded-lg transition-colors ${isLoading || !inputText.trim() ? 'bg-secondary/20 text-secondary cursor-not-allowed' : 'bg-primary text-white cursor-pointer hover:bg-accent-primary-hover'}`}
            >
              {isLoading ? <Coffee className="w-3.5 h-3.5 animate-pulse" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
