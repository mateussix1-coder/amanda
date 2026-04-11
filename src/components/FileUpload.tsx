import React, { useCallback } from 'react';
import { Upload, FileText, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

interface FileUploadProps {
  label: string;
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  accept?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({ label, onFileSelect, selectedFile, accept = ".csv,.xlsx,.xls,.pdf" }) => {
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onFileSelect(file);
  }, [onFileSelect]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
  };

  return (
    <Card 
      className={cn(
        "relative border-2 border-dashed p-8 transition-all duration-200 ease-in-out rounded-xl",
        selectedFile ? "border-indigo-500 bg-indigo-50/50" : "border-zinc-300 hover:border-indigo-400 hover:bg-zinc-50"
      )}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="flex flex-col items-center justify-center space-y-4 text-center">
        <div className={cn(
          "rounded-full p-4 transition-colors",
          selectedFile ? "bg-indigo-100 text-indigo-600" : "bg-zinc-100 text-zinc-500"
        )}>
          {selectedFile ? <CheckCircle2 className="h-8 w-8" /> : <Upload className="h-8 w-8" />}
        </div>
        
        <div className="space-y-1">
          <p className="text-base font-semibold text-zinc-800">{label}</p>
          <p className="text-sm text-zinc-500">
            {selectedFile ? (
              <span className="text-indigo-600 font-medium">{selectedFile.name}</span>
            ) : (
              "Arraste ou clique para selecionar"
            )}
          </p>
        </div>

        <input
          type="file"
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={handleFileChange}
          accept={accept}
        />
      </div>
    </Card>
  );
};
