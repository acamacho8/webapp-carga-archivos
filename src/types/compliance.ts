export type DocumentType =
  | 'publicidad'
  | 'permiso_sanitario'
  | 'conformidad_uso'
  | 'registro_contribuyente'
  | 'inces'
  | 'impuesto'
  | 'patente';
export type AlertStatus = 'expired' | 'critical' | 'warning' | 'ok';

export interface ComplianceDocument {
  id: string;
  type: DocumentType;
  name: string;
  expires_at: string; // YYYY-MM-DD
  file_url?: string;  // Google Drive link (optional)
}

export interface ComplianceStore {
  id: string;
  name: string;
  documents: ComplianceDocument[];
}

export interface DocumentWithStatus extends ComplianceDocument {
  alertStatus: AlertStatus;
  daysUntilExpiry: number;
}

export interface StoreWithStatus extends Omit<ComplianceStore, 'documents'> {
  documents: DocumentWithStatus[];
  worstStatus: AlertStatus;
}
