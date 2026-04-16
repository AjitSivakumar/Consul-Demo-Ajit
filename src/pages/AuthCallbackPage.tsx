import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function AuthCallbackPage(): React.JSX.Element {
  const [status, setStatus] = useState('Reading tokens…');

  useEffect(() => {
    const hash = window.location.hash;
    console.log('[auth-callback] hash:', hash.slice(0, 80));

    if (hash) {
      const params = new URLSearchParams(hash.slice(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      console.log('[auth-callback] accessToken found:', !!accessToken);
      console.log('[auth-callback] refreshToken found:', !!refreshToken);

      if (accessToken && refreshToken) {
        setStatus('Setting session…');
        if (!supabase) { setStatus('Error: Supabase not configured'); return; }
        supabase.auth
          .setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(({ data: { session }, error }) => {
            console.log('[auth-callback] setSession result:', { session: !!session, error });
            if (session && !error) {
              setStatus('Success! Redirecting…');
              window.location.replace('/dashboard');
            } else {
              setStatus(`Error: ${error?.message ?? 'no session returned'}`);
            }
          });
        return;
      }
    }

    setStatus('No hash tokens — checking existing session…');
    if (!supabase) { setStatus('Error: Supabase not configured'); return; }
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[auth-callback] getSession:', !!session);
      window.location.replace(session ? '/' : '/login');
    });
  }, []);

  return (
    <main className="lp-wrap">
      <div className="lp-body">
        <p className="lp-sub">{status}</p>
      </div>
    </main>
  );
}
