export interface CTEData {
  cte: string;
  freteEmpresa: number;
  freteMotorista: number;
  margem: number;
  peso: number;
  raw: any;
}

export interface AuditResult {
  cte: string;
  status: 'A_ONLY' | 'B_ONLY' | 'BOTH_DIVERGENT' | 'BOTH_MATCH';
  sistemaA?: CTEData;
  sistemaB?: CTEData;
  diferencaMotorista: number;
  divergencias: {
    freteEmpresa?: number;
    freteMotorista?: number;
    margem?: number;
    peso?: number;
  };
}

export interface ColumnMapping {
  cte: string;
  freteEmpresa: string;
  freteMotorista: string;
  margem: string;
  peso: string;
}

export interface AuditSummary {
  totalAnalizados: number;
  faltantes: number;
  divergencias: number;
  valorTotalDivergencia: number; // Valor em Risco
  margemTotal: number; // Valor fixo do rodapé (Result.)
  lacunasSequenciais?: string[];
}

export interface SavedAudit {
  id?: string;
  userId: string;
  name: string;
  summary: AuditSummary;
  results: AuditResult[];
  createdAt: any;
}
