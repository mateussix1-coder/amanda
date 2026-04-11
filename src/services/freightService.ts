import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { CTEData, ColumnMapping, AuditResult } from '../types';
import * as pdfjsLib from 'pdfjs-dist';
import { parsePDFText } from './geminiService';
// @ts-ignore - Vite import
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Configurar o worker do PDF.js usando o arquivo local via Vite
// Isso evita problemas de CORS e falhas de carregamento de módulos externos
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const extractPagesFromPDF = async (file: File): Promise<string[]> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const pages: string[] = [];
    
    const numPages = Math.min(pdf.numPages, 30); // Aumentar limite para 30 páginas
    
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => (item as any).str)
        .join(' ')
        .replace(/\s+/g, ' ');
      
      if (pageText.trim().length > 0) {
        console.log(`Página ${i}: ${pageText.length} caracteres extraídos.`);
        pages.push(`--- Página ${i} ---\n${pageText}\n`);
      } else {
        console.warn(`Página ${i}: Nenhum texto extraído. Pode ser uma imagem.`);
      }
    }

    if (pages.length === 0) {
      throw new Error("Não foi possível extrair nenhum texto do PDF. O arquivo pode ser uma imagem ou estar protegido.");
    }

    console.log(`Total de páginas com texto: ${pages.length}`);
    return pages;
  } catch (error: any) {
    console.error("Erro detalhado ao ler PDF:", error);
    throw new Error(`Erro técnico ao ler o arquivo PDF: ${error.message || 'Falha na biblioteca PDF.js'}`);
  }
};

export const parseFile = async (file: File): Promise<any[]> => {
  return new Promise(async (resolve, reject) => {
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (extension === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data),
        error: (error) => reject(error),
      });
    } else if (extension === 'xlsx' || extension === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);
        resolve(json);
      };
      reader.onerror = (error) => reject(error);
      reader.readAsArrayBuffer(file);
    } else if (extension === 'pdf') {
      try {
        const pages = await extractPagesFromPDF(file);
        const allData: any[] = [];
        
        // Processar em chunks de 2 páginas para equilibrar contexto e limite de tokens
        const chunkSize = 2;
        for (let i = 0; i < pages.length; i += chunkSize) {
          const chunk = pages.slice(i, i + chunkSize).join('\n');
          const chunkData = await parsePDFText(chunk);
          if (Array.isArray(chunkData)) {
            allData.push(...chunkData);
          }
        }
        
        resolve(allData);
      } catch (error: any) {
        console.error("Erro ao processar PDF:", error);
        reject(new Error(`Falha ao extrair dados do PDF usando IA: ${error.message || 'Erro desconhecido'}. Verifique se o arquivo não é uma imagem digitalizada ou muito grande.`));
      }
    } else {
      reject(new Error('Formato de arquivo não suportado. Use CSV, Excel ou PDF.'));
    }
  });
};

export const sanitizeValue = (val: any): number => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  
  let str = String(val).trim();
  
  // 1. Remover 'R$' e '%' (case insensitive)
  str = str.replace(/R\$/gi, '').replace(/%/g, '');
  
  // 2. Remover espaços em branco
  str = str.replace(/\s/g, '');
  
  // 3. Tratar separadores decimais e de milhar de forma inteligente
  // Se houver tanto ponto quanto vírgula, o último é o decimal
  const lastComma = str.lastIndexOf(',');
  const lastDot = str.lastIndexOf('.');
  
  if (lastComma > lastDot) {
    // Formato BR: 1.234,56
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // Formato US: 1,234.56
    str = str.replace(/,/g, '');
  } else if (lastComma !== -1) {
    // Apenas vírgula: 1234,56
    str = str.replace(',', '.');
  }
  // Se apenas ponto ou nenhum, parseFloat já resolve
  
  // 4. Converter para float
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
};

export const mapData = (rawRows: any[], mapping: ColumnMapping): CTEData[] => {
  return rawRows.map(row => ({
    cte: String(row[mapping.cte] || '').trim(),
    freteEmpresa: sanitizeValue(row[mapping.freteEmpresa]),
    freteMotorista: sanitizeValue(row[mapping.freteMotorista]),
    margem: sanitizeValue(row[mapping.margem]),
    raw: row
  })).filter(item => item.cte !== '');
};

export const performAudit = (dataA: CTEData[], dataB: CTEData[]): AuditResult[] => {
  const mapA = new Map(dataA.map(d => [d.cte, d]));
  const mapB = new Map(dataB.map(d => [d.cte, d]));
  
  const allCtes = new Set([...mapA.keys(), ...mapB.keys()]);
  const results: AuditResult[] = [];

  allCtes.forEach(cte => {
    const itemA = mapA.get(cte);
    const itemB = mapB.get(cte);

    if (itemA && !itemB) {
      results.push({
        cte,
        status: 'A_ONLY',
        sistemaA: itemA,
        divergencias: {}
      });
    } else if (!itemA && itemB) {
      results.push({
        cte,
        status: 'B_ONLY',
        sistemaB: itemB,
        divergencias: {}
      });
    } else if (itemA && itemB) {
      const diffEmpresa = Math.abs(itemA.freteEmpresa - itemB.freteEmpresa);
      const diffMotorista = Math.abs(itemA.freteMotorista - itemB.freteMotorista);
      const diffMargem = Math.abs(itemA.margem - itemB.margem);

      // Arredonda para 2 casas decimais para evitar problemas de precisão de ponto flutuante
      const diffEmpresaRounded = Math.round(diffEmpresa * 100) / 100;
      const diffMotoristaRounded = Math.round(diffMotorista * 100) / 100;
      const diffMargemRounded = Math.round(diffMargem * 100) / 100;

      const isDivergent = diffEmpresaRounded > 0.00 || diffMotoristaRounded > 0.00 || diffMargemRounded > 0.00;

      results.push({
        cte,
        status: isDivergent ? 'BOTH_DIVERGENT' : 'BOTH_MATCH',
        sistemaA: itemA,
        sistemaB: itemB,
        divergencias: {
          freteEmpresa: diffEmpresaRounded > 0.00 ? diffEmpresaRounded : undefined,
          freteMotorista: diffMotoristaRounded > 0.00 ? diffMotoristaRounded : undefined,
          margem: diffMargemRounded > 0.00 ? diffMargemRounded : undefined,
        }
      });
    }
  });

  return results;
};

export const detectSequentialGaps = (ctes: string[]): string[] => {
  const numbers = ctes
    .map(c => parseInt(c.replace(/\D/g, '')))
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b);
  
  if (numbers.length < 2) return [];
  
  const gaps: string[] = [];
  for (let i = 0; i < numbers.length - 1; i++) {
    const current = numbers[i];
    const next = numbers[i + 1];
    
    if (next - current > 1) {
      if (next - current === 2) {
        gaps.push(String(current + 1));
      } else {
        gaps.push(`${current + 1} a ${next - 1}`);
      }
    }
  }
  return gaps;
};

export const exportToExcel = (results: AuditResult[]) => {
  const exportData = results.map(r => ({
    'CTE': r.cte,
    'Status': r.status === 'A_ONLY' ? 'Apenas Sistema A' : 
              r.status === 'B_ONLY' ? 'Apenas Sistema B' : 
              r.status === 'BOTH_DIVERGENT' ? 'Divergente' : 'Conciliado',
    'Frete Empresa (A)': r.sistemaA?.freteEmpresa || 0,
    'Frete Empresa (B)': r.sistemaB?.freteEmpresa || 0,
    'Diferença Empresa': r.divergencias.freteEmpresa || 0,
    'Frete Motorista (A)': r.sistemaA?.freteMotorista || 0,
    'Frete Motorista (B)': r.sistemaB?.freteMotorista || 0,
    'Diferença Motorista': r.divergencias.freteMotorista || 0,
    'Margem (A)': r.sistemaA?.margem || 0,
    'Margem (B)': r.sistemaB?.margem || 0,
    'Diferença Margem': r.divergencias.margem || 0,
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Auditoria");
  XLSX.writeFile(workbook, `Auditoria_Frete_${new Date().toISOString().split('T')[0]}.xlsx`);
};
