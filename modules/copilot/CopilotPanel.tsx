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

interface CopilotPanelProps {
  messages: CopilotMessage[];
  deltas: RevisionDelta[];
  onSendMessage: (text: string) => void;
  onApplyPreset: (command: string) => void;
  onRevertDelta: (deltaId: string) => void;
  onApplySug: (msgId: string) => void;
}

export default function CopilotPanel({
  messages,
  deltas,
  onSendMessage,
  onApplyPreset,
  onRevertDelta,
  onApplySug
}: CopilotPanelProps) {
  const [inputText, setInputText] = useState('');
  const [historyHeight, setHistoryHeight] = useState(140);
  const [notesHeight, setNotesHeight] = useState(100);
  const [isHistoryFolded, setIsHistoryFolded] = useState(false);
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
    <aside className="w-full h-full bg-white border border-border-subtle rounded-2xl overflow-hidden shadow-sm flex flex-col">
      {/* Travel Notes Section */}
      <div className="border-b border-border-subtle bg-white flex flex-col shrink-0 relative">
        <div className="flex items-center px-3 py-2 hover:bg-slate-100/40 transition-colors select-none">
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
                    className="absolute top-2 right-2 w-4 h-4 bg-slate-50 text-secondary hover:bg-amber-100 hover:text-warning rounded-full flex items-center justify-center border border-border-subtle opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
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

      {/* Revision Summary Section */}
      <div className="border-b border-border-subtle bg-white flex flex-col shrink-0 relative">
        <div
          onClick={() => setIsHistoryFolded(!isHistoryFolded)}
          className="flex items-center justify-between px-3 py-2 hover:bg-slate-100/40 cursor-pointer select-none transition-colors"
          title={isHistoryFolded ? "Click to expand revisions" : "Click to fold revisions"}
        >
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-on-surface">Revision Summary</h3>
            {deltas.length > 0 && (
              <span className="bg-primary/10 text-primary px-1.5 py-0.25 rounded-md text-[9px] font-bold">
                {deltas.length}
              </span>
            )}
          </div>
          <div className="text-secondary hover:text-primary transition-colors">
            {isHistoryFolded ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </div>
        </div>

        {!isHistoryFolded && (
          <div className="px-3 pb-3 flex flex-col">
            {deltas.length > 0 ? (
              <div
                style={{ height: `${historyHeight}px` }}
                className="space-y-2 overflow-y-auto custom-scrollbar pr-0.5 transition-all duration-75"
              >
                {deltas.map((delta) => (
                  <div key={delta.id} className="text-xs bg-white p-2.5 rounded-xl border border-border-subtle flex items-start gap-2 group hover:border-primary/20 transition-all">
                    <Check className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-on-surface leading-normal text-[11px]">
                        {delta.type === 'move' && 'Moved '}
                        {delta.type === 'add' && 'Added '}
                        {delta.type === 'drop' && 'Dropped '}
                        {delta.type === 'time-shift' && 'Shifted '}
                        <span className="font-bold">{delta.itemTitle}</span>{' '}
                        {delta.from && `from ${delta.from} `}
                        {delta.to && `to ${delta.to}`}
                      </p>
                      {delta.note && (
                        <p className="text-[10px] text-secondary mt-0.5 leading-snug">{delta.note}</p>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRevertDelta(delta.id);
                      }}
                      title="Revert Change"
                      className="p-1 hover:bg-surface-container rounded text-secondary hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-secondary italic">No manual changes registered in this session.</p>
            )}

            {/* Resize Slider for Revisions */}
            <div
              onMouseDown={handleResizeDrag('history')}
              className="h-2 -mb-2 mt-1 flex items-center justify-center cursor-row-resize group select-none shrink-0 transition-all py-1"
              title="Drag border to resize list"
            />
          </div>
        )}
      </div>

      {/* Copilot Header */}
      <div className="px-3 py-2 border-b border-border-subtle flex justify-between items-center bg-white shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-on-surface">Travel Copilot</h3>
        </div>
        <span className="text-[10px] font-bold text-success flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
          Active
        </span>
      </div>

      {/* Copilot Message Timeline */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3 bg-white">
        {messages.map((msg) => {
          const isAI = msg.sender === 'ai';
          return (
            <div key={msg.id} className={`flex ${isAI ? '' : 'justify-end'}`}>
              <div className="flex flex-col gap-1 max-w-[90%]">
                <div
                  className={`p-2.5 text-xs font-medium leading-tight rounded-2xl ${
                    isAI
                      ? 'bg-surface-container-low text-on-surface rounded-tl-none border border-border-subtle/50'
                      : 'bg-primary text-white rounded-tr-none'
                  }`}
                >
                  {msg.text}

                  {/* Suggestion Card inside AI Message */}
                  {isAI && msg.suggestion && (
                    <div className="mt-3 p-3 bg-white border border-border-subtle rounded-xl shadow-sm text-on-surface flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-primary tracking-widest uppercase">
                          {msg.suggestion.type}
                        </span>
                        {msg.suggestion.type === 'Conflict Alert' ? (
                          <AlertCircle className="w-3.5 h-3.5 text-warning" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 text-primary" />
                        )}
                      </div>
                      <p className="text-xs font-bold leading-tight">{msg.suggestion.title}</p>
                      <p className="text-[10px] text-secondary leading-snug">{msg.suggestion.description}</p>
                      {msg.suggestion.timeShift && (
                        <div className="flex items-center gap-2 text-[10px] font-semibold text-secondary">
                          <span className="line-through">{msg.suggestion.timeShift.from}</span>
                          <span>&rarr;</span>
                          <span className="text-primary font-bold">{msg.suggestion.timeShift.to}</span>
                        </div>
                      )}
                      <button
                        onClick={() => onApplySug(msg.id)}
                        className="py-1.5 bg-primary text-white text-[10px] font-bold rounded-lg cursor-pointer hover:bg-accent-primary-hover transition-colors mt-1"
                      >
                        {msg.suggestion.actionLabel || 'Apply'}
                      </button>
                    </div>
                  )}
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
              className="p-1.5 bg-primary text-white rounded-lg cursor-pointer hover:bg-accent-primary-hover transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
