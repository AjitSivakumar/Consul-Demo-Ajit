import { useDriveIntegration } from '../../hooks/useDriveIntegration';
import type { KnowledgeDoc } from '../../services/knowledgeService';
import { detectStaleDocuments } from '../../services/knowledgeService';

interface DriveIntegrationPanelProps {
  groupId: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never synced';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? 's' : ''} ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
}

type DocCategory = KnowledgeDoc['category'];

const CATEGORY_STYLES: Record<DocCategory, { bg: string; color: string; label: string }> = {
  battlecard:   { bg: '#f3e8ff', color: '#7c3aed', label: 'Battlecard' },
  pricing:      { bg: '#dcfce7', color: '#15803d', label: 'Pricing' },
  account_plan: { bg: '#dbeafe', color: '#1d4ed8', label: 'Account Plan' },
  case_study:   { bg: '#ffedd5', color: '#c2410c', label: 'Case Study' },
  contract:     { bg: '#fee2e2', color: '#b91c1c', label: 'Contract' },
  notes:        { bg: '#f1f5f9', color: '#64748b', label: 'Notes' },
  other:        { bg: '#f1f5f9', color: '#64748b', label: 'Other' },
};

// ── Sub-components ───────────────────────────────────────────────────────────

function GoogleDriveIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 87.3 78"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
    </svg>
  );
}

function DocRow({ doc }: { doc: KnowledgeDoc }) {
  const catStyle = CATEGORY_STYLES[doc.category] ?? CATEGORY_STYLES.other;
  const isStale = detectStaleDocuments([doc]).length > 0;
  const visibleTags = doc.tags.slice(0, 3);

  return (
    <div className="drive-doc-row">
      <span
        className="drive-cat-chip"
        style={{ background: catStyle.bg, color: catStyle.color }}
      >
        {catStyle.label}
      </span>

      <div className="drive-doc-info">
        <div className="drive-doc-name" title={doc.name}>{doc.name}</div>
        {doc.summary && (
          <div className="drive-doc-summary" title={doc.summary}>{doc.summary}</div>
        )}
        {visibleTags.length > 0 && (
          <div className="drive-doc-tags">
            {visibleTags.map((tag) => (
              <span key={tag} className="drive-tag">{tag}</span>
            ))}
            {doc.tags.length > 3 && (
              <span className="drive-tag">+{doc.tags.length - 3}</span>
            )}
          </div>
        )}
      </div>

      {isStale && (
        <span className="drive-stale-badge" title="Not updated in over 90 days">
          ⚠ Stale
        </span>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function DriveIntegrationPanel({ groupId }: DriveIntegrationPanelProps) {
  const { integration, documents, loading, syncing, error, connect, sync, disconnect } =
    useDriveIntegration(groupId);

  const isConnected = integration !== null && integration.status !== 'disconnected';
  const isSyncing = syncing || integration?.status === 'syncing';

  // ── Disconnected state ────────────────────────────────────────────────────

  if (!isConnected) {
    return (
      <div className="drive-connect-box">
        <div className="drive-connect-title">
          <GoogleDriveIcon size={22} />
          Connect Google Drive
        </div>
        <p className="drive-connect-sub">
          Index your team's Drive documents for AI-powered insights during meetings.
        </p>
        {error && (
          <p style={{ fontSize: '12px', color: '#b41e1e', margin: 0 }}>{error}</p>
        )}
        <div>
          <button
            type="button"
            className="lp-cta"
            onClick={connect}
            disabled={loading}
          >
            {loading ? 'Connecting…' : 'Connect Google Drive'}
          </button>
        </div>
      </div>
    );
  }

  // ── Connected state ───────────────────────────────────────────────────────

  return (
    <div className="drive-panel">
      {/* Header row */}
      <div className="drive-panel-header">
        <div className="drive-panel-left">
          <GoogleDriveIcon size={20} />
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Google Drive
          </span>
          <div className="drive-status-badge">
            {isSyncing ? (
              <>
                <span className="drive-status-dot syncing" />
                <span style={{ color: '#d97706' }}>Syncing…</span>
              </>
            ) : (
              <>
                <span className="drive-status-dot connected" />
                <span style={{ color: '#15803d' }}>Connected</span>
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="drive-btn primary"
            onClick={() => sync()}
            disabled={isSyncing}
          >
            {isSyncing ? 'Syncing…' : 'Sync now'}
          </button>
          <button
            type="button"
            className="drive-btn danger"
            onClick={disconnect}
            disabled={isSyncing}
          >
            Disconnect
          </button>
        </div>
      </div>

      {/* Last synced */}
      <div className="drive-last-sync">
        Last synced:{' '}
        {integration.last_synced_at
          ? formatRelativeTime(integration.last_synced_at)
          : 'Never synced'}
      </div>

      {/* Sync progress */}
      {isSyncing && (
        <div className="drive-sync-progress">
          <span style={{ marginRight: '8px' }}>◌</span>
          Building knowledge map…
        </div>
      )}

      {/* Error */}
      {error && (
        <p style={{ fontSize: '12px', color: '#b41e1e', margin: '0 0 12px' }}>{error}</p>
      )}

      {/* Document list */}
      {documents.length > 0 ? (
        <>
          <div className="drive-doc-list">
            {documents.map((doc) => (
              <DocRow key={doc.id} doc={doc} />
            ))}
          </div>

          {/* Coverage tip */}
          <div className="drive-tip">
            Tip: Add battlecards, pricing sheets, and account plans to your Drive folder for best
            results.
          </div>
        </>
      ) : (
        <div className="drive-empty">
          No documents indexed yet. Click &ldquo;Sync now&rdquo; to build your knowledge map.
        </div>
      )}
    </div>
  );
}
