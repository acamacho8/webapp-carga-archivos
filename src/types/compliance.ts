export type AlertStatus = 'ok' | 'warning' | 'critical' | 'expired' | 'unknown';

export type DocumentType =
  | 'publicidad'
  | 'permiso_sanitario'
  | 'conformidad_uso'
  | 'registro_contribuyente'
  | 'inces'
  | 'impuesto'
  | 'patente'
  | 'cert_medico'
  | 'manipulacion_alimentos';

export interface ComplianceDocument {
  id?: string;
  name: string;
  expires_at: string;
  issued_at?: string; // fecha de emisión — usada para calcular vencimiento si expires_at es desconocido
  type?: DocumentType;
  file_url?: string;
  folder?: string;
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
