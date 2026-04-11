import React, { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter } from 'lucide-react';
import { AuditResult } from '@/src/types';
import { cn } from '@/lib/utils';

interface AuditTableProps {
  results: AuditResult[];
}

export const AuditTable: React.FC<AuditTableProps> = ({ results }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filteredResults = useMemo(() => {
    return results.filter(r => {
      const matchesSearch = r.cte.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || r.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [results, searchTerm, statusFilter]);

  const formatCurrency = (val?: number) => {
    if (val === undefined) return '-';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const formatPercent = (val?: number) => {
    if (val === undefined) return '-';
    return `${val.toFixed(2)}%`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 p-4 pb-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            placeholder="Pesquisar por Número do CTE..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 border-zinc-200"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[200px] border-zinc-200">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-zinc-400" />
              <SelectValue placeholder="Filtrar por Status" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os Status</SelectItem>
            <SelectItem value="BOTH_MATCH">Conciliados</SelectItem>
            <SelectItem value="BOTH_DIVERGENT">Divergentes</SelectItem>
            <SelectItem value="A_ONLY">Apenas Sistema A</SelectItem>
            <SelectItem value="B_ONLY">Apenas Sistema B</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border mx-4 mb-4 overflow-hidden">
        <div className="max-h-[600px] overflow-auto">
          <Table>
            <TableHeader className="bg-zinc-50 sticky top-0 z-10 shadow-sm">
              <TableRow>
                <TableHead className="w-[100px]">CTE</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Empresa (A)</TableHead>
                <TableHead className="text-right">Empresa (B)</TableHead>
                <TableHead className="text-right">Motorista (A)</TableHead>
                <TableHead className="text-right">Motorista (B)</TableHead>
                <TableHead className="text-right">Peso (A)</TableHead>
                <TableHead className="text-right">Peso (B)</TableHead>
                <TableHead className="text-right">Margem (A)</TableHead>
                <TableHead className="text-right">Margem (B)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
            {filteredResults.map((result) => (
              <TableRow 
                key={result.cte}
                className={cn(
                  "transition-colors",
                  result.status === 'BOTH_DIVERGENT' && "bg-rose-50/50 hover:bg-rose-50",
                  (result.status === 'A_ONLY' || result.status === 'B_ONLY') && "bg-amber-50/50 hover:bg-amber-50",
                  result.status === 'BOTH_MATCH' && "bg-emerald-50/20 hover:bg-emerald-50/40"
                )}
              >
                <TableCell className="font-medium">{result.cte}</TableCell>
                <TableCell>
                  {result.status === 'A_ONLY' && <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50">Apenas A</Badge>}
                  {result.status === 'B_ONLY' && <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">Apenas B</Badge>}
                  {result.status === 'BOTH_DIVERGENT' && <Badge variant="destructive">Divergente</Badge>}
                  {result.status === 'BOTH_MATCH' && <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">Conciliado</Badge>}
                </TableCell>
                <TableCell className={cn("text-right", result.divergencias.freteEmpresa && "text-red-600 font-semibold")}>
                  {formatCurrency(result.sistemaA?.freteEmpresa)}
                </TableCell>
                <TableCell className={cn("text-right", result.divergencias.freteEmpresa && "text-red-600 font-semibold")}>
                  {formatCurrency(result.sistemaB?.freteEmpresa)}
                </TableCell>
                <TableCell className={cn("text-right", result.divergencias.freteMotorista && "text-red-600 font-semibold")}>
                  {formatCurrency(result.sistemaA?.freteMotorista)}
                </TableCell>
                <TableCell className={cn("text-right", result.divergencias.freteMotorista && "text-red-600 font-semibold")}>
                  {formatCurrency(result.sistemaB?.freteMotorista)}
                </TableCell>
                <TableCell className={cn("text-right", result.divergencias.peso && "text-red-600 font-semibold")}>
                  {result.sistemaA?.peso !== undefined ? result.sistemaA.peso.toLocaleString('pt-BR') : '-'}
                </TableCell>
                <TableCell className={cn("text-right", result.divergencias.peso && "text-red-600 font-semibold")}>
                  {result.sistemaB?.peso !== undefined ? result.sistemaB.peso.toLocaleString('pt-BR') : '-'}
                </TableCell>
                <TableCell className={cn("text-right", result.divergencias.margem && "text-red-600 font-semibold")}>
                  {formatPercent(result.sistemaA?.margem)}
                </TableCell>
                <TableCell className={cn("text-right", result.divergencias.margem && "text-red-600 font-semibold")}>
                  {formatPercent(result.sistemaB?.margem)}
                </TableCell>
              </TableRow>
            ))}
            {filteredResults.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-zinc-500">
                  Nenhum CTE encontrado com os filtros atuais.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </div>
      </div>
    </div>
  );
};
