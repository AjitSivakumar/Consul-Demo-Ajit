import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export function AuthCallbackPage(): React.JSX.Element {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate('/', { replace: true });
      } else {
        navigate('/login', { replace: true });
      }
    });
  }, [navigate]);

  return (
    <main className="lp-wrap">
      <div className="lp-body">
        <p className="lp-sub">Signing you in…</p>
      </div>
    </main>
  );
}
