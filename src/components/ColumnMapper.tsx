import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ColumnMapping } from '@/src/types';

interface ColumnMapperProps {
  columns: string[];
  mapping: ColumnMapping;
  onMappingChange: (mapping: ColumnMapping) => void;
  title: string;
}

export const ColumnMapper: React.FC<ColumnMapperProps> = ({ columns, mapping, onMappingChange, title }) => {
  const handleChange = (key: keyof ColumnMapping, value: string) => {
    onMappingChange({ ...mapping, [key]: value });
  };

  return (
    <div className="space-y-4 rounded-lg border p-4 bg-slate-50/50">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Coluna CTE</Label>
          <Select value={mapping.cte} onValueChange={(v) => handleChange('cte', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a coluna" />
            </SelectTrigger>
            <SelectContent>
              {columns.map(col => <SelectItem key={col} value={col}>{col}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Coluna Frete Empresa</Label>
          <Select value={mapping.freteEmpresa} onValueChange={(v) => handleChange('freteEmpresa', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a coluna" />
            </SelectTrigger>
            <SelectContent>
              {columns.map(col => <SelectItem key={col} value={col}>{col}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Coluna Frete Motorista</Label>
          <Select value={mapping.freteMotorista} onValueChange={(v) => handleChange('freteMotorista', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a coluna" />
            </SelectTrigger>
            <SelectContent>
              {columns.map(col => <SelectItem key={col} value={col}>{col}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Coluna Margem</Label>
          <Select value={mapping.margem} onValueChange={(v) => handleChange('margem', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a coluna" />
            </SelectTrigger>
            <SelectContent>
              {columns.map(col => <SelectItem key={col} value={col}>{col}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};
