import { useEffect, useMemo, useState } from 'react';
import { useDriveIntegration } from '../../hooks/useDriveIntegration';
import type { DriveFolder } from '../../hooks/useDriveIntegration';
import { detectStaleDocuments } from '../../services/knowledgeService';
import type { KnowledgeDoc } from '../../services/knowledgeService';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

type DocCategory = KnowledgeDoc['category'];

const CATEGORY_META: Record<DocCategory, { bg: string; color: string; label: string; icon: string }> = {
  battlecard:   { bg: '#f3e8ff', color: '#7c3aed', label: 'Battlecard',    icon: '⚔' },
  pricing:      { bg: '#dcfce7', color: '#15803d', label: 'Pricing',       icon: '$' },
  account_plan: { bg: '#dbeafe', color: '#1d4ed8', label: 'Account Plan',  icon: '◈' },
  case_study:   { bg: '#ffedd5', color: '#c2410c', label: 'Case Study',    icon: '★' },
  contract:     { bg: '#fee2e2', color: '#b91c1c', label: 'Contract',      icon: '✎' },
  notes:        { bg: '#f1f5f9', color: '#64748b', label: 'Notes',         icon: '≡' },
  other:        { bg: '#f1f5f9', color: '#64748b', label: 'Other',         icon: '◦' },
};

const ALL_CATEGORIES = Object.keys(CATEGORY_META) as DocCategory[];

function GoogleDriveIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" fill="#00ac47"/>
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
    </svg>
  );
}

// ── Doc Card ─────────────────────────────────────────────────────────────────

function DocCard({ doc, expanded, onToggle, onExclude }: { doc: KnowledgeDoc; expanded: boolean; onToggle: () => void; onExclude: () => void }) {
  const cat = CATEGORY_META[doc.category] ?? CATEGORY_META.other;
  const isStale = detectStaleDocuments([doc]).length > 0;
  const allEntities = [
    ...(doc.entities?.people ?? []),
    ...(doc.entities?.companies ?? []),
    ...(doc.entities?.products ?? []),
  ].slice(0, 6);

  return (
    <div className={`kb-card ${expanded ? 'expanded' : ''}`} onClick={onToggle}>
      <div className="kb-card-top">
        <div className="kb-card-left">
          <span className="kb-cat-chip" style={{ background: cat.bg, color: cat.color }}>
            {cat.icon} {cat.label}
          </span>
          <div className="kb-card-name" title={doc.name}>{doc.name}</div>
        </div>
        <div className="kb-card-right">
          {isStale && <span className="kb-stale">⚠ Stale</span>}
          <span className="kb-card-time">{formatRelativeTime(doc.drive_modified_at)}</span>
          <button
            type="button"
            className="kb-exclude-btn"
            title="Exclude from knowledge base"
            onClick={(e) => { e.stopPropagation(); onExclude(); }}
          >✕</button>
          <span className="kb-expand-icon">{expanded ? '−' : '+'}</span>
        </div>
      </div>

      {!expanded && doc.summary && (
        <div className="kb-card-summary-preview">{doc.summary}</div>
      )}

      {expanded && (
        <div className="kb-card-body" onClick={(e) => e.stopPropagation()}>
          {doc.summary && (
            <div className="kb-card-section">
              <div className="kb-card-section-label">Summary</div>
              <p className="kb-card-section-text">{doc.summary}</p>
            </div>
          )}

          {doc.tags.length > 0 && (
            <div className="kb-card-section">
              <div className="kb-card-section-label">Tags</div>
              <div className="kb-tag-row">
                {doc.tags.map((t) => <span key={t} className="kb-tag">{t}</span>)}
              </div>
            </div>
          )}

          {allEntities.length > 0 && (
            <div className="kb-card-section">
              <div className="kb-card-section-label">Key Entities</div>
              <div className="kb-entity-grid">
                {doc.entities?.people?.length > 0 && (
                  <div className="kb-entity-group">
                    <span className="kb-entity-type">People</span>
                    <div className="kb-tag-row">
                      {doc.entities.people.map((p) => <span key={p} className="kb-entity-chip people">{p}</span>)}
                    </div>
                  </div>
                )}
                {doc.entities?.companies?.length > 0 && (
                  <div className="kb-entity-group">
                    <span className="kb-entity-type">Companies</span>
                    <div className="kb-tag-row">
                      {doc.entities.companies.map((c) => <span key={c} className="kb-entity-chip companies">{c}</span>)}
                    </div>
                  </div>
                )}
                {doc.entities?.products?.length > 0 && (
                  <div className="kb-entity-group">
                    <span className="kb-entity-type">Products</span>
                    <div className="kb-tag-row">
                      {doc.entities.products.map((p) => <span key={p} className="kb-entity-chip products">{p}</span>)}
                    </div>
                  </div>
                )}
                {doc.entities?.amounts?.length > 0 && (
                  <div className="kb-entity-group">
                    <span className="kb-entity-type">Amounts</span>
                    <div className="kb-tag-row">
                      {doc.entities.amounts.map((a) => <span key={a} className="kb-entity-chip amounts">{a}</span>)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="kb-card-meta-row">
            <span className="kb-card-meta-item">Last modified: {doc.drive_modified_at ? new Date(doc.drive_modified_at).toLocaleDateString() : '—'}</span>
            <span className="kb-card-meta-item">Indexed: {new Date(doc.synced_at).toLocaleDateString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Entity Overview ───────────────────────────────────────────────────────────

function EntityOverview({ documents }: { documents: KnowledgeDoc[] }) {
  const entities = useMemo(() => {
    const people = new Set<string>();
    const companies = new Set<string>();
    const products = new Set<string>();
    for (const doc of documents) {
      doc.entities?.people?.forEach((p) => people.add(p));
      doc.entities?.companies?.forEach((c) => companies.add(c));
      doc.entities?.products?.forEach((p) => products.add(p));
    }
    return {
      people: [...people].slice(0, 12),
      companies: [...companies].slice(0, 12),
      products: [...products].slice(0, 12),
    };
  }, [documents]);

  if (!entities.people.length && !entities.companies.length && !entities.products.length) return null;

  return (
    <div className="kb-entity-overview">
      <div className="kb-entity-overview-title">Entity Map</div>
      <div className="kb-entity-overview-grid">
        {entities.companies.length > 0 && (
          <div className="kb-entity-col">
            <div className="kb-entity-col-label">Companies</div>
            <div className="kb-tag-row">
              {entities.companies.map((c) => <span key={c} className="kb-entity-chip companies">{c}</span>)}
            </div>
          </div>
        )}
        {entities.people.length > 0 && (
          <div className="kb-entity-col">
            <div className="kb-entity-col-label">People</div>
            <div className="kb-tag-row">
              {entities.people.map((p) => <span key={p} className="kb-entity-chip people">{p}</span>)}
            </div>
          </div>
        )}
        {entities.products.length > 0 && (
          <div className="kb-entity-col">
            <div className="kb-entity-col-label">Products</div>
            <div className="kb-tag-row">
              {entities.products.map((p) => <span key={p} className="kb-entity-chip products">{p}</span>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface DriveIntegrationPanelProps {
  groupId: string;
}

export function DriveIntegrationPanel({ groupId }: DriveIntegrationPanelProps) {
  const { integration, documents, loading, syncing, error, connect, sync, disconnect, fetchFolders, saveFolderSelection, excludeDocument } =
    useDriveIntegration(groupId);

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<DocCategory | 'all'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'modified' | 'category'>('modified');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'docs' | 'entities'>('docs');
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());

  // Folder picker state
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [availableFolders, setAvailableFolders] = useState<DriveFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(
    new Set(integration?.sync_folder_ids ?? [])
  );
  const [savingFolders, setSavingFolders] = useState(false);

  // Sync selectedFolderIds when integration loads
  useEffect(() => {
    setSelectedFolderIds(new Set(integration?.sync_folder_ids ?? []));
  }, [integration?.sync_folder_ids?.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenFolderPicker = async () => {
    setFolderPickerOpen(true);
    setLoadingFolders(true);
    const folders = await fetchFolders();
    setAvailableFolders(folders);
    setLoadingFolders(false);
  };

  const handleSaveFolders = async () => {
    setSavingFolders(true);
    await saveFolderSelection(Array.from(selectedFolderIds));
    setSavingFolders(false);
    setFolderPickerOpen(false);
  };

  const handleExclude = async (docId: string) => {
    await excludeDocument(docId);
    setExcludedIds((prev) => new Set([...prev, docId]));
  };

  const isConnected = integration !== null && integration.status !== 'disconnected';
  const isSyncing = syncing || integration?.status === 'syncing';

  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<DocCategory, number>> = {};
    for (const doc of documents) {
      counts[doc.category] = (counts[doc.category] ?? 0) + 1;
    }
    return counts;
  }, [documents]);

  const staleCount = useMemo(() => detectStaleDocuments(documents).length, [documents]);

  const filtered = useMemo(() => {
    let result = documents.filter((d) => !excludedIds.has(d.id));
    if (activeCategory !== 'all') result = result.filter((d) => d.category === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((d) =>
        d.name.toLowerCase().includes(q) ||
        d.summary?.toLowerCase().includes(q) ||
        d.tags.some((t) => t.includes(q)) ||
        d.entities?.companies?.some((c) => c.toLowerCase().includes(q)) ||
        d.entities?.people?.some((p) => p.toLowerCase().includes(q))
      );
    }
    return [...result].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'category') return a.category.localeCompare(b.category);
      return new Date(b.drive_modified_at ?? b.synced_at).getTime() - new Date(a.drive_modified_at ?? a.synced_at).getTime();
    });
  }, [documents, activeCategory, search, sortBy]);

  // ── Disconnected ─────────────────────────────────────────────────────────

  if (!isConnected) {
    return (
      <div className="drive-connect-box">
        <div className="drive-connect-title">
          <GoogleDriveIcon size={22} />
          Connect Google Drive
        </div>
        <p className="drive-connect-sub">
          Index your team's Drive documents. Ambi builds a live knowledge map — summaries, tags, and
          entities — so it can surface the right information the moment it's needed in a meeting.
        </p>
        {error && <p style={{ fontSize: '12px', color: '#b41e1e', margin: 0 }}>{error}</p>}
        <div>
          <button type="button" className="lp-cta" onClick={connect} disabled={loading}>
            {loading ? 'Connecting…' : 'Connect Google Drive'}
          </button>
        </div>
      </div>
    );
  }

  // ── Connected ─────────────────────────────────────────────────────────────

  return (
    <div className="kb-wrap">
      {/* ── Top bar ── */}
      <div className="kb-topbar">
        <div className="kb-topbar-left">
          <GoogleDriveIcon size={18} />
          <span className="kb-topbar-title">Google Drive</span>
          <div className="kb-status-badge">
            <span className={`kb-status-dot ${isSyncing ? 'syncing' : 'connected'}`} />
            <span>{isSyncing ? 'Syncing…' : 'Connected'}</span>
          </div>
          {staleCount > 0 && (
            <span className="kb-stale-count">{staleCount} stale</span>
          )}
        </div>
        <div className="kb-topbar-right">
          <span className="kb-last-sync">Synced {formatRelativeTime(integration.last_synced_at)}</span>
          <button type="button" className="drive-btn primary" onClick={() => sync()} disabled={isSyncing}>
            {isSyncing ? 'Syncing…' : 'Sync now'}
          </button>
          <button type="button" className="drive-btn danger" onClick={disconnect}>Disconnect</button>
        </div>
      </div>

      {/* Sync scope row */}
      <div className="kb-scope-row">
        <span className="kb-scope-label">
          {selectedFolderIds.size === 0
            ? 'Scope: entire Drive'
            : `Scope: ${selectedFolderIds.size} folder${selectedFolderIds.size > 1 ? 's' : ''}`}
        </span>
        <button type="button" className="drive-btn" onClick={handleOpenFolderPicker}>
          Choose folders
        </button>
      </div>

      {/* Folder picker modal */}
      {folderPickerOpen && (
        <div className="kb-modal-overlay" onClick={() => setFolderPickerOpen(false)}>
          <div className="kb-modal" onClick={(e) => e.stopPropagation()}>
            <div className="kb-modal-header">
              <span className="kb-modal-title">Choose sync folders</span>
              <button type="button" className="kb-modal-close" onClick={() => setFolderPickerOpen(false)}>✕</button>
            </div>
            <p className="kb-modal-desc">Only files inside selected folders will be synced. Leave all unchecked to sync your entire Drive.</p>
            {loadingFolders ? (
              <div className="kb-modal-loading">Loading folders…</div>
            ) : availableFolders.length === 0 ? (
              <div className="kb-modal-loading">No folders found in your Drive.</div>
            ) : (
              <div className="kb-modal-folder-list">
                {availableFolders.map((folder) => (
                  <label key={folder.id} className="kb-folder-row">
                    <input
                      type="checkbox"
                      checked={selectedFolderIds.has(folder.id)}
                      onChange={(e) => {
                        setSelectedFolderIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(folder.id);
                          else next.delete(folder.id);
                          return next;
                        });
                      }}
                    />
                    <span className="kb-folder-name">📁 {folder.name}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="kb-modal-actions">
              {selectedFolderIds.size > 0 && (
                <button type="button" className="drive-btn" onClick={() => setSelectedFolderIds(new Set())}>
                  Clear (sync all)
                </button>
              )}
              <button type="button" className="drive-btn primary" onClick={handleSaveFolders} disabled={savingFolders || loadingFolders}>
                {savingFolders ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <p style={{ fontSize: '12px', color: '#b41e1e', margin: '0 0 12px' }}>{error}</p>}

      {isSyncing && (
        <div className="kb-sync-bar">
          <span className="kb-sync-spinner">◌</span>
          Building knowledge map — analyzing documents and extracting entities…
        </div>
      )}

      {documents.length === 0 && !isSyncing ? (
        <div className="drive-empty">
          No documents indexed yet. Click "Sync now" to build your knowledge map.
        </div>
      ) : documents.length > 0 && (
        <>
          {/* ── Stats row ── */}
          <div className="kb-stats-row">
            {ALL_CATEGORIES.filter((c) => categoryCounts[c]).map((c) => {
              const meta = CATEGORY_META[c];
              return (
                <div key={c} className="kb-stat-chip" style={{ borderColor: meta.color + '40' }}>
                  <span style={{ color: meta.color, fontWeight: 700 }}>{categoryCounts[c]}</span>
                  <span style={{ color: meta.color }}>{meta.label}</span>
                </div>
              );
            })}
          </div>

          {/* ── Tabs ── */}
          <div className="kb-tabs">
            <button type="button" className={`kb-tab ${activeTab === 'docs' ? 'active' : ''}`} onClick={() => setActiveTab('docs')}>
              Documents ({documents.length})
            </button>
            <button type="button" className={`kb-tab ${activeTab === 'entities' ? 'active' : ''}`} onClick={() => setActiveTab('entities')}>
              Entity Map
            </button>
          </div>

          {activeTab === 'entities' ? (
            <EntityOverview documents={documents} />
          ) : (
            <>
              {/* ── Toolbar ── */}
              <div className="kb-toolbar">
                <input
                  className="kb-search"
                  type="text"
                  placeholder="Search by name, summary, tags, company, person…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select className="kb-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
                  <option value="modified">Sort: Recent</option>
                  <option value="name">Sort: Name</option>
                  <option value="category">Sort: Category</option>
                </select>
              </div>

              {/* ── Category filter ── */}
              <div className="kb-filter-row">
                <button
                  type="button"
                  className={`kb-filter-btn ${activeCategory === 'all' ? 'active' : ''}`}
                  onClick={() => setActiveCategory('all')}
                >
                  All ({documents.length})
                </button>
                {ALL_CATEGORIES.filter((c) => categoryCounts[c]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`kb-filter-btn ${activeCategory === c ? 'active' : ''}`}
                    style={activeCategory === c ? { borderColor: CATEGORY_META[c].color, color: CATEGORY_META[c].color } : {}}
                    onClick={() => setActiveCategory(c)}
                  >
                    {CATEGORY_META[c].icon} {CATEGORY_META[c].label} ({categoryCounts[c]})
                  </button>
                ))}
              </div>

              {/* ── Doc list ── */}
              {filtered.length === 0 ? (
                <div className="drive-empty">No documents match your search.</div>
              ) : (
                <div className="kb-doc-list">
                  {filtered.map((doc) => (
                    <DocCard
                      key={doc.id}
                      doc={doc}
                      expanded={expandedId === doc.id}
                      onToggle={() => setExpandedId(expandedId === doc.id ? null : doc.id)}
                      onExclude={() => handleExclude(doc.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
