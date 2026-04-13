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
import { Search, Filter, AlertTriangle, Edit, X, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuditResult } from '@/src/types';
import { cn } from '@/lib/utils';

interface AuditTableProps {
  results: AuditResult[];
  onUpdateResult?: (updatedResult: AuditResult) => void;
}

export const AuditTable: React.FC<AuditTableProps> = ({ results, onUpdateResult }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [onlyDivergent, setOnlyDivergent] = useState(false);
  const [editingCte, setEditingCte] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    freteEmpresaA?: number;
    freteMotoristaA?: number;
    freteEmpresaB?: number;
    freteMotoristaB?: number;
  }>({});

  const filteredResults = useMemo(() => {
    return results.filter(r => {
      const matchesSearch = r.cte.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || r.status === statusFilter;
      const isDivergent = r.status === 'BOTH_DIVERGENT' || r.status === 'A_ONLY' || r.status === 'B_ONLY';
      const matchesDivergentToggle = !onlyDivergent || isDivergent;
      
      return matchesSearch && matchesStatus && matchesDivergentToggle;
    });
  }, [results, searchTerm, statusFilter, onlyDivergent]);

  const handleStartEdit = (result: AuditResult) => {
    setEditingCte(result.cte);
    setEditValues({
      freteEmpresaA: result.sistemaA?.freteEmpresa,
      freteMotoristaA: result.sistemaA?.freteMotorista,
      freteEmpresaB: result.sistemaB?.freteEmpresa,
      freteMotoristaB: result.sistemaB?.freteMotorista,
    });
  };

  const handleSaveEdit = (result: AuditResult) => {
    if (!onUpdateResult) return;

    const updatedResult: AuditResult = {
      ...result,
      sistemaA: result.sistemaA ? {
        ...result.sistemaA,
        freteEmpresa: editValues.freteEmpresaA ?? result.sistemaA.freteEmpresa,
        freteMotorista: editValues.freteMotoristaA ?? result.sistemaA.freteMotorista,
      } : undefined,
      sistemaB: result.sistemaB ? {
        ...result.sistemaB,
        freteEmpresa: editValues.freteEmpresaB ?? result.sistemaB.freteEmpresa,
        freteMotorista: editValues.freteMotoristaB ?? result.sistemaB.freteMotorista,
      } : undefined,
    };

    // Recalculate differences and status
    const itemA = updatedResult.sistemaA;
    const itemB = updatedResult.sistemaB;

    if (itemA && itemB) {
      const diffEmpresa = Math.abs(itemA.freteEmpresa - itemB.freteEmpresa);
      const diffMotorista = Math.abs(itemA.freteMotorista - itemB.freteMotorista);
      
      const diffEmpresaRounded = Math.round(diffEmpresa * 100) / 100;
      const diffMotoristaRounded = Math.round(diffMotorista * 100) / 100;

      updatedResult.status = (diffEmpresaRounded > 0.00 || diffMotoristaRounded > 0.00) ? 'BOTH_DIVERGENT' : 'BOTH_MATCH';
      updatedResult.diferencaMotorista = itemA.freteMotorista - itemB.freteMotorista;
      updatedResult.divergencias = {
        ...updatedResult.divergencias,
        freteEmpresa: diffEmpresaRounded > 0.00 ? diffEmpresaRounded : undefined,
        freteMotorista: diffMotoristaRounded > 0.00 ? diffMotoristaRounded : undefined,
      };
    }

    onUpdateResult(updatedResult);
    setEditingCte(null);
  };

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
      <div className="flex flex-col lg:flex-row gap-4 p-4 pb-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            placeholder="Pesquisar por Número do CTE..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 border-zinc-200 rounded-xl"
          />
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant={onlyDivergent ? "destructive" : "outline"}
            size="sm"
            onClick={() => setOnlyDivergent(!onlyDivergent)}
            className={cn(
              "rounded-xl h-10 px-4 transition-all",
              !onlyDivergent && "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            )}
          >
            <AlertTriangle className={cn("mr-2 h-4 w-4", onlyDivergent ? "text-white" : "text-rose-500")} />
            {onlyDivergent ? "Mostrando Divergências" : "Todas as Pendências"}
          </Button>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[200px] border-zinc-200 rounded-xl h-10">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-zinc-400" />
                <SelectValue placeholder="Filtrar por Status" />
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="ALL">Todos os Status</SelectItem>
              <SelectItem value="BOTH_MATCH">Conciliados</SelectItem>
              <SelectItem value="BOTH_DIVERGENT">Divergentes</SelectItem>
              <SelectItem value="A_ONLY">Apenas Sistema A</SelectItem>
              <SelectItem value="B_ONLY">Apenas Sistema B</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
                <TableHead className="text-right">Dif. Motorista</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
            {filteredResults.map((result) => {
              const isEditing = editingCte === result.cte;
              
              return (
                <TableRow 
                  key={result.cte}
                  className={cn(
                    "transition-colors group",
                    result.status === 'BOTH_DIVERGENT' && "bg-rose-50/50 hover:bg-rose-50",
                    (result.status === 'A_ONLY' || result.status === 'B_ONLY') && "bg-amber-50/50 hover:bg-amber-50",
                    result.status === 'BOTH_MATCH' && "bg-emerald-50/20 hover:bg-emerald-50/40",
                    isEditing && "bg-indigo-50/50 ring-1 ring-indigo-200",
                    // Divergência Crítica: Motorista (A) zerado e Motorista (B) com valor
                    result.sistemaA?.freteMotorista === 0 && (result.sistemaB?.freteMotorista || 0) > 0 && "bg-red-100 hover:bg-red-200"
                  )}
                >
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span>{result.cte}</span>
                      {result.fuzzyMatch && (
                        <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider">Par Sugerido</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {result.status === 'A_ONLY' && <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50">Apenas A</Badge>}
                    {result.status === 'B_ONLY' && <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">Apenas B</Badge>}
                    {result.status === 'BOTH_DIVERGENT' && (
                      <Badge variant="destructive" className={cn(result.sistemaA?.freteMotorista === 0 && (result.sistemaB?.freteMotorista || 0) > 0 && "animate-pulse")}>
                        {result.sistemaA?.freteMotorista === 0 && (result.sistemaB?.freteMotorista || 0) > 0 ? "Divergência Crítica" : "Divergente"}
                      </Badge>
                    )}
                    {result.status === 'BOTH_MATCH' && <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">Conciliado</Badge>}
                  </TableCell>
                  
                  {/* Empresa (A) */}
                  <TableCell className={cn("text-right", result.divergencias.freteEmpresa && "text-red-600 font-semibold")}>
                    {isEditing && result.sistemaA ? (
                      <Input 
                        type="number" 
                        value={editValues.freteEmpresaA} 
                        onChange={(e) => setEditValues({...editValues, freteEmpresaA: parseFloat(e.target.value)})}
                        className="h-8 w-24 text-right ml-auto"
                      />
                    ) : formatCurrency(result.sistemaA?.freteEmpresa)}
                  </TableCell>
                  
                  {/* Empresa (B) */}
                  <TableCell className={cn("text-right", result.divergencias.freteEmpresa && "text-red-600 font-semibold")}>
                    {isEditing && result.sistemaB ? (
                      <Input 
                        type="number" 
                        value={editValues.freteEmpresaB} 
                        onChange={(e) => setEditValues({...editValues, freteEmpresaB: parseFloat(e.target.value)})}
                        className="h-8 w-24 text-right ml-auto"
                      />
                    ) : formatCurrency(result.sistemaB?.freteEmpresa)}
                  </TableCell>
                  
                  {/* Motorista (A) */}
                  <TableCell className={cn("text-right", result.divergencias.freteMotorista && "text-red-600 font-semibold")}>
                    {isEditing && result.sistemaA ? (
                      <Input 
                        type="number" 
                        value={editValues.freteMotoristaA} 
                        onChange={(e) => setEditValues({...editValues, freteMotoristaA: parseFloat(e.target.value)})}
                        className="h-8 w-24 text-right ml-auto"
                      />
                    ) : formatCurrency(result.sistemaA?.freteMotorista)}
                  </TableCell>
                  
                  {/* Motorista (B) */}
                  <TableCell className={cn("text-right", result.divergencias.freteMotorista && "text-red-600 font-semibold")}>
                    {isEditing && result.sistemaB ? (
                      <Input 
                        type="number" 
                        value={editValues.freteMotoristaB} 
                        onChange={(e) => setEditValues({...editValues, freteMotoristaB: parseFloat(e.target.value)})}
                        className="h-8 w-24 text-right ml-auto"
                      />
                    ) : formatCurrency(result.sistemaB?.freteMotorista)}
                  </TableCell>

                  <TableCell className={cn("text-right", result.divergencias.peso && "text-red-600 font-semibold")}>
                    {result.sistemaA?.peso !== undefined ? result.sistemaA.peso.toLocaleString('pt-BR') : '-'}
                  </TableCell>
                  <TableCell className={cn("text-right", result.divergencias.peso && "text-red-600 font-semibold")}>
                    {result.sistemaB?.peso !== undefined ? result.sistemaB.peso.toLocaleString('pt-BR') : '-'}
                  </TableCell>
                  <TableCell className={cn("text-right", Math.abs(result.diferencaMotorista) > 0.01 && "text-red-600 font-bold")}>
                    {formatCurrency(result.diferencaMotorista)}
                  </TableCell>
                  
                  <TableCell>
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600" onClick={() => handleSaveEdit(result)}>
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" onClick={() => setEditingCte(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleStartEdit(result)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {filteredResults.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="h-24 text-center text-zinc-500">
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
