'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  AlertStatus,
  ComplianceStore,
  DocumentWithStatus,
  StoreWithStatus,
} from '@/types/compliance';

const STATUS_PRIORITY: AlertStatus[] = ['expired', 'critical', 'warning', 'ok'];

function getAlertStatus(expiresAt: string, today: Date): AlertStatus {
  const [y, m, d] = expiresAt.split('-').map(Number);
  const expiry = new Date(y, m - 1, d); // local midnight — avoids UTC drift
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.floor((expiry.getTime() - todayMid.getTime()) / 86_400_000);
  if (days < 0)   return 'expired';
  if (days <= 15) return 'critical';
  if (days <= 30) return 'warning';
  return 'ok';
}

function worstOf(statuses: AlertStatus[]): AlertStatus {
  let best = STATUS_PRIORITY.length - 1;
  for (const s of statuses) {
    const idx = STATUS_PRIORITY.indexOf(s);
    if (idx < best) best = idx;
  }
  return STATUS_PRIORITY[best];
}

function enrichStores(raw: ComplianceStore[]): StoreWithStatus[] {
  const today = new Date();
  return raw.map(store => {
    const documents: DocumentWithStatus[] = store.documents.map(doc => {
      const [yr, mo, dy] = doc.expires_at.split('-').map(Number);
      const expiry = new Date(yr, mo - 1, dy);
      const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const daysUntilExpiry = Math.floor(
        (expiry.getTime() - todayMid.getTime()) / 86_400_000
      );
      return { ...doc, alertStatus: getAlertStatus(doc.expires_at, today), daysUntilExpiry };
    });
    return {
      ...store,
      documents,
      worstStatus: worstOf(documents.map(d => d.alertStatus)),
    };
  });
}

export function useComplianceData() {
  const [stores, setStores] = useState<StoreWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<AlertStatus | 'all'>('all');

  const fetchData = useCallback(async (silent = false, bust = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const url = bust ? '/api/compliance?bust=1' : '/api/compliance';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const raw: ComplianceStore[] = await res.json();
      setStores(enrichStores(raw));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Carga inicial
  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh silencioso cada 5 minutos
  useEffect(() => {
    const id = setInterval(() => fetchData(true), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchData]);

  const filteredStores = stores.filter(store => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      q === '' ||
      store.name.toLowerCase().includes(q) ||
      store.id.toLowerCase().includes(q);

    const matchesStatus =
      statusFilter === 'all' ||
      store.documents.some(d => d.alertStatus === statusFilter);

    return matchesSearch && matchesStatus;
  });

  return {
    stores,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    filteredStores,
    refresh: () => fetchData(false, true),
  };
}
