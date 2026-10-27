'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ExecutiveOverviewResponse } from '../types';
import { api } from '../services/api';
import { getSocket } from '../lib/socket';

export function useExecutiveOverview(date: string) {
  const [data, setData] = useState<ExecutiveOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const requestVersion = useRef(0);

  const loadOverview = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const result = await api.getExecutiveOverview(date);
      // A response started before a status/date change must not restore old KPIs.
      if (version !== requestVersion.current) return;
      setData(result);
      return result;
    } catch (error) {
      if (version === requestVersion.current) console.error('Failed to load executive overview', error);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    const socket = getSocket();
    const refresh = () => { void loadOverview(); };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    refresh();
    window.addEventListener('ports:user_status_changed', refresh);
    socket?.on('user:status-changed', refresh);
    // Account changes can happen while this tab is disconnected or suspended.
    socket?.on('connect', refresh);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      requestVersion.current++;
      window.removeEventListener('ports:user_status_changed', refresh);
      socket?.off('user:status-changed', refresh);
      socket?.off('connect', refresh);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [loadOverview]);

  return { data, loading, loadOverview };
}
