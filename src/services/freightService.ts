import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CTEData, ColumnMapping, AuditResult, AuditSummary } from '../types';
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

export const parseFile = async (file: File): Promise<{ data: any[], footerTotal?: number }> => {
  return new Promise(async (resolve, reject) => {
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (extension === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve({ data: results.data }),
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
        resolve({ data: json });
      };
      reader.onerror = (error) => reject(error);
      reader.readAsArrayBuffer(file);
    } else if (extension === 'pdf') {
      try {
        const pages = await extractPagesFromPDF(file);
        const allData: any[] = [];
        let footerTotal: number | undefined;
        
        // Processar em chunks de 10 páginas para reduzir o número de chamadas e economizar cota
        const chunkSize = 10;
        for (let i = 0; i < pages.length; i += chunkSize) {
          const chunk = pages.slice(i, i + chunkSize).join('\n');
          const chunkData = await parsePDFText(chunk);
          if (Array.isArray(chunkData)) {
            chunkData.forEach(item => {
              if (item.isFooter) {
                footerTotal = sanitizeValue(item.valorTotal);
              } else {
                allData.push(item);
              }
            });
          }
          // Pequeno delay para evitar hitting Rate Limit (RPM)
          if (i + chunkSize < pages.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        resolve({ data: allData, footerTotal });
    } catch (error: any) {
      console.error("Erro ao processar PDF:", error);
      let userMsg = "Falha ao extrair dados do PDF usando IA.";
      if (error.message?.includes("429") || error.message?.includes("quota")) {
        userMsg = "Limite de uso da IA atingido (Cota Grátis). Por favor, aguarde 1 minuto e tente novamente ou use um arquivo menor.";
      } else if (error.message?.includes("safety")) {
        userMsg = "O conteúdo do PDF foi bloqueado pelos filtros de segurança da IA.";
      }
      reject(new Error(`${userMsg} Detalhes: ${error.message || 'Erro desconhecido'}`));
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
    // Remove leading zeros and trim spaces for better matching (e.g., "000197" -> "197")
    cte: String(row[mapping.cte] || '').trim().replace(/^0+/, ''),
    freteEmpresa: sanitizeValue(row[mapping.freteEmpresa]),
    freteMotorista: sanitizeValue(row[mapping.freteMotorista]),
    margem: sanitizeValue(row[mapping.margem]),
    peso: sanitizeValue(row[mapping.peso]),
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
        diferencaMotorista: 0,
        divergencias: {}
      });
    } else if (!itemA && itemB) {
      results.push({
        cte,
        status: 'B_ONLY',
        sistemaB: itemB,
        diferencaMotorista: 0,
        divergencias: {}
      });
    } else if (itemA && itemB) {
      let pesoA = itemA.peso;
      let pesoB = itemB.peso;

      // Normalização de Peso (Ton vs Kg)
      // Se um valor estiver na casa dos milhares (Kg) e o outro em dezenas (Ton), normaliza para Ton
      if (pesoA > 0 && pesoB > 0) {
        if (pesoA >= pesoB * 100) pesoA = pesoA / 1000;
        if (pesoB >= pesoA * 100) pesoB = pesoB / 1000;
      }

      const diffEmpresa = Math.abs(itemA.freteEmpresa - itemB.freteEmpresa);
      const diffMotorista = Math.abs(itemA.freteMotorista - itemB.freteMotorista);
      const diffMargem = Math.abs(itemA.margem - itemB.margem);
      const diffPeso = Math.abs(pesoA - pesoB);

      // Arredonda para 2 casas decimais para evitar problemas de precisão de ponto flutuante
      const diffEmpresaRounded = Math.round(diffEmpresa * 100) / 100;
      const diffMotoristaRounded = Math.round(diffMotorista * 100) / 100;
      const diffMargemRounded = Math.round(diffMargem * 100) / 100;
      const diffPesoRounded = Math.round(diffPeso * 100) / 100;

      // Status é divergente apenas se houver diferença financeira real (Empresa ou Motorista)
      const isDivergent = diffEmpresaRounded > 0.00 || diffMotoristaRounded > 0.00;

      results.push({
        cte,
        status: isDivergent ? 'BOTH_DIVERGENT' : 'BOTH_MATCH',
        sistemaA: itemA,
        sistemaB: itemB,
        diferencaMotorista: itemA.freteMotorista - itemB.freteMotorista,
        divergencias: {
          freteEmpresa: diffEmpresaRounded > 0.00 ? diffEmpresaRounded : undefined,
          freteMotorista: diffMotoristaRounded > 0.00 ? diffMotoristaRounded : undefined,
          margem: diffMargemRounded > 0.00 ? diffMargemRounded : undefined,
          peso: diffPesoRounded > 0.00 ? diffPesoRounded : undefined,
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

export const exportToPDF = (results: AuditResult[], summary: AuditSummary) => {
  const doc = new jsPDF();
  
  // Título
  doc.setFontSize(18);
  doc.text('Relatório de Auditoria Logística', 14, 22);
  
  // Resumo
  doc.setFontSize(11);
  doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, 32);
  doc.text(`Total Analisados: ${summary.totalAnalizados}`, 14, 38);
  doc.text(`Faltantes: ${summary.faltantes}`, 14, 44);
  doc.text(`Divergências: ${summary.divergencias}`, 14, 50);
  doc.text(`Valor em Risco: R$ ${summary.valorTotalDivergencia.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 14, 56);
  
  if (summary.lacunasSequenciais && summary.lacunasSequenciais.length > 0) {
    doc.text(`Lacunas Sequenciais: ${summary.lacunasSequenciais.join(', ')}`, 14, 62);
  }

  // Tabela
  const tableData = results.map(r => [
    r.cte,
    r.status === 'A_ONLY' ? 'Faltante (B)' : r.status === 'B_ONLY' ? 'Faltante (A)' : r.status === 'BOTH_DIVERGENT' ? 'Divergente' : 'OK',
    r.sistemaA?.freteEmpresa?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || '-',
    r.sistemaB?.freteEmpresa?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || '-',
    r.sistemaA?.freteMotorista?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || '-',
    r.sistemaB?.freteMotorista?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || '-'
  ]);

  autoTable(doc, {
    startY: 70,
    head: [['CTE', 'Status', 'Empresa (A)', 'Empresa (B)', 'Motorista (A)', 'Motorista (B)']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [79, 70, 229] }, // Indigo-600
    styles: { fontSize: 9 }
  });

  doc.save(`Auditoria_Frete_${new Date().toISOString().split('T')[0]}.pdf`);
};

export const shareToWhatsApp = (results: AuditResult[], summary: AuditSummary) => {
  const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  
  let text = `*Relatório de Auditoria Logística*\n`;
  text += `Data: ${new Date().toLocaleDateString('pt-BR')}\n\n`;
  text += `*Resumo Executivo:*\n`;
  text += `📊 Total Analisados: ${summary.totalAnalizados}\n`;
  text += `⚠️ Faltantes: ${summary.faltantes}\n`;
  text += `❌ Divergências: ${summary.divergencias}\n`;
  text += `💰 Valor em Risco: ${formatCurrency(summary.valorTotalDivergencia)}\n\n`;

  if (summary.lacunasSequenciais && summary.lacunasSequenciais.length > 0) {
    text += `🔍 *Lacunas Sequenciais:* ${summary.lacunasSequenciais.join(', ')}\n\n`;
  }

  const issues = results.filter(r => r.status !== 'BOTH_MATCH');
  if (issues.length > 0) {
    text += `*Principais Problemas:*\n`;
    issues.slice(0, 10).forEach(r => {
      if (r.status === 'A_ONLY') text += `- CTE ${r.cte}: Faltante no Sistema B\n`;
      else if (r.status === 'B_ONLY') text += `- CTE ${r.cte}: Faltante no Sistema A\n`;
      else text += `- CTE ${r.cte}: Divergência de Valores\n`;
    });
    if (issues.length > 10) {
      text += `... e mais ${issues.length - 10} problemas.\n`;
    }
  } else {
    text += `✅ Nenhuma divergência encontrada. Tudo conciliado!\n`;
  }

  text += `\nGerado por Amanda Gestão`;

  const encodedText = encodeURIComponent(text);
  window.open(`https://wa.me/?text=${encodedText}`, '_blank');
};

export const calculateSummary = (results: AuditResult[], footerTotalA?: number): AuditSummary => {
  const totalAnalizados = results.length;
  const faltantes = results.filter(r => r.status === 'A_ONLY' || r.status === 'B_ONLY').length;
  const divergencias = results.filter(r => r.status === 'BOTH_DIVERGENT').length;
  
  // Valor em Risco = (Total CTEs apenas em A) + (Diferença absoluta entre Motorista A e B nos divergentes)
  let valorTotalDivergencia = 0;
  results.forEach(r => {
    if (r.status === 'A_ONLY' && r.sistemaA) {
      valorTotalDivergencia += r.sistemaA.freteEmpresa;
    } else if (r.status === 'BOTH_DIVERGENT') {
      valorTotalDivergencia += Math.abs(r.diferencaMotorista);
    }
  });

  const ctes = results.map(r => r.cte);
  const lacunasSequenciais = detectSequentialGaps(ctes);

  return {
    totalAnalizados,
    faltantes,
    divergencias,
    valorTotalDivergencia,
    margemTotal: footerTotalA || 0,
    lacunasSequenciais
  };
};
