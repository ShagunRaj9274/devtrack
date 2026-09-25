'use client';

import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { API_URL, api, refreshSession, setAccessToken, setSessionExpiredHandler } from './api';
import type { User } from './types';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: Status;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; username: string; name: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
  /** Bumps whenever the access token is replaced, so the socket can reconnect with it. */
  sessionVersion: number;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [sessionVersion, setSessionVersion] = useState(0);

  const clear = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  // On load, try to resume the session from the refresh cookie.
  useEffect(() => {
    setSessionExpiredHandler(clear);
    let cancelled = false;
    (async () => {
      const ok = await refreshSession();
      if (cancelled) return;
      if (!ok) return setStatus('anonymous');
      try {
        const me = await api<User>('/auth/me');
        if (cancelled) return;
        setUser(me);
        setStatus('authenticated');
        setSessionVersion((v) => v + 1);
      } catch {
        if (!cancelled) clear();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clear]);

  const startSession = useCallback((data: { user: User; accessToken: string }) => {
    setAccessToken(data.accessToken);
    setUser(data.user);
    setStatus('authenticated');
    setSessionVersion((v) => v + 1);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      sessionVersion,
      setUser,
      login: async (email, password) => {
        startSession(await api('/auth/login', { method: 'POST', body: { email, password } }));
      },
      register: async (input) => {
        startSession(await api('/auth/register', { method: 'POST', body: input }));
      },
      logout: async () => {
        await fetch(`${API_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => undefined);
        clear();
      },
    }),
    [status, user, sessionVersion, startSession, clear],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** For pages inside the authenticated layout, where the user is guaranteed. */
export function useCurrentUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useCurrentUser used outside the authenticated layout');
  return user;
}
