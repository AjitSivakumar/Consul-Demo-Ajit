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
  title: string | null;
  started_at: string;
  ended_at: string | null;
  created_by: string;
  state_snapshot: Record<string, unknown> | null;
}

export function useGroups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGroups = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('group_members')
      .select('groups(*)')
      .eq('user_id', user.id);
    if (data) setGroups((data as unknown as Array<{ groups: Group }>).map((r) => r.groups).filter(Boolean));
    setLoading(false);
  }, [user]);

  // Accept any pending invites for this user's email
  const acceptPendingInvites = useCallback(async () => {
    if (!user?.email) return;
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

  const createGroup = async (name: string): Promise<Group | null> => {
    if (!user) return null;
    const { data: group, error } = await supabase
      .from('groups')
      .insert({ name, owner_id: user.id })
      .select()
      .single();
    if (error || !group) return null;
    await supabase.from('group_members').insert({ group_id: group.id, user_id: user.id, role: 'owner' });
    await fetchGroups();
    return group;
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
    if (!user || !groupId) return;

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
    await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId);
    await fetchAll();
  };

  return { group, members, sessions, loading, inviteByEmail, removeMember, refetch: fetchAll };
}
