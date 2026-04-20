import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import type { KnowledgeDoc } from '../services/knowledgeService';

export interface DriveFolder {
  id: string;
  name: string;
}

export interface DriveIntegration {
  id: string;
  group_id: string;
  status: 'connected' | 'syncing' | 'error' | 'disconnected';
  last_synced_at: string | null;
  doc_count: number;
  error_message: string | null;
  sync_folder_ids: string[] | null;
}

export interface SyncResult {
  synced: number;
  skipped: number;
  total: number;
}

export function useDriveIntegration(groupId: string) {
  const { session } = useAuth();

  const [integration, setIntegration] = useState<DriveIntegration | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const getAuthHeader = useCallback(async (): Promise<string> => {
    // Prefer the session already in context; fall back to a fresh getSession call.
    if (session?.access_token) {
      return `Bearer ${session.access_token}`;
    }
    const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
    return `Bearer ${data.session?.access_token ?? ''}`;
  }, [session]);

  const loadStatus = useCallback(async () => {
    if (!groupId) return;

    setLoading(true);
    setError(null);

    try {
      const authHeader = await getAuthHeader();

      const response = await fetch(
        `/api/integrations/google-drive/status?groupId=${encodeURIComponent(groupId)}`,
        {
          headers: { Authorization: authHeader },
        }
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Status ${response.status}`);
      }

      const data = await response.json();
      setIntegration(data.integration ?? null);
      setDocuments(data.documents ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load Drive status';
      console.error('useDriveIntegration loadStatus:', err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [groupId, getAuthHeader]);

  const connect = useCallback(async () => {
    const { data, error: userError } = await supabase?.auth.getUser() ?? { data: { user: null }, error: new Error('No supabase') };

    if (userError || !data.user) {
      setError('You must be signed in to connect Google Drive.');
      return;
    }

    const params = new URLSearchParams({
      groupId,
      userId: data.user.id,
    });

    window.location.href = `/api/integrations/google-drive/connect?${params.toString()}`;
  }, [groupId]);

  const sync = useCallback(async (): Promise<SyncResult | null> => {
    setSyncing(true);
    setError(null);

    try {
      const authHeader = await getAuthHeader();

      const response = await fetch('/api/integrations/google-drive/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify({ groupId }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Sync failed with status ${response.status}`);
      }

      const result: SyncResult = await response.json();

      // Refresh status after a successful sync
      await loadStatus();

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      console.error('useDriveIntegration sync:', err);
      setError(message);
      return null;
    } finally {
      setSyncing(false);
    }
  }, [groupId, getAuthHeader, loadStatus]);

  const fetchFolders = useCallback(async (): Promise<DriveFolder[]> => {
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch(
        `/api/integrations/google-drive/folders?groupId=${encodeURIComponent(groupId)}`,
        { headers: { Authorization: authHeader } }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return data.folders ?? [];
    } catch {
      return [];
    }
  }, [groupId, getAuthHeader]);

  const saveFolderSelection = useCallback(async (folderIds: string[]): Promise<void> => {
    if (!supabase) return;
    await supabase
      .from('group_integrations')
      .update({ sync_folder_ids: folderIds.length > 0 ? folderIds : null })
      .eq('group_id', groupId)
      .eq('provider', 'google_drive');
    await loadStatus();
  }, [groupId, loadStatus]);

  const excludeDocument = useCallback(async (docId: string): Promise<void> => {
    if (!supabase) return;
    await supabase
      .from('group_documents')
      .update({ is_active: false })
      .eq('id', docId);
  }, []);

  const disconnect = useCallback(async () => {
    setError(null);

    try {
      if (!supabase) return;
      const { error: deleteError } = await supabase
        .from('group_integrations')
        .delete()
        .eq('group_id', groupId)
        .eq('provider', 'google_drive');

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      await loadStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Disconnect failed';
      console.error('useDriveIntegration disconnect:', err);
      setError(message);
    }
  }, [groupId, loadStatus]);

  // On mount: load status, and auto-sync if returning from OAuth flow
  useEffect(() => {
    if (!groupId) return;

    loadStatus();

    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('drive') === 'connected') {
      // Clean the URL before kicking off the sync so a refresh doesn't re-trigger
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);

      // Sync after a brief delay to let loadStatus settle first
      sync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  return {
    integration,
    documents,
    loading,
    syncing,
    error,
    connect,
    sync,
    disconnect,
    fetchFolders,
    saveFolderSelection,
    excludeDocument,
    reload: loadStatus,
  };
}
