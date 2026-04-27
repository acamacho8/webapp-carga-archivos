export type AlertStatus = 'ok' | 'warning' | 'critical' | 'expired';

export type DocumentType =
  | 'publicidad'
  | 'permiso_sanitario'
  | 'conformidad_uso'
  | 'registro_contribuyente'
  | 'inces'
  | 'impuesto'
  | 'patente';

export interface ComplianceDocument {
  id?: string;
  name: string;
  expires_at: string;
  type?: DocumentType;
  file_url?: string;
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

export interface StoreWithStatus extends ComplianceStore {
  documents: DocumentWithStatus[];
  worstStatus: AlertStatus;
}
