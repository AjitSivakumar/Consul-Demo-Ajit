import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export interface Group {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

export interface GroupMember {
  user_id: string;
  role: string;
  added_at: string;
  profiles: { email: string; display_name: string | null; avatar_url: string | null };
}

export interface MeetingSession {
  id: string;
  group_id: string;
  title: string | null;
  started_at: string;
  ended_at: string | null;
  created_by: string;
  state_snapshot: Record<string, unknown> | null;
}

export interface RecentSession extends MeetingSession {
  group_name: string;
  duration_min: number | null;
}

export function useGroups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGroups = useCallback(async () => {
    if (!user || !supabase) return;
    const { data } = await supabase
      .from('group_members')
      .select('groups(*)')
      .eq('user_id', user.id);
    if (data) setGroups((data as unknown as Array<{ groups: Group }>).map((r) => r.groups).filter(Boolean));
    setLoading(false);
  }, [user]);

  // Accept any pending invites for this user's email
  const acceptPendingInvites = useCallback(async () => {
    if (!user?.email || !supabase) return;
    const { data: invites } = await supabase
      .from('group_invites')
      .select('*')
      .eq('invited_email', user.email);
    if (!invites?.length) return;
    for (const invite of invites) {
      await supabase.from('group_members').insert({ group_id: invite.group_id, user_id: user.id, role: 'member' });
      await supabase.from('group_invites').delete().eq('id', invite.id);
    }
    fetchGroups();
  }, [user, fetchGroups]);

  useEffect(() => {
    if (user) {
      acceptPendingInvites();
      fetchGroups();
    }
  }, [user, fetchGroups, acceptPendingInvites]);

  const createGroup = async (name: string): Promise<{ group: Group | null; error: string | null }> => {
    if (!user) return { group: null, error: 'Not signed in' };
    if (!supabase) return { group: null, error: 'Supabase not configured' };

    const { data: groupId, error } = await supabase.rpc('create_group_with_member', { group_name: name });

    if (error || !groupId) {
      console.error('createGroup error:', error);
      return { group: null, error: error?.message ?? 'Failed to create group' };
    }

    await fetchGroups();
    const created: Group = { id: groupId, name, owner_id: user.id, created_at: new Date().toISOString() };
    return { group: created, error: null };
  };

  return { groups, loading, createGroup, refetch: fetchGroups };
}

export function useGroupDetail(groupId: string) {
  const { user } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [sessions, setSessions] = useState<MeetingSession[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user || !groupId || !supabase) return;

    const [{ data: groupData }, { data: membersData }, { data: sessionsData }] = await Promise.all([
      supabase.from('groups').select('*').eq('id', groupId).single(),
      supabase.from('group_members').select('user_id, role, added_at, profiles(email, display_name, avatar_url)').eq('group_id', groupId),
      supabase.from('meeting_sessions').select('*').eq('group_id', groupId).order('started_at', { ascending: false }),
    ]);

    if (groupData) setGroup(groupData);
    if (membersData) setMembers(membersData as unknown as GroupMember[]);
    if (sessionsData) setSessions(sessionsData);
    setLoading(false);
  }, [user, groupId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const inviteByEmail = async (email: string): Promise<'added' | 'invited' | 'error'> => {
    if (!supabase) return 'error';
    // Check if email already has an account
    const { data: profile } = await supabase.from('profiles').select('id').eq('email', email).single();
    if (profile) {
      const { error } = await supabase.from('group_members').insert({ group_id: groupId, user_id: profile.id, role: 'member' });
      if (error) return 'error';
      await fetchAll();
      return 'added';
    }
    // Send invite for when they sign up
    const { error } = await supabase.from('group_invites').insert({ group_id: groupId, invited_email: email, invited_by: user?.id });
    return error ? 'error' : 'invited';
  };

  const removeMember = async (userId: string) => {
    if (!supabase) return;
    await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId);
    await fetchAll();
  };

  const deleteGroup = async (): Promise<{ error: string | null }> => {
    if (!supabase) return { error: 'Supabase not configured' };
    const { error } = await supabase.rpc('delete_group', { target_group_id: groupId });
    if (error) return { error: error.message };
    return { error: null };
  };

  return { group, members, sessions, loading, inviteByEmail, removeMember, deleteGroup, refetch: fetchAll };
}

export interface MeetingStats {
  total: number;
  totalMinutes: number;
  thisWeek: number;
}

export function useRecentSessions() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<RecentSession[]>([]);
  const [stats, setStats] = useState<MeetingStats>({ total: 0, totalMinutes: 0, thisWeek: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !supabase) return;
    (async () => {
      // Get all group IDs the user belongs to
      const { data: memberships } = await supabase
        .from('group_members')
        .select('group_id, groups(name)')
        .eq('user_id', user.id);
      if (!memberships?.length) { setLoading(false); return; }

      const groupMap = new Map<string, string>(
        (memberships as unknown as Array<{ group_id: string; groups: { name: string } }>)
          .map((m) => [m.group_id, m.groups?.name ?? 'Unknown'])
      );
      const groupIds = [...groupMap.keys()];

      const { data } = await supabase
        .from('meeting_sessions')
        .select('*')
        .in('group_id', groupIds)
        .order('started_at', { ascending: false })
        .limit(20);

      if (!data) { setLoading(false); return; }

      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      let totalMin = 0;
      let thisWeek = 0;

      const enriched: RecentSession[] = data.map((s) => {
        const dur = s.ended_at && s.started_at
          ? Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000)
          : null;
        if (dur) totalMin += dur;
        if (new Date(s.started_at).getTime() > weekAgo) thisWeek++;
        return { ...s, group_name: groupMap.get(s.group_id) ?? 'Unknown', duration_min: dur };
      });

      setSessions(enriched);
      setStats({ total: data.length, totalMinutes: totalMin, thisWeek });
      setLoading(false);
    })();
  }, [user]);

  return { sessions, stats, loading };
}
