import { useEffect, useMemo, useRef, useState } from 'react';
import { useDriveIntegration } from '../../hooks/useDriveIntegration';
import type { DriveFolder } from '../../hooks/useDriveIntegration';
import { detectStaleDocuments } from '../../services/knowledgeService';
import type { KnowledgeDoc } from '../../services/knowledgeService';

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  battlecard:   { bg: '#f3e8ff', color: '#7c3aed', label: 'Battlecard',   icon: '⚔' },
  pricing:      { bg: '#dcfce7', color: '#15803d', label: 'Pricing',      icon: '$' },
  account_plan: { bg: '#dbeafe', color: '#1d4ed8', label: 'Account Plan', icon: '◈' },
  case_study:   { bg: '#ffedd5', color: '#c2410c', label: 'Case Study',   icon: '★' },
  contract:     { bg: '#fee2e2', color: '#b91c1c', label: 'Contract',     icon: '✎' },
  notes:        { bg: '#f1f5f9', color: '#64748b', label: 'Notes',        icon: '≡' },
  other:        { bg: '#f1f5f9', color: '#64748b', label: 'Other',        icon: '◦' },
};

const ALL_CATEGORIES = Object.keys(CATEGORY_META) as DocCategory[];

// ── Icons ─────────────────────────────────────────────────────────────────────

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

// ── Folder setup screen (shown after OAuth or when no folders are configured) ─

interface FolderSetupProps {
  folders: DriveFolder[];
  loading: boolean;
  onSave: (ids: string[], syncNow: boolean) => Promise<void>;
  onSyncAll: () => Promise<void>;
  saving: boolean;
  isFirstTime: boolean;
}

function FolderSetupScreen({ folders, loading, onSave, onSyncAll, saving, isFirstTime }: FolderSetupProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const rootFolder = folders.find((f) => f.isRoot);
  const subFolders = folders.filter((f) => !f.isRoot);
  const filteredSubs = subFolders.filter((f) =>
    !search.trim() || f.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const folderRow = (folder: DriveFolder) => {
    const checked = selected.has(folder.id);
    return (
      <label key={folder.id} style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
        background: checked
          ? (folder.isRoot ? 'rgba(66,133,244,0.08)' : 'var(--bg-blue)')
          : 'transparent',
        border: `1px solid ${checked ? (folder.isRoot ? 'rgba(66,133,244,0.3)' : 'var(--border-blue)') : 'transparent'}`,
        marginBottom: 4, transition: 'background 0.1s',
      }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={() => toggle(folder.id)}
          style={{ accentColor: folder.isRoot ? '#4285F4' : 'var(--dl-teal)', width: 15, height: 15, flexShrink: 0 }}
        />
        <span style={{ fontSize: 14 }}>{folder.isRoot ? '💾' : '📁'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, color: 'var(--text-primary)', fontWeight: checked ? 500 : 400,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {folder.name}
          </div>
          {folder.isRoot && (
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>
              Files stored directly in My Drive (not inside any subfolder)
            </div>
          )}
        </div>
        {checked && <span style={{ fontSize: 11, color: folder.isRoot ? '#4285F4' : 'var(--dl-teal)', fontWeight: 600 }}>✓</span>}
      </label>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '18px 20px 14px',
        borderBottom: '1px solid var(--border)',
      }}>
        <GoogleDriveIcon size={20} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
            {isFirstTime ? 'Choose folders to sync' : 'Manage sync folders'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 1 }}>
            Only files inside selected folders will be indexed. Start narrow — you can add more later.
          </div>
        </div>
      </div>

      {/* Search (subfolders only) */}
      {subFolders.length > 8 && (
        <div style={{ padding: '10px 20px 0' }}>
          <input
            className="kb-search"
            placeholder="Filter folders…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
        </div>
      )}

      {/* Folder list */}
      <div style={{ padding: '10px 20px', maxHeight: 340, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
            Loading your Drive folders…
          </div>
        ) : (
          <>
            {/* Root option pinned at top */}
            {rootFolder && (
              <>
                {folderRow(rootFolder)}
                {subFolders.length > 0 && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    margin: '6px 0',
                  }}>
                    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      Subfolders
                    </span>
                    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  </div>
                )}
              </>
            )}

            {/* Subfolders */}
            {filteredSubs.length === 0 && !rootFolder ? (
              <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
                {search ? 'No folders match.' : 'No subfolders found in your Drive.'}
              </div>
            ) : (
              filteredSubs.map(folderRow)
            )}
          </>
        )}
      </div>

      {/* Actions */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-subtle)',
      }}>
        <button
          type="button"
          onClick={onSyncAll}
          disabled={saving || loading}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-tertiary)', fontSize: 12, padding: 0,
            textDecoration: 'underline',
          }}
        >
          Sync entire Drive instead
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', alignSelf: 'center' }}>
            {selected.size > 0 ? `${selected.size} folder${selected.size > 1 ? 's' : ''} selected` : 'None selected'}
          </span>
          <button
            type="button"
            className="drive-btn primary"
            disabled={selected.size === 0 || saving || loading}
            onClick={() => onSave(Array.from(selected), true)}
          >
            {saving ? 'Saving…' : 'Sync selected'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Folder chip ───────────────────────────────────────────────────────────────

function FolderChip({ name, isRoot, onRemove }: { name: string; isRoot?: boolean; onRemove: () => void }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px 3px 7px',
      background: isRoot ? 'rgba(66,133,244,0.08)' : 'var(--bg-blue)',
      border: `1px solid ${isRoot ? 'rgba(66,133,244,0.3)' : 'var(--border-blue)'}`,
      borderRadius: 20, fontSize: 12, color: isRoot ? '#4285F4' : 'var(--accent-blue)',
    }}>
      <span style={{ fontSize: 11 }}>{isRoot ? '💾' : '📁'}</span>
      <span style={{ fontWeight: 500, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name}
      </span>
      <button
        type="button"
        onClick={onRemove}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: isRoot ? '#4285F4' : 'var(--accent-blue)', opacity: 0.6, fontSize: 11,
          padding: '0 0 0 2px', lineHeight: 1,
        }}
      >✕</button>
    </div>
  );
}

// ── Doc row ───────────────────────────────────────────────────────────────────

function DocRow({ doc, expanded, onToggle, onExclude }: {
  doc: KnowledgeDoc;
  expanded: boolean;
  onToggle: () => void;
  onExclude: () => void;
}) {
  const cat = CATEGORY_META[doc.category] ?? CATEGORY_META.other;
  const isStale = detectStaleDocuments([doc]).length > 0;
  const allEntities = [
    ...(doc.entities?.people ?? []),
    ...(doc.entities?.companies ?? []),
    ...(doc.entities?.products ?? []),
  ].slice(0, 8);

  return (
    <div style={{
      borderBottom: '1px solid var(--border)',
      background: expanded ? 'var(--bg-subtle)' : 'transparent',
      transition: 'background 0.1s',
    }}>
      {/* Main row */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 16px', cursor: 'pointer',
        }}
        onClick={onToggle}
      >
        {/* Category pip */}
        <span style={{
          flexShrink: 0, width: 22, height: 22,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: cat.bg, borderRadius: 4,
          fontSize: 11, color: cat.color, fontWeight: 600,
        }}>
          {cat.icon}
        </span>

        {/* Name */}
        <span style={{
          flex: 1, fontSize: 13, color: 'var(--text-primary)',
          fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {doc.name}
        </span>

        {/* Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {isStale && (
            <span style={{
              fontSize: 10, fontFamily: 'var(--font-mono)', padding: '2px 6px',
              background: '#fef9c3', color: '#854d0e', borderRadius: 4,
              border: '1px solid #fde68a', fontWeight: 600,
            }}>STALE</span>
          )}
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {formatRelativeTime(doc.drive_modified_at)}
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onExclude(); }}
            title="Exclude from knowledge base"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-tertiary)', opacity: 0, fontSize: 12,
              padding: '2px 4px', borderRadius: 4,
              transition: 'opacity 0.15s',
            }}
            className="kb-doc-exclude-btn"
          >✕</button>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', userSelect: 'none' }}>
            {expanded ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 16px 14px 48px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {doc.summary && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              {doc.summary}
            </p>
          )}

          {doc.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {doc.tags.map((t) => (
                <span key={t} style={{
                  fontSize: 11, padding: '2px 7px', borderRadius: 10,
                  background: 'var(--bg-subtle)', border: '1px solid var(--border)',
                  color: 'var(--text-tertiary)',
                }}>{t}</span>
              ))}
            </div>
          )}

          {allEntities.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {doc.entities?.people?.slice(0, 3).map((p) => (
                <span key={p} className="kb-entity-chip people" style={{ fontSize: 11 }}>{p}</span>
              ))}
              {doc.entities?.companies?.slice(0, 3).map((c) => (
                <span key={c} className="kb-entity-chip companies" style={{ fontSize: 11 }}>{c}</span>
              ))}
              {doc.entities?.products?.slice(0, 3).map((p) => (
                <span key={p} className="kb-entity-chip products" style={{ fontSize: 11 }}>{p}</span>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 16 }}>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              Modified {doc.drive_modified_at ? new Date(doc.drive_modified_at).toLocaleDateString() : '—'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              Indexed {new Date(doc.synced_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add-folder dropdown ───────────────────────────────────────────────────────

function AddFolderDropdown({ folders, selectedIds, onAdd, onClose }: {
  folders: DriveFolder[];
  selectedIds: Set<string>;
  onAdd: (id: string, name: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const rootEntry = folders.find((f) => f.isRoot && !selectedIds.has(f.id));
  const available = folders.filter(
    (f) => !f.isRoot && !selectedIds.has(f.id) &&
    (!search.trim() || f.name.toLowerCase().includes(search.toLowerCase()))
  );

  const folderBtn = (f: DriveFolder) => (
    <button
      key={f.id}
      type="button"
      onClick={() => { onAdd(f.id, f.name); onClose(); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        width: '100%', background: 'none', border: 'none',
        padding: '7px 14px', cursor: 'pointer', textAlign: 'left',
        fontSize: 13, color: 'var(--text-primary)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-subtle)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
    >
      <span>{f.isRoot ? '💾' : '📁'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
        {f.isRoot && (
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>Root level files only</div>
        )}
      </div>
    </button>
  );

  return (
    <div ref={ref} style={{
      position: 'absolute', top: '100%', left: 0, zIndex: 100, marginTop: 4,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      width: 270,
    }}>
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
        <input
          autoFocus
          className="kb-search"
          placeholder="Search folders…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }}
        />
      </div>
      <div style={{ maxHeight: 260, overflowY: 'auto', padding: '4px 0' }}>
        {/* My Drive root pinned at top when available */}
        {rootEntry && (
          <>
            {folderBtn(rootEntry)}
            {available.length > 0 && (
              <div style={{ height: 1, background: 'var(--border)', margin: '3px 10px' }} />
            )}
          </>
        )}

        {rootEntry === undefined && available.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '10px 14px' }}>
            {search ? 'No folders match.' : 'All folders already selected.'}
          </div>
        ) : (
          available.map(folderBtn)
        )}
      </div>
    </div>
  );
}

// ── Entity overview ───────────────────────────────────────────────────────────

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
      people: [...people].slice(0, 15),
      companies: [...companies].slice(0, 15),
      products: [...products].slice(0, 15),
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
              {entities.people.map((p) => <span key={p} className="kb-entity-chip products">{p}</span>)}
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
  const {
    integration, documents, loading, syncing, error,
    justConnected, clearJustConnected,
    connect, sync, disconnect,
    fetchFolders, saveFolderSelection, excludeDocument,
  } = useDriveIntegration(groupId);

  // Doc list state
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<DocCategory | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'docs' | 'entities'>('docs');
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());

  // Folder management state
  const [availableFolders, setAvailableFolders] = useState<DriveFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [folderNames, setFolderNames] = useState<Map<string, string>>(new Map());
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(
    new Set(integration?.sync_folder_ids ?? [])
  );
  const [savingFolders, setSavingFolders] = useState(false);
  const [addFolderOpen, setAddFolderOpen] = useState(false);
  const addFolderRef = useRef<HTMLDivElement>(null);

  // Setup mode: just connected via OAuth with no folders configured
  const isSetupMode = justConnected && !(integration?.sync_folder_ids?.length);

  // Sync folder state from integration
  useEffect(() => {
    const ids = integration?.sync_folder_ids ?? [];
    setSelectedFolderIds(new Set(ids));
  }, [integration?.sync_folder_ids?.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load folder names for chips (needed after page reload when folder names aren't stored)
  useEffect(() => {
    if (!integration || availableFolders.length > 0) return;
    const ids = integration.sync_folder_ids;
    if (!ids || ids.length === 0) return;
    // Lazily load folder names for display
    setLoadingFolders(true);
    fetchFolders().then((folders) => {
      setAvailableFolders(folders);
      const map = new Map(folders.map((f) => [f.id, f.name]));
      setFolderNames(map);
      setLoadingFolders(false);
    }).catch(() => setLoadingFolders(false));
  }, [integration?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const openAddFolder = async () => {
    setAddFolderOpen(true);
    if (availableFolders.length === 0) {
      setLoadingFolders(true);
      const folders = await fetchFolders();
      setAvailableFolders(folders);
      const map = new Map(folders.map((f) => [f.id, f.name]));
      setFolderNames(map);
      setLoadingFolders(false);
    }
  };

  const handleAddFolder = async (id: string, name: string) => {
    const next = new Set([...selectedFolderIds, id]);
    setSelectedFolderIds(next);
    setFolderNames((prev) => new Map([...prev, [id, name]]));
    setSavingFolders(true);
    await saveFolderSelection(Array.from(next));
    setSavingFolders(false);
  };

  const handleRemoveFolder = async (id: string) => {
    const next = new Set(selectedFolderIds);
    next.delete(id);
    setSelectedFolderIds(next);
    setSavingFolders(true);
    await saveFolderSelection(Array.from(next));
    setSavingFolders(false);
  };

  const handleSetupSave = async (ids: string[], syncNow: boolean) => {
    setSavingFolders(true);
    const folders = availableFolders.length > 0 ? availableFolders : await fetchFolders();
    const map = new Map(folders.map((f) => [f.id, f.name]));
    setFolderNames(map);
    setAvailableFolders(folders);
    await saveFolderSelection(ids);
    setSelectedFolderIds(new Set(ids));
    setSavingFolders(false);
    clearJustConnected();
    if (syncNow) await sync();
  };

  const handleSyncAll = async () => {
    setSavingFolders(true);
    await saveFolderSelection([]);
    setSelectedFolderIds(new Set());
    setSavingFolders(false);
    clearJustConnected();
    await sync();
  };

  const handleExclude = async (docId: string) => {
    await excludeDocument(docId);
    setExcludedIds((prev) => new Set([...prev, docId]));
  };

  const isConnected = integration !== null && integration.status !== 'disconnected';
  const isSyncing = syncing || integration?.status === 'syncing';
  const visibleDocs = useMemo(() => documents.filter((d) => !excludedIds.has(d.id)), [documents, excludedIds]);
  const staleCount = useMemo(() => detectStaleDocuments(visibleDocs).length, [visibleDocs]);

  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<DocCategory, number>> = {};
    for (const doc of visibleDocs) counts[doc.category] = (counts[doc.category] ?? 0) + 1;
    return counts;
  }, [visibleDocs]);

  const filtered = useMemo(() => {
    let result = visibleDocs;
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
    return [...result].sort((a, b) =>
      new Date(b.drive_modified_at ?? b.synced_at).getTime() -
      new Date(a.drive_modified_at ?? a.synced_at).getTime()
    );
  }, [visibleDocs, activeCategory, search]);

  // ── Not connected ─────────────────────────────────────────────────────────

  if (!isConnected) {
    return (
      <div className="drive-connect-box">
        <div className="drive-connect-title">
          <GoogleDriveIcon size={22} />
          Connect Google Drive
        </div>
        <p className="drive-connect-sub">
          Index your team's Drive folders. Ambi builds a live knowledge map — summaries, tags, and
          entities — so it can surface the right doc the moment it's needed in a meeting.
        </p>
        {error && <p style={{ fontSize: '12px', color: '#b41e1e', margin: 0 }}>{error}</p>}
        <button type="button" className="lp-cta" onClick={connect} disabled={loading}>
          {loading ? 'Connecting…' : 'Connect Google Drive'}
        </button>
      </div>
    );
  }

  // ── Setup mode (just connected, no folders chosen yet) ────────────────────

  if (isSetupMode) {
    return (
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--surface)' }}>
        <FolderSetupScreen
          folders={availableFolders}
          loading={loadingFolders || availableFolders.length === 0}
          onSave={handleSetupSave}
          onSyncAll={handleSyncAll}
          saving={savingFolders}
          isFirstTime={true}
        />
      </div>
    );
  }

  // Initialize setup mode folder loading
  if (isSetupMode && availableFolders.length === 0 && !loadingFolders) {
    setLoadingFolders(true);
    fetchFolders().then((f) => { setAvailableFolders(f); setLoadingFolders(false); });
  }

  // ── Connected + configured ────────────────────────────────────────────────

  return (
    <div className="kb-wrap">

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <GoogleDriveIcon size={18} />
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>Google Drive</span>
          <div className="kb-status-badge">
            <span className={`kb-status-dot ${isSyncing ? 'syncing' : 'connected'}`} />
            <span style={{ fontSize: 12 }}>{isSyncing ? 'Syncing…' : 'Connected'}</span>
          </div>
          {savingFolders && (
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Saving…</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="kb-last-sync">Synced {formatRelativeTime(integration.last_synced_at)}</span>
          <button
            type="button"
            className="drive-btn primary"
            onClick={() => sync()}
            disabled={isSyncing}
          >
            {isSyncing ? 'Syncing…' : 'Sync now'}
          </button>
          <button type="button" className="drive-btn danger" onClick={disconnect}>Disconnect</button>
        </div>
      </div>

      {/* ── Sync scope row (folder chips) ── */}
      <div style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
        padding: '10px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-subtle)',
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
          Scope
        </span>

        {selectedFolderIds.size === 0 ? (
          <span style={{
            fontSize: 12, padding: '3px 10px', borderRadius: 20,
            background: 'var(--bg-subtle)', border: '1px solid var(--border)',
            color: 'var(--text-tertiary)',
          }}>
            Entire Drive
          </span>
        ) : (
          Array.from(selectedFolderIds).map((id) => {
            const folder = availableFolders.find((f) => f.id === id);
            return (
              <FolderChip
                key={id}
                name={folderNames.get(id) ?? id}
                isRoot={folder?.isRoot}
                onRemove={() => handleRemoveFolder(id)}
              />
            );
          })
        )}

        {/* Add folder button */}
        <div style={{ position: 'relative' }} ref={addFolderRef}>
          <button
            type="button"
            onClick={openAddFolder}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'none',
              border: '1px dashed var(--border)',
              borderRadius: 20, padding: '3px 9px',
              fontSize: 12, color: 'var(--text-tertiary)',
              cursor: 'pointer', transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--dl-teal)'; e.currentTarget.style.color = 'var(--dl-teal)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}
          >
            + Add folder
          </button>
          {addFolderOpen && (
            <AddFolderDropdown
              folders={loadingFolders ? [] : availableFolders}
              selectedIds={selectedFolderIds}
              onAdd={handleAddFolder}
              onClose={() => setAddFolderOpen(false)}
            />
          )}
        </div>

        {selectedFolderIds.size > 0 && (
          <button
            type="button"
            onClick={async () => {
              setSavingFolders(true);
              await saveFolderSelection([]);
              setSelectedFolderIds(new Set());
              setSavingFolders(false);
            }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, color: 'var(--text-tertiary)', padding: 0,
              textDecoration: 'underline',
            }}
          >
            Clear (sync all)
          </button>
        )}
      </div>

      {error && (
        <div style={{ fontSize: 12, color: '#b41e1e', padding: '8px 20px', borderBottom: '1px solid var(--border)' }}>
          {error}
        </div>
      )}

      {isSyncing && (
        <div className="kb-sync-bar">
          <span className="kb-sync-spinner">◌</span>
          Building knowledge map — analyzing documents and extracting entities…
        </div>
      )}

      {/* ── Stats bar ── */}
      {visibleDocs.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: '8px 20px', borderBottom: '1px solid var(--border)',
          fontSize: 12, color: 'var(--text-tertiary)',
        }}>
          <span><b style={{ color: 'var(--text-primary)' }}>{visibleDocs.length}</b> docs indexed</span>
          {staleCount > 0 && (
            <span style={{ color: '#854d0e' }}>⚠ {staleCount} stale</span>
          )}
          {excludedIds.size > 0 && (
            <span>{excludedIds.size} excluded</span>
          )}
          <div style={{ flex: 1 }} />
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4 }}>
            {(['docs', 'entities'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                style={{
                  background: activeTab === tab ? 'var(--bg-blue)' : 'none',
                  border: `1px solid ${activeTab === tab ? 'var(--border-blue)' : 'transparent'}`,
                  borderRadius: 6, padding: '3px 10px', cursor: 'pointer',
                  fontSize: 11, color: activeTab === tab ? 'var(--accent-blue)' : 'var(--text-tertiary)',
                  fontWeight: activeTab === tab ? 600 : 400,
                }}
              >
                {tab === 'docs' ? `Documents` : 'Entity Map'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── No docs yet ── */}
      {visibleDocs.length === 0 && !isSyncing && (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 12 }}>
            {selectedFolderIds.size > 0
              ? `No documents indexed yet from ${selectedFolderIds.size === 1 ? 'this folder' : 'these folders'}.`
              : 'No documents indexed yet.'}
          </div>
          <button type="button" className="drive-btn primary" onClick={() => sync()} disabled={isSyncing}>
            Sync now
          </button>
        </div>
      )}

      {/* ── Entity map ── */}
      {activeTab === 'entities' && visibleDocs.length > 0 && (
        <EntityOverview documents={visibleDocs} />
      )}

      {/* ── Doc list ── */}
      {activeTab === 'docs' && visibleDocs.length > 0 && (
        <>
          {/* Toolbar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 16px', borderBottom: '1px solid var(--border)',
          }}>
            <input
              className="kb-search"
              type="text"
              placeholder="Search docs…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1, maxWidth: 280 }}
            />
            {/* Category filters */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setActiveCategory('all')}
                style={{
                  fontSize: 11, padding: '3px 9px', borderRadius: 10,
                  background: activeCategory === 'all' ? 'var(--text-primary)' : 'transparent',
                  color: activeCategory === 'all' ? 'var(--bg)' : 'var(--text-tertiary)',
                  border: `1px solid ${activeCategory === 'all' ? 'var(--text-primary)' : 'var(--border)'}`,
                  cursor: 'pointer',
                }}
              >
                All
              </button>
              {ALL_CATEGORIES.filter((c) => categoryCounts[c]).map((c) => {
                const meta = CATEGORY_META[c];
                const active = activeCategory === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setActiveCategory(c)}
                    style={{
                      fontSize: 11, padding: '3px 9px', borderRadius: 10,
                      background: active ? meta.bg : 'transparent',
                      color: active ? meta.color : 'var(--text-tertiary)',
                      border: `1px solid ${active ? meta.color + '60' : 'var(--border)'}`,
                      cursor: 'pointer',
                    }}
                  >
                    {meta.icon} {meta.label} {categoryCounts[c]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Rows */}
          <div style={{ overflowY: 'auto', maxHeight: 500 }} className="kb-doc-rows">
            {filtered.length === 0 ? (
              <div style={{ padding: '30px 20px', textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)' }}>
                No documents match your search.
              </div>
            ) : (
              filtered.map((doc) => (
                <DocRow
                  key={doc.id}
                  doc={doc}
                  expanded={expandedId === doc.id}
                  onToggle={() => setExpandedId(expandedId === doc.id ? null : doc.id)}
                  onExclude={() => handleExclude(doc.id)}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
