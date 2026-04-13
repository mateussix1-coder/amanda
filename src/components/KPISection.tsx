import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AuditSummary } from '@/src/types';
import { FileCheck, AlertTriangle, FileSearch, DollarSign, TrendingUp } from 'lucide-react';

interface KPISectionProps {
  summary: AuditSummary;
}

export const KPISection: React.FC<KPISectionProps> = ({ summary }) => {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card className="border-zinc-200 shadow-sm rounded-xl overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-zinc-50/50 border-b border-zinc-100">
          <CardTitle className="text-sm font-medium font-heading text-zinc-700">CTEs Analisados</CardTitle>
          <div className="p-2 bg-blue-100 rounded-lg">
            <FileCheck className="h-4 w-4 text-blue-600" />
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="text-3xl font-bold font-heading text-zinc-900">{summary.totalAnalizados}</div>
          <p className="text-xs text-zinc-500 mt-1">Total processado</p>
        </CardContent>
      </Card>
      
      <Card className="border-zinc-200 shadow-sm rounded-xl overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-zinc-50/50 border-b border-zinc-100">
          <CardTitle className="text-sm font-medium font-heading text-zinc-700">Divergências</CardTitle>
          <div className="p-2 bg-rose-100 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-rose-600" />
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="text-3xl font-bold font-heading text-rose-600">{summary.divergencias}</div>
          <p className="text-xs text-zinc-500 mt-1">{summary.faltantes} faltantes</p>
        </CardContent>
      </Card>

      <Card className="border-zinc-200 shadow-sm rounded-xl overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-zinc-50/50 border-b border-zinc-100">
          <CardTitle className="text-sm font-medium font-heading text-zinc-700">Diferença Motorista</CardTitle>
          <div className="p-2 bg-amber-100 rounded-lg">
            <DollarSign className="h-4 w-4 text-amber-600" />
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="text-3xl font-bold font-heading text-amber-600">{formatCurrency(summary.valorTotalDivergencia)}</div>
          <p className="text-xs text-zinc-500 mt-1">Soma das pendências reais (Faltantes + Diferenças)</p>
        </CardContent>
      </Card>

      <Card className="border-zinc-200 shadow-sm rounded-xl overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-zinc-50/50 border-b border-zinc-100">
          <CardTitle className="text-sm font-medium font-heading text-zinc-700">Margem Total (A)</CardTitle>
          <div className="p-2 bg-emerald-100 rounded-lg">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="text-3xl font-bold font-heading text-emerald-600">{formatCurrency(summary.margemTotal)}</div>
          <p className="text-xs text-zinc-500 mt-1">Valor absoluto do rodapé (Result.)</p>
        </CardContent>
      </Card>

      {summary.lacunasSequenciais && summary.lacunasSequenciais.length > 0 && (
        <Card className="md:col-span-2 lg:col-span-4 border-amber-200 bg-amber-50/30 shadow-sm rounded-xl overflow-hidden">
          <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2 border-b border-amber-100">
            <div className="p-2 bg-amber-100 rounded-lg">
              <FileSearch className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <CardTitle className="text-sm font-bold font-heading text-amber-800">Lacunas Sequenciais Detectadas</CardTitle>
              <p className="text-[10px] text-amber-600 font-medium">Numerações de CTE que parecem estar faltando na sequência numérica</p>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-2">
              {summary.lacunasSequenciais.map((gap, idx) => (
                <span key={idx} className="px-2 py-1 bg-white border border-amber-200 text-amber-700 text-xs font-bold rounded-md shadow-sm">
                  {gap}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
