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
type SortKey = 'modified_desc' | 'modified_asc' | 'name_asc' | 'category';

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

// ── Folder setup screen ───────────────────────────────────────────────────────

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

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const folderRow = (folder: DriveFolder) => {
    const checked = selected.has(folder.id);
    return (
      <label key={folder.id} style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
        background: checked ? (folder.isRoot ? 'rgba(66,133,244,0.08)' : 'var(--bg-blue)') : 'transparent',
        border: `1px solid ${checked ? (folder.isRoot ? 'rgba(66,133,244,0.3)' : 'var(--border-blue)') : 'transparent'}`,
        marginBottom: 4, transition: 'background 0.1s',
      }}>
        <input type="checkbox" checked={checked} onChange={() => toggle(folder.id)}
          style={{ accentColor: folder.isRoot ? '#4285F4' : 'var(--dl-teal)', width: 15, height: 15, flexShrink: 0 }} />
        <span style={{ fontSize: 14 }}>{folder.isRoot ? '💾' : '📁'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: checked ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {folder.name}
          </div>
          {folder.isRoot && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>Files stored directly in My Drive (not inside any subfolder)</div>}
        </div>
        {checked && <span style={{ fontSize: 11, color: folder.isRoot ? '#4285F4' : 'var(--dl-teal)', fontWeight: 600 }}>✓</span>}
      </label>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 20px 14px', borderBottom: '1px solid var(--border)' }}>
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
      {subFolders.length > 8 && (
        <div style={{ padding: '10px 20px 0' }}>
          <input className="kb-search" placeholder="Filter folders…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
        </div>
      )}
      <div style={{ padding: '10px 20px', maxHeight: 340, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Loading your Drive folders…</div>
        ) : (
          <>
            {rootFolder && (
              <>
                {folderRow(rootFolder)}
                {subFolders.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0' }}>
                    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Subfolders</span>
                    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  </div>
                )}
              </>
            )}
            {filteredSubs.length === 0 && !rootFolder ? (
              <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>{search ? 'No folders match.' : 'No subfolders found.'}</div>
            ) : filteredSubs.map(folderRow)}
          </>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
        <button type="button" onClick={onSyncAll} disabled={saving || loading} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 12, padding: 0, textDecoration: 'underline' }}>
          Sync entire Drive instead
        </button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{selected.size > 0 ? `${selected.size} selected` : 'None selected'}</span>
          <button type="button" className="drive-btn primary" disabled={selected.size === 0 || saving || loading} onClick={() => onSave(Array.from(selected), true)}>
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
      <span style={{ fontWeight: 500, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      <button type="button" onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: isRoot ? '#4285F4' : 'var(--accent-blue)', opacity: 0.6, fontSize: 11, padding: '0 0 0 2px', lineHeight: 1 }}>✕</button>
    </div>
  );
}

// ── Add-folder dropdown ───────────────────────────────────────────────────────

function AddFolderDropdown({ folders, selectedIds, onAdd, onClose, loading = false }: {
  folders: DriveFolder[]; selectedIds: Set<string>; onAdd: (id: string, name: string) => void; onClose: () => void; loading?: boolean;
}) {
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const rootEntry = folders.find((f) => f.isRoot && !selectedIds.has(f.id));
  const available = folders.filter((f) => !f.isRoot && !selectedIds.has(f.id) && (!search.trim() || f.name.toLowerCase().includes(search.toLowerCase())));

  const folderBtn = (f: DriveFolder) => (
    <button key={f.id} type="button" onClick={() => { onAdd(f.id, f.name); onClose(); }}
      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', padding: '7px 14px', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: 'var(--text-primary)' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-subtle)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
      <span>{f.isRoot ? '💾' : '📁'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
        {f.isRoot && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>Root level files only</div>}
      </div>
    </button>
  );

  return (
    <div ref={ref} style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, marginTop: 4, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', width: 270 }}>
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
        <input autoFocus className="kb-search" placeholder="Search folders…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} />
      </div>
      <div style={{ maxHeight: 260, overflowY: 'auto', padding: '4px 0' }}>
        {loading ? (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '12px 14px' }}>Loading folders…</div>
        ) : (
          <>
            {rootEntry && (<>{folderBtn(rootEntry)}{available.length > 0 && <div style={{ height: 1, background: 'var(--border)', margin: '3px 10px' }} />}</>)}
            {rootEntry === undefined && available.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '10px 14px' }}>{search ? 'No folders match.' : 'All folders already selected.'}</div>
            ) : available.map(folderBtn)}
          </>
        )}
      </div>
    </div>
  );
}

// ── Doc row (table style with checkbox) ──────────────────────────────────────

function DocRow({ doc, selected, expanded, onSelect, onToggle, onExclude, onDelete }: {
  doc: KnowledgeDoc; selected: boolean; expanded: boolean;
  onSelect: () => void; onToggle: () => void;
  onExclude: () => void; onDelete: () => void;
}) {
  const cat = CATEGORY_META[doc.category] ?? CATEGORY_META.other;
  const isStale = detectStaleDocuments([doc]).length > 0;

  return (
    <div style={{ borderBottom: '1px solid var(--border)', background: selected ? 'rgba(168,85,247,0.04)' : expanded ? 'var(--bg-subtle)' : 'transparent', transition: 'background 0.1s' }}>
      <div className="kb-doc-row" onClick={onToggle}>
        {/* Checkbox */}
        <div onClick={(e) => { e.stopPropagation(); onSelect(); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', cursor: 'pointer' }}>
          <div className={`db-checkbox ${selected ? 'db-checkbox--checked' : ''}`} />
        </div>

        {/* Category icon */}
        <span style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: cat.bg, borderRadius: 5, fontSize: 11, color: cat.color, fontWeight: 600, flexShrink: 0 }}>
          {cat.icon}
        </span>

        {/* Name */}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {doc.name}
          </div>
          {doc.summary && !expanded && (
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
              {doc.summary}
            </div>
          )}
        </div>

        {/* Category label */}
        <span style={{ fontSize: 11, color: cat.color, background: cat.bg, padding: '2px 7px', borderRadius: 8, whiteSpace: 'nowrap', fontWeight: 500, alignSelf: 'center' }}>
          {cat.label}
        </span>

        {/* Modified */}
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', alignSelf: 'center' }}>
          {doc.drive_modified_at ? formatRelativeTime(doc.drive_modified_at) : '—'}
        </span>

        {/* Status */}
        <div style={{ display: 'flex', gap: 4, alignSelf: 'center' }}>
          {isStale && <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', padding: '2px 5px', background: '#fef9c3', color: '#854d0e', borderRadius: 4, border: '1px solid #fde68a', fontWeight: 700 }}>STALE</span>}
        </div>

        {/* Actions */}
        <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onExclude} title="Exclude" className="kb-row-action-btn">
            Hide
          </button>
          <button type="button" onClick={onDelete} title="Delete from knowledge base" className="kb-row-action-btn kb-row-action-btn--danger">
            Del
          </button>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 2 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 16px 16px 88px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {doc.summary && <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{doc.summary}</p>}
          {doc.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {doc.tags.map((t) => <span key={t} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>{t}</span>)}
            </div>
          )}
          {(doc.entities?.people?.length || doc.entities?.companies?.length || doc.entities?.products?.length) ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {doc.entities?.people?.slice(0, 4).map((p) => <span key={p} className="kb-entity-chip people" style={{ fontSize: 11 }}>{p}</span>)}
              {doc.entities?.companies?.slice(0, 4).map((c) => <span key={c} className="kb-entity-chip companies" style={{ fontSize: 11 }}>{c}</span>)}
              {doc.entities?.products?.slice(0, 3).map((p) => <span key={p} className="kb-entity-chip products" style={{ fontSize: 11 }}>{p}</span>)}
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 20, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Modified {doc.drive_modified_at ? new Date(doc.drive_modified_at).toLocaleDateString() : '—'}</span>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Indexed {new Date(doc.synced_at).toLocaleDateString()}</span>
            <div style={{ flex: 1 }} />
            <button type="button" onClick={onDelete} style={{ fontSize: 11, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
              Remove from knowledge base
            </button>
          </div>
        </div>
      )}
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
    return { people: [...people].slice(0, 20), companies: [...companies].slice(0, 20), products: [...products].slice(0, 20) };
  }, [documents]);

  if (!entities.people.length && !entities.companies.length && !entities.products.length) return null;

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {entities.companies.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-tertiary)', marginBottom: 8, fontFamily: 'var(--font-mono)' }}>Companies</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {entities.companies.map((c) => <span key={c} className="kb-entity-chip companies" style={{ fontSize: 11 }}>{c}</span>)}
          </div>
        </div>
      )}
      {entities.people.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-tertiary)', marginBottom: 8, fontFamily: 'var(--font-mono)' }}>People</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {entities.people.map((p) => <span key={p} className="kb-entity-chip people" style={{ fontSize: 11 }}>{p}</span>)}
          </div>
        </div>
      )}
      {entities.products.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-tertiary)', marginBottom: 8, fontFamily: 'var(--font-mono)' }}>Products</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {entities.products.map((p) => <span key={p} className="kb-entity-chip products" style={{ fontSize: 11 }}>{p}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface DriveIntegrationPanelProps { groupId: string; }

export function DriveIntegrationPanel({ groupId }: DriveIntegrationPanelProps) {
  const {
    integration, documents, loading, syncing, error,
    justConnected, clearJustConnected,
    connect, sync, disconnect,
    fetchFolders, saveFolderSelection,
    excludeDocument, deleteDocuments, clearDocuments,
  } = useDriveIntegration(groupId);

  // Doc list state
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<DocCategory | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortKey>('modified_desc');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'docs' | 'entities'>('docs');
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());

  // Confirm dialogs
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);

  // Folder management
  const [availableFolders, setAvailableFolders] = useState<DriveFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [folderNames, setFolderNames] = useState<Map<string, string>>(new Map());
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set(integration?.sync_folder_ids ?? []));
  const [savingFolders, setSavingFolders] = useState(false);
  const [addFolderOpen, setAddFolderOpen] = useState(false);
  const addFolderRef = useRef<HTMLDivElement>(null);

  const isSetupMode = justConnected && !(integration?.sync_folder_ids?.length);

  useEffect(() => {
    setSelectedFolderIds(new Set(integration?.sync_folder_ids ?? []));
  }, [integration?.sync_folder_ids?.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fetch folders when entering setup mode (just connected, no scope set yet)
  useEffect(() => {
    if (!isSetupMode || availableFolders.length > 0 || loadingFolders) return;
    setLoadingFolders(true);
    fetchFolders()
      .then((folders) => {
        setAvailableFolders(folders);
        setFolderNames(new Map(folders.map((f) => [f.id, f.name])));
      })
      .finally(() => setLoadingFolders(false));
  }, [isSetupMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lazy-load folder names for chips when already connected with a scope
  useEffect(() => {
    if (!integration || availableFolders.length > 0) return;
    const ids = integration.sync_folder_ids;
    if (!ids?.length) return;
    fetchFolders().then((folders) => {
      setAvailableFolders(folders);
      setFolderNames(new Map(folders.map((f) => [f.id, f.name])));
    }).catch(() => {});
  }, [integration?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const openAddFolder = async () => {
    setAddFolderOpen(true);
    if (availableFolders.length === 0) {
      setLoadingFolders(true);
      const folders = await fetchFolders();
      setAvailableFolders(folders);
      setFolderNames(new Map(folders.map((f) => [f.id, f.name])));
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
    setFolderNames(new Map(folders.map((f) => [f.id, f.name])));
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
    setSelectedDocIds((prev) => { const n = new Set(prev); n.delete(docId); return n; });
  };

  const handleDeleteDoc = async (docId: string) => {
    await deleteDocuments([docId]);
    setExcludedIds((prev) => new Set([...prev, docId]));
    setSelectedDocIds((prev) => { const n = new Set(prev); n.delete(docId); return n; });
  };

  const handleBulkExclude = async () => {
    setBulkWorking(true);
    await Promise.all([...selectedDocIds].map((id) => excludeDocument(id)));
    setExcludedIds((prev) => new Set([...prev, ...selectedDocIds]));
    setSelectedDocIds(new Set());
    setBulkWorking(false);
  };

  const handleBulkDelete = async () => {
    setBulkWorking(true);
    await deleteDocuments([...selectedDocIds]);
    setExcludedIds((prev) => new Set([...prev, ...selectedDocIds]));
    setSelectedDocIds(new Set());
    setConfirmBulkDelete(false);
    setBulkWorking(false);
  };

  const handleClearAll = async () => {
    setBulkWorking(true);
    await clearDocuments();
    setExcludedIds(new Set());
    setSelectedDocIds(new Set());
    setConfirmClearAll(false);
    setBulkWorking(false);
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
        d.name.toLowerCase().includes(q) || d.summary?.toLowerCase().includes(q) ||
        d.tags.some((t) => t.includes(q)) ||
        d.entities?.companies?.some((c) => c.toLowerCase().includes(q)) ||
        d.entities?.people?.some((p) => p.toLowerCase().includes(q))
      );
    }
    return [...result].sort((a, b) => {
      if (sortBy === 'modified_desc') return new Date(b.drive_modified_at ?? b.synced_at).getTime() - new Date(a.drive_modified_at ?? a.synced_at).getTime();
      if (sortBy === 'modified_asc') return new Date(a.drive_modified_at ?? a.synced_at).getTime() - new Date(b.drive_modified_at ?? b.synced_at).getTime();
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
      if (sortBy === 'category') return a.category.localeCompare(b.category);
      return 0;
    });
  }, [visibleDocs, activeCategory, search, sortBy]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((d) => selectedDocIds.has(d.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedDocIds((prev) => { const n = new Set(prev); filtered.forEach((d) => n.delete(d.id)); return n; });
    } else {
      setSelectedDocIds((prev) => new Set([...prev, ...filtered.map((d) => d.id)]));
    }
  };

  // ── Not connected ─────────────────────────────────────────────────────────

  if (!isConnected) {
    return (
      <div className="drive-connect-box">
        <div className="drive-connect-title"><GoogleDriveIcon size={22} />Connect Google Drive</div>
        <p className="drive-connect-sub">
          Index your team's Drive folders. Ambi builds a live knowledge map — summaries, tags, and entities — so it can surface the right doc in a meeting.
        </p>
        {error && <p style={{ fontSize: 12, color: '#b41e1e', margin: 0 }}>{error}</p>}
        <button type="button" className="lp-cta" onClick={connect} disabled={loading}>
          {loading ? 'Connecting…' : 'Connect Google Drive'}
        </button>
      </div>
    );
  }

  // ── Setup mode ────────────────────────────────────────────────────────────

  if (isSetupMode) {
    return (
      <div style={{ overflow: 'hidden' }}>
        <FolderSetupScreen
          folders={availableFolders}
          loading={loadingFolders}
          onSave={handleSetupSave}
          onSyncAll={handleSyncAll}
          saving={savingFolders}
          isFirstTime={true}
        />
      </div>
    );
  }

  // ── Connected grid view ───────────────────────────────────────────────────

  return (
    <div className="kb-grid-panel">

      {/* ── Top row: 3 cards ── */}
      <div className="kb-top-row">

        {/* Connection card */}
        <div className="kb-mini-card">
          <div className="kb-mini-hd">
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <GoogleDriveIcon size={15} />
              <span className="kb-mini-label">Connection</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span className={`kb-status-dot ${isSyncing ? 'syncing' : 'connected'}`} />
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{isSyncing ? 'Syncing…' : 'Connected'}</span>
            </div>
          </div>
          <div className="kb-mini-body">
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Last synced</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginTop: 2 }}>
                {formatRelativeTime(integration.last_synced_at)}
              </div>
            </div>
            {error && <div style={{ fontSize: 11, color: 'var(--danger)', background: 'rgba(239,68,68,0.06)', padding: '6px 8px', borderRadius: 4 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="drive-btn primary" onClick={() => sync()} disabled={isSyncing} style={{ flex: 1 }}>
                {isSyncing ? 'Syncing…' : '↻ Sync now'}
              </button>
              <button type="button" className="drive-btn danger" onClick={disconnect} style={{ flexShrink: 0 }}>
                Disconnect
              </button>
            </div>
          </div>
        </div>

        {/* Scope card */}
        <div className="kb-mini-card">
          <div className="kb-mini-hd">
            <span className="kb-mini-label">Sync Scope</span>
            {savingFolders && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Saving…</span>}
          </div>
          <div className="kb-mini-body">
            {/* Scope description */}
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {selectedFolderIds.size === 0
                ? 'Syncing your entire Drive'
                : `Syncing ${selectedFolderIds.size} folder${selectedFolderIds.size > 1 ? 's' : ''}`}
            </div>

            {/* Folder chips */}
            {selectedFolderIds.size > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {Array.from(selectedFolderIds).map((id) => {
                  const folder = availableFolders.find((f) => f.id === id);
                  return (
                    <FolderChip key={id} name={folderNames.get(id) ?? id} isRoot={folder?.isRoot} onRemove={() => handleRemoveFolder(id)} />
                  );
                })}
              </div>
            )}

            {/* Add folder + clear */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ position: 'relative' }} ref={addFolderRef}>
                <button type="button" onClick={openAddFolder} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: '1px dashed var(--border)', borderRadius: 20, padding: '3px 9px', fontSize: 12, color: 'var(--text-tertiary)', cursor: 'pointer', transition: 'border-color 0.15s, color 0.15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--dl-teal)'; e.currentTarget.style.color = 'var(--dl-teal)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}>
                  + Add folder
                </button>
                {addFolderOpen && (
                  <AddFolderDropdown
                    folders={availableFolders}
                    loading={loadingFolders}
                    selectedIds={selectedFolderIds}
                    onAdd={handleAddFolder}
                    onClose={() => setAddFolderOpen(false)}
                  />
                )}
              </div>
              {selectedFolderIds.size > 0 && (
                <button type="button" onClick={async () => { setSavingFolders(true); await saveFolderSelection([]); setSelectedFolderIds(new Set()); setSavingFolders(false); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-tertiary)', padding: 0, textDecoration: 'underline' }}>
                  Clear (sync all)
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Overview card */}
        <div className="kb-mini-card">
          <div className="kb-mini-hd">
            <span className="kb-mini-label">Overview</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={() => setActiveTab('docs')} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: activeTab === 'docs' ? 'var(--text-primary)' : 'none', color: activeTab === 'docs' ? '#fff' : 'var(--text-tertiary)', border: `1px solid ${activeTab === 'docs' ? 'var(--text-primary)' : 'var(--border)'}`, cursor: 'pointer' }}>Docs</button>
              <button type="button" onClick={() => setActiveTab('entities')} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: activeTab === 'entities' ? 'var(--text-primary)' : 'none', color: activeTab === 'entities' ? '#fff' : 'var(--text-tertiary)', border: `1px solid ${activeTab === 'entities' ? 'var(--text-primary)' : 'var(--border)'}`, cursor: 'pointer' }}>Entities</button>
            </div>
          </div>
          <div className="kb-mini-body">
            {/* Big stat */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{visibleDocs.length}</span>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>docs indexed</span>
            </div>
            {/* Sub-stats */}
            <div style={{ display: 'flex', gap: 12 }}>
              {staleCount > 0 && <span style={{ fontSize: 12, color: '#d97706' }}>⚠ {staleCount} stale</span>}
              {excludedIds.size > 0 && <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{excludedIds.size} hidden</span>}
              {visibleDocs.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Sync to index documents</span>}
            </div>
            {/* Category breakdown */}
            {visibleDocs.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {ALL_CATEGORIES.filter((c) => categoryCounts[c]).slice(0, 4).map((c) => {
                  const meta = CATEGORY_META[c];
                  const count = categoryCounts[c] ?? 0;
                  const pct = Math.round((count / visibleDocs.length) * 100);
                  return (
                    <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, color: meta.color, width: 70, flexShrink: 0 }}>{meta.label}</span>
                      <div style={{ flex: 1, height: 4, background: 'var(--bg-subtle)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: meta.color, borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)', width: 20, textAlign: 'right' }}>{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Clear all */}
            {visibleDocs.length > 0 && (
              confirmClearAll ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Clear all {visibleDocs.length} docs?</span>
                  <button type="button" onClick={handleClearAll} disabled={bulkWorking} style={{ fontSize: 11, color: '#fff', background: 'var(--danger)', border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}>
                    {bulkWorking ? '…' : 'Yes, clear'}
                  </button>
                  <button type="button" onClick={() => setConfirmClearAll(false)} style={{ fontSize: 11, background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}>Cancel</button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmClearAll(true)} style={{ fontSize: 11, color: 'var(--danger)', background: 'none', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', alignSelf: 'flex-start', transition: 'background 0.12s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.06)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
                  Clear all documents
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* Sync progress bar */}
      {isSyncing && (
        <div className="kb-sync-bar" style={{ margin: 0, borderRadius: 0 }}>
          <span className="kb-sync-spinner">◌</span>
          Building knowledge map — analyzing documents and extracting entities…
        </div>
      )}

      {/* ── Documents / Entity map ── */}
      {activeTab === 'entities' ? (
        <div className="kb-mini-card" style={{ borderRadius: 8 }}>
          <div className="kb-mini-hd">
            <span className="kb-mini-label">Entity Map</span>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{visibleDocs.length} docs</span>
          </div>
          <EntityOverview documents={visibleDocs} />
        </div>
      ) : (
        <div className="kb-docs-card">

          {/* Toolbar */}
          <div className="kb-docs-toolbar">
            {/* Select-all checkbox */}
            <div onClick={toggleSelectAll} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <div className={`db-checkbox ${allFilteredSelected && filtered.length > 0 ? 'db-checkbox--checked' : ''}`} />
            </div>

            <input
              className="kb-search"
              type="text"
              placeholder="Search docs…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1, maxWidth: 240 }}
            />

            {/* Category filters */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
              <button type="button" onClick={() => setActiveCategory('all')} style={{ fontSize: 10, padding: '3px 9px', borderRadius: 10, background: activeCategory === 'all' ? 'var(--text-primary)' : 'transparent', color: activeCategory === 'all' ? '#fff' : 'var(--text-tertiary)', border: `1px solid ${activeCategory === 'all' ? 'var(--text-primary)' : 'var(--border)'}`, cursor: 'pointer' }}>All</button>
              {ALL_CATEGORIES.filter((c) => categoryCounts[c]).map((c) => {
                const meta = CATEGORY_META[c];
                const active = activeCategory === c;
                return (
                  <button key={c} type="button" onClick={() => setActiveCategory(c)} style={{ fontSize: 10, padding: '3px 9px', borderRadius: 10, background: active ? meta.bg : 'transparent', color: active ? meta.color : 'var(--text-tertiary)', border: `1px solid ${active ? meta.color + '60' : 'var(--border)'}`, cursor: 'pointer' }}>
                    {meta.icon} {meta.label}
                  </button>
                );
              })}
            </div>

            {/* Sort */}
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)} className="kb-sort" style={{ flexShrink: 0 }}>
              <option value="modified_desc">Newest first</option>
              <option value="modified_asc">Oldest first</option>
              <option value="name_asc">Name A–Z</option>
              <option value="category">By category</option>
            </select>
          </div>

          {/* Bulk action bar */}
          {selectedDocIds.size > 0 && (
            <div className="kb-bulk-bar">
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{selectedDocIds.size} selected</span>
              <button type="button" onClick={handleBulkExclude} disabled={bulkWorking} className="kb-bulk-btn">
                {bulkWorking ? '…' : 'Hide selected'}
              </button>
              {confirmBulkDelete ? (
                <>
                  <span style={{ fontSize: 11, color: 'var(--danger)' }}>Delete {selectedDocIds.size} docs?</span>
                  <button type="button" onClick={handleBulkDelete} disabled={bulkWorking} className="kb-bulk-btn kb-bulk-btn--danger">
                    {bulkWorking ? '…' : 'Confirm delete'}
                  </button>
                  <button type="button" onClick={() => setConfirmBulkDelete(false)} className="kb-bulk-btn">Cancel</button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmBulkDelete(true)} className="kb-bulk-btn kb-bulk-btn--danger">
                  Delete selected
                </button>
              )}
              <button type="button" onClick={() => setSelectedDocIds(new Set())} className="kb-bulk-btn" style={{ marginLeft: 'auto' }}>
                Clear selection
              </button>
            </div>
          )}

          {/* Column headers */}
          {filtered.length > 0 && (
            <div className="kb-doc-thead">
              <div />
              <div />
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)' }}>Document</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)' }}>Category</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)' }}>Modified</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)' }}>Status</div>
              <div />
            </div>
          )}

          {/* Empty state */}
          {visibleDocs.length === 0 && !isSyncing && (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 12 }}>
                {selectedFolderIds.size > 0
                  ? `No documents indexed from ${selectedFolderIds.size === 1 ? 'this folder' : 'these folders'} yet.`
                  : 'No documents indexed yet.'}
              </div>
              <button type="button" className="drive-btn primary" onClick={() => sync()} disabled={isSyncing}>Sync now</button>
            </div>
          )}

          {/* No results */}
          {visibleDocs.length > 0 && filtered.length === 0 && (
            <div style={{ padding: '30px 20px', textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)' }}>
              No documents match your search or filter.
            </div>
          )}

          {/* Doc rows */}
          <div className="kb-doc-rows">
            {filtered.map((doc) => (
              <DocRow
                key={doc.id}
                doc={doc}
                selected={selectedDocIds.has(doc.id)}
                expanded={expandedId === doc.id}
                onSelect={() => setSelectedDocIds((prev) => { const n = new Set(prev); if (n.has(doc.id)) n.delete(doc.id); else n.add(doc.id); return n; })}
                onToggle={() => setExpandedId(expandedId === doc.id ? null : doc.id)}
                onExclude={() => handleExclude(doc.id)}
                onDelete={() => handleDeleteDoc(doc.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
