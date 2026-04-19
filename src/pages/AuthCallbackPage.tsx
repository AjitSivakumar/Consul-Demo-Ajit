import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function AuthCallbackPage(): React.JSX.Element {
  const [status, setStatus] = useState('Reading tokens…');

  useEffect(() => {
    if (!supabase) { setStatus('Error: Supabase not configured'); return; }

    // Supabase redirects here with ?error= when sign-in fails server-side
    const searchParams = new URLSearchParams(window.location.search);
    const errorParam = searchParams.get('error');
    if (errorParam) {
      const desc = searchParams.get('error_description')?.replace(/\+/g, ' ') ?? errorParam;
      setStatus(`Sign-in failed: ${desc}`);
      return;
    }

    // PKCE flow: Supabase puts ?code= in the search params
    const code = searchParams.get('code');
    if (code) {
      setStatus('Exchanging code…');
      supabase.auth.exchangeCodeForSession(code).then(({ data: { session }, error }) => {
        if (session && !error) {
          setStatus('Success! Redirecting…');
          window.location.replace('/dashboard');
        } else {
          setStatus(`Error: ${error?.message ?? 'no session returned'}`);
        }
      });
      return;
    }

    // Implicit flow: tokens are in the URL hash
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.slice(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (accessToken && refreshToken) {
        setStatus('Setting session…');
        supabase.auth
          .setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(({ data: { session }, error }) => {
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

    // No tokens — check for an existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      window.location.replace(session ? '/dashboard' : '/login');
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
