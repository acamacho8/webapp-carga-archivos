'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  AlertStatus,
  ComplianceStore,
  DocumentWithStatus,
  StoreWithStatus,
} from '@/types/compliance';

const STATUS_PRIORITY: AlertStatus[] = ['expired', 'critical', 'warning', 'ok', 'unknown'];

// Cert. médico: vence al año de la fecha de emisión
function isOneYearDoc(type?: string, name?: string): boolean {
  if (type === 'cert_medico') return true;
  const n = (name ?? '').toLowerCase();
  return n.includes('medic') && !n.includes('manipul');
}

// Manipulación de alimentos (SACS, Providencia 070-2015): no tiene fecha de vencimiento
function isNoExpiryDoc(type?: string, name?: string): boolean {
  if (type === 'manipulacion_alimentos') return true;
  const n = (name ?? '').toLowerCase();
  return n.includes('manipul');
}

function addOneYear(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const expiry = new Date(y + 1, m - 1, d);
  return `${expiry.getFullYear()}-${String(expiry.getMonth() + 1).padStart(2, '0')}-${String(expiry.getDate()).padStart(2, '0')}`;
}

function getAlertStatus(expiresAt: string, today: Date): AlertStatus {
  if (!expiresAt || expiresAt === '1970-01-01') return 'unknown';
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
      const missingExpiry = !doc.expires_at || doc.expires_at === '1970-01-01';

      // Manipulación de alimentos (SACS): no vence según Providencia 070-2015
      if (isNoExpiryDoc(doc.type, doc.name)) {
        return { ...doc, expires_at: '9999-12-31', alertStatus: 'ok' as AlertStatus, daysUntilExpiry: 99999 };
      }

      // Cert. médico: calcular vencimiento desde fecha de emisión + 1 año
      let effectiveExpiry = doc.expires_at;
      if (missingExpiry && doc.issued_at && doc.issued_at !== '1970-01-01' && isOneYearDoc(doc.type, doc.name)) {
        effectiveExpiry = addOneYear(doc.issued_at);
      }

      if (!effectiveExpiry || effectiveExpiry === '1970-01-01') {
        return { ...doc, alertStatus: 'unknown' as AlertStatus, daysUntilExpiry: 9999 };
      }
      const [yr, mo, dy] = effectiveExpiry.split('-').map(Number);
      const expiry = new Date(yr, mo - 1, dy);
      const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const daysUntilExpiry = Math.floor(
        (expiry.getTime() - todayMid.getTime()) / 86_400_000
      );
      return { ...doc, expires_at: effectiveExpiry, alertStatus: getAlertStatus(effectiveExpiry, today), daysUntilExpiry };
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
