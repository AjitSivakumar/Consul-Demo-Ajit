import { useEffect, useRef, useState } from 'react';
import type { Group } from '../../hooks/useGroups';
import {
  buildPreMeetingBrief,
  fetchDocumentContent,
  loadGroupKnowledge,
} from '../../services/knowledgeService';
import type { KnowledgeDoc } from '../../services/knowledgeService';
import {
  clearDocuments,
  extractTextFromFile,
  uploadDocument,
} from '../../services/documentService';

interface PreMeetingModalProps {
  groups: Group[];
  currentGroupId: string | null;
  currentTitle: string;
  onStart: (title: string, groupId: string | null, context: string) => void;
  onClose: () => void;
}

interface PendingFile {
  id: string;
  name: string;
  content: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  battlecard: '#7c3aed',
  pricing: '#1d4ed8',
  account_plan: '#065f46',
  case_study: '#92400e',
  contract: '#9f1239',
  notes: '#374151',
  other: '#6b7280',
};

export function PreMeetingModal({ groups, currentGroupId, currentTitle, onStart, onClose }: PreMeetingModalProps): React.JSX.Element {
  const [title, setTitle] = useState(currentTitle || '');
  const [groupId, setGroupId] = useState<string | null>(currentGroupId);
  const [context, setContext] = useState('');
  const [brief, setBrief] = useState<string>('');
  const [briefLoading, setBriefLoading] = useState(false);
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDoc[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [kbExpanded, setKbExpanded] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [launching, setLaunching] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const briefTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load group knowledge docs when group changes
  useEffect(() => {
    if (!groupId) { setKnowledgeDocs([]); setBrief(''); setSelectedDocIds(new Set()); return; }
    loadGroupKnowledge(groupId).then(setKnowledgeDocs).catch(() => setKnowledgeDocs([]));
  }, [groupId]);

  // Debounce brief generation when context changes
  useEffect(() => {
    if (briefTimerRef.current) clearTimeout(briefTimerRef.current);
    setBrief('');
    if (!context.trim() || !groupId || knowledgeDocs.length === 0) return;

    briefTimerRef.current = setTimeout(async () => {
      setBriefLoading(true);
      try {
        const result = await buildPreMeetingBrief(groupId, context.trim(), knowledgeDocs);
        setBrief(result);
      } catch {
        setBrief('');
      } finally {
        setBriefLoading(false);
      }
    }, 800);

    return () => { if (briefTimerRef.current) clearTimeout(briefTimerRef.current); };
  }, [context, groupId, knowledgeDocs]);

  const toggleDoc = (id: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const newPending: PendingFile[] = [];
    for (const file of Array.from(files)) {
      const content = await extractTextFromFile(file);
      newPending.push({ id: `upload-${Date.now()}-${Math.random()}`, name: file.name, content });
    }
    setPendingFiles((prev) => [...prev, ...newPending]);
  };

  const removeFile = (id: string) => {
    setPendingFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    void handleFiles(e.dataTransfer.files);
  };

  const handleStart = async () => {
    setLaunching(true);
    try {
      // Clear previous session docs
      clearDocuments();

      // Load selected knowledge base docs (fetch content in parallel)
      if (selectedDocIds.size > 0) {
        const selectedDocs = knowledgeDocs.filter((d) => selectedDocIds.has(d.id));
        await Promise.all(
          selectedDocs.map(async (doc) => {
            const content = await fetchDocumentContent(doc.id);
            if (content) {
              await uploadDocument(doc.name, content, 'text');
            } else if (doc.summary) {
              // Fallback: use summary if full content unavailable
              await uploadDocument(doc.name, doc.summary, 'text');
            }
          })
        );
      }

      // Add uploaded files
      for (const f of pendingFiles) {
        await uploadDocument(f.name, f.content, 'text');
      }

      onStart(title.trim() || 'Untitled Meeting', groupId, context.trim());
    } catch {
      setLaunching(false);
    }
  };

  const visibleDocs = kbExpanded ? knowledgeDocs : knowledgeDocs.slice(0, 5);
  const totalDocCount = selectedDocIds.size + pendingFiles.length;

  return (
    <div className="bot-settings-overlay" onClick={onClose}>
      <div className="bot-settings-modal pre-meeting-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bot-settings-header">
          <span className="bot-settings-title">New Meeting</span>
          <button type="button" className="bot-settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="bot-settings-body pre-meeting-body">
          {/* Meeting name */}
          <div className="bot-settings-field">
            <label className="bot-settings-label">Meeting name</label>
            <input
              className="bot-settings-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Q2 discovery call with Acme"
              autoFocus
            />
          </div>

          {/* Group selector */}
          {groups.length > 0 && (
            <div className="bot-settings-field">
              <label className="bot-settings-label">Group</label>
              <select
                className="bot-settings-select"
                value={groupId ?? ''}
                onChange={(e) => setGroupId(e.target.value || null)}
              >
                <option value="">No group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <span className="bot-settings-hint">Session will be saved to this group's history</span>
            </div>
          )}

          {/* Meeting context */}
          <div className="bot-settings-field">
            <label className="bot-settings-label">Meeting context</label>
            <textarea
              className="bot-settings-input pre-meeting-textarea"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="e.g. Enterprise SaaS deal, prospect is evaluating us vs. Competitor X, key stakeholder is the VP of Sales..."
              rows={3}
            />
            <span className="bot-settings-hint">Ambi uses this to tailor proactive suggestions during the meeting</span>
          </div>

          {/* Pre-meeting brief */}
          {groupId && knowledgeDocs.length > 0 && (context.trim().length > 10) && (
            <div className="pre-meeting-brief">
              <div className="pre-meeting-brief-header">
                <span className="pre-meeting-brief-title">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', marginRight: 5 }}>
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  Knowledge brief
                </span>
                <span className="pre-meeting-brief-source">{knowledgeDocs.length} doc{knowledgeDocs.length !== 1 ? 's' : ''} indexed</span>
              </div>
              {briefLoading ? (
                <p className="pre-meeting-brief-loading">Searching knowledge base…</p>
              ) : brief ? (
                <div className="pre-meeting-brief-content">
                  {brief.split('\n').filter(Boolean).map((line, i) => (
                    <p key={i} className="pre-meeting-brief-line">{line.replace(/^[-•]\s*/, '')}</p>
                  ))}
                </div>
              ) : (
                <p className="pre-meeting-brief-loading">No relevant documents found for this context.</p>
              )}
            </div>
          )}

          {/* ── Document selection ─────────────────────────────────── */}
          <div className="pmd-section">
            <div className="pmd-section-header">
              <span className="pmd-section-title">Context documents</span>
              {totalDocCount > 0 && (
                <span className="pmd-doc-count">{totalDocCount} selected</span>
              )}
            </div>

            {/* Knowledge base docs */}
            {knowledgeDocs.length > 0 && (
              <div className="pmd-kb-block">
                <div className="pmd-block-label">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                  From knowledge base
                  <span className="pmd-block-count">{knowledgeDocs.length} available</span>
                </div>

                <div className="pmd-doc-list">
                  {visibleDocs.map((doc) => {
                    const checked = selectedDocIds.has(doc.id);
                    return (
                      <label key={doc.id} className={`pmd-doc-row${checked ? ' selected' : ''}`}>
                        <input
                          type="checkbox"
                          className="pmd-checkbox"
                          checked={checked}
                          onChange={() => toggleDoc(doc.id)}
                        />
                        <div className="pmd-doc-info">
                          <span className="pmd-doc-name">{doc.name}</span>
                          <span
                            className="pmd-doc-category"
                            style={{ color: CATEGORY_COLORS[doc.category] ?? '#6b7280' }}
                          >
                            {doc.category.replace('_', ' ')}
                          </span>
                        </div>
                        {doc.summary && (
                          <span className="pmd-doc-summary">{doc.summary.slice(0, 80)}{doc.summary.length > 80 ? '…' : ''}</span>
                        )}
                      </label>
                    );
                  })}
                </div>

                {knowledgeDocs.length > 5 && (
                  <button
                    type="button"
                    className="pmd-show-more"
                    onClick={() => setKbExpanded((v) => !v)}
                  >
                    {kbExpanded ? `Show fewer` : `Show ${knowledgeDocs.length - 5} more`}
                  </button>
                )}
              </div>
            )}

            {/* File upload */}
            <div className="pmd-upload-block">
              <div className="pmd-block-label">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                Upload files
              </div>

              <div
                className={`pmd-dropzone${dragOver ? ' drag-over' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span>Drop files or <span style={{ color: '#7c3aed' }}>browse</span></span>
                <span className="pmd-dropzone-hint">TXT, MD, JSON, CSV, PDF</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.json,.csv,.pdf"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => void handleFiles(e.target.files)}
                />
              </div>

              {pendingFiles.length > 0 && (
                <div className="pmd-file-list">
                  {pendingFiles.map((f) => (
                    <div key={f.id} className="pmd-file-row">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.6 }}>
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                      <span className="pmd-file-name">{f.name}</span>
                      <button
                        type="button"
                        className="pmd-file-remove"
                        onClick={() => removeFile(f.id)}
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bot-settings-footer">
          <button type="button" className="bot-settings-btn cancel" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="bot-settings-btn save"
            onClick={() => void handleStart()}
            disabled={launching}
          >
            {launching ? 'Loading…' : 'Launch meeting →'}
          </button>
        </div>
      </div>
    </div>
  );
}
