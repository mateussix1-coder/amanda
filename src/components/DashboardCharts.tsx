import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AuditResult, AuditSummary } from '@/src/types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

interface DashboardChartsProps {
  results: AuditResult[];
  summary: AuditSummary;
}

export const DashboardCharts: React.FC<DashboardChartsProps> = ({ results, summary }) => {
  const pieData = useMemo(() => [
    { name: 'Conciliados', value: results.filter(r => r.status === 'BOTH_MATCH').length, color: '#10b981' },
    { name: 'Divergentes', value: summary.divergencias, color: '#f43f5e' },
    { name: 'Faltantes', value: summary.faltantes, color: '#f59e0b' },
  ], [results, summary]);

  const topDivergences = useMemo(() => {
    return results
      .filter(r => r.status === 'BOTH_DIVERGENT' || r.status === 'A_ONLY')
      .map(r => {
        const totalDiff = r.status === 'A_ONLY' ? (r.sistemaA?.freteEmpresa || 0) : Math.abs(r.diferencaMotorista);
        return {
          cte: r.cte,
          diff: totalDiff
        };
      })
      .sort((a, b) => b.diff - a.diff)
      .slice(0, 5);
  }, [results]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <Card className="border-zinc-200 shadow-sm rounded-xl overflow-hidden">
        <CardHeader className="bg-zinc-50/50 border-b border-zinc-100">
          <CardTitle className="font-heading text-zinc-800">Status da Auditoria</CardTitle>
          <CardDescription>Distribuição dos resultados processados</CardDescription>
        </CardHeader>
        <CardContent className="pt-6 h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: number) => [`${value} CTEs`, 'Quantidade']}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e4e4e7', boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)' }}
              />
              <Legend verticalAlign="bottom" height={36} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border-zinc-200 shadow-sm rounded-xl overflow-hidden">
        <CardHeader className="bg-zinc-50/50 border-b border-zinc-100">
          <CardTitle className="font-heading text-zinc-800">Top 5 Maiores Divergências</CardTitle>
          <CardDescription>CTEs com maior impacto financeiro</CardDescription>
        </CardHeader>
        <CardContent className="pt-6 h-[300px]">
          {topDivergences.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topDivergences} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e4e4e7" />
                <XAxis type="number" tickFormatter={(val) => `R$ ${val}`} stroke="#a1a1aa" fontSize={12} />
                <YAxis dataKey="cte" type="category" stroke="#a1a1aa" fontSize={12} width={80} />
                <Tooltip 
                  formatter={(value: number) => [formatCurrency(value), 'Diferença Total']}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e4e4e7', boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)' }}
                  cursor={{ fill: '#f4f4f5' }}
                />
                <Bar dataKey="diff" fill="#4f46e5" radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
              Nenhuma divergência encontrada.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
