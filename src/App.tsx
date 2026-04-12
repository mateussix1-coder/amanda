import React, { useState, useEffect, useMemo } from 'react';
import { FileUpload } from './components/FileUpload';
import { KPISection } from './components/KPISection';
import { AuditTable } from './components/AuditTable';
import { ColumnMapper } from './components/ColumnMapper';
import { parseFile, mapData, performAudit, exportToExcel, exportToPDF, shareToWhatsApp, detectSequentialGaps, calculateSummary } from './services/freightService';
import { autoMapColumns } from './services/extractionService';
import { DashboardCharts } from './components/DashboardCharts';
import { HelpCenter } from './components/HelpCenter';
import { CTEData, ColumnMapping, AuditResult, AuditSummary, SavedAudit } from './types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Download, Play, RefreshCcw, FileSpreadsheet, LogIn, LogOut, History, Save, User as UserIcon, Truck, MessageSquare, CheckCircle2, Loader2, FileText, Share2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { useFirebase } from './contexts/FirebaseContext';
import { db, collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp } from './firebase';
import { cn } from '@/lib/utils';

const DEFAULT_MAPPING: ColumnMapping = {
  cte: '',
  freteEmpresa: '',
  freteMotorista: '',
  margem: '',
  peso: ''
};

export default function App() {
  const { user, login, logout, loading: authLoading } = useFirebase();
  
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  
  const [rawA, setRawA] = useState<any[]>([]);
  const [rawB, setRawB] = useState<any[]>([]);
  const [footerTotalA, setFooterTotalA] = useState<number>(0);
  
  const [mappingA, setMappingA] = useState<ColumnMapping>(DEFAULT_MAPPING);
  const [mappingB, setMappingB] = useState<ColumnMapping>(DEFAULT_MAPPING);
  
  const [results, setResults] = useState<AuditResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isParsingA, setIsParsingA] = useState(false);
  const [isParsingB, setIsParsingB] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<SavedAudit[]>([]);
  const [activeTab, setActiveTab] = useState("audit");

  const columnsA = useMemo(() => rawA.length > 0 ? Object.keys(rawA[0]) : [], [rawA]);
  const columnsB = useMemo(() => rawB.length > 0 ? Object.keys(rawB[0]) : [], [rawB]);

  useEffect(() => {
    if (fileA) {
      setResults([]); // Clear results when new file is uploaded
      setIsParsingA(true);
      parseFile(fileA)
        .then(res => {
          setRawA(res.data);
          if (res.footerTotal) setFooterTotalA(res.footerTotal);
        })
        .catch(err => {
          console.error(err);
          setErrorMessage("Erro ao processar o arquivo A: " + err.message);
          setFileA(null);
        })
        .finally(() => setIsParsingA(false));
    } else {
      setRawA([]);
      setFooterTotalA(0);
    }
  }, [fileA]);

  useEffect(() => {
    if (fileB) {
      setResults([]); // Clear results when new file is uploaded
      setIsParsingB(true);
      parseFile(fileB)
        .then(res => setRawB(res.data))
        .catch(err => {
          console.error(err);
          setErrorMessage("Erro ao processar o arquivo B: " + err.message);
          setFileB(null);
        })
        .finally(() => setIsParsingB(false));
    } else {
      setRawB([]);
    }
  }, [fileB]);

  // Load history
  useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }

    const q = query(
      collection(db, 'audits'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const audits = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SavedAudit[];
      setHistory(audits);
    });

    return unsubscribe;
  }, [user]);

  // Auto-mapping logic
  useEffect(() => {
    if (columnsA.length > 0) {
      const mapping = { ...DEFAULT_MAPPING };
      columnsA.forEach(col => {
        const lower = col.toLowerCase();
        if (lower === 'ctrc' || lower === 'cte' || lower.includes('numero') || lower.includes('documento')) mapping.cte = col;
        if (lower === 'frete empr.' || lower.includes('frete empr') || lower.includes('empresa')) mapping.freteEmpresa = col;
        if (lower === 'frete mot.' || lower.includes('frete mot') || lower.includes('motorista')) mapping.freteMotorista = col;
        if (lower.includes('margem') || lower === '%' || lower.includes('result')) mapping.margem = col;
        if (lower.includes('peso') || lower.includes('ton') || lower.includes('kg')) mapping.peso = col;
      });
      setMappingA(mapping);
    }
  }, [columnsA]);

  useEffect(() => {
    if (columnsB.length > 0) {
      const mapping = { ...DEFAULT_MAPPING };
      columnsB.forEach(col => {
        const lower = col.toLowerCase();
        if (lower === 'cte' || lower === 'ctrc' || lower.includes('numero') || lower.includes('documento')) mapping.cte = col;
        if (lower === 'valor frete' || lower.includes('valor frete') || lower.includes('empresa')) mapping.freteEmpresa = col;
        if (lower === 'vl carreteiro líquido' || lower.includes('carreteiro líq') || lower.includes('motorista')) mapping.freteMotorista = col;
        if (lower.includes('margem') || lower === '%' || lower.includes('result')) mapping.margem = col;
        if (lower.includes('peso') || lower.includes('ton') || lower.includes('kg')) mapping.peso = col;
      });
      setMappingB(mapping);
    }
  }, [columnsB]);

  const handleAutoMap = async (system: 'A' | 'B') => {
    const cols = system === 'A' ? columnsA : columnsB;
    if (cols.length === 0) return;

    try {
      const mapping = await autoMapColumns(cols);
      if (system === 'A') setMappingA(prev => ({ ...prev, ...mapping }));
      else setMappingB(prev => ({ ...prev, ...mapping }));
    } catch (error) {
      console.error("Erro no Mapeamento Automático:", error);
    }
  };

  const handleAudit = () => {
    if (isParsingA || isParsingB) return;
    setIsProcessing(true);
    setTimeout(() => {
      try {
        const dataA = mapData(rawA, mappingA);
        const dataB = mapData(rawB, mappingB);
        const auditResults = performAudit(dataA, dataB);
        setResults(auditResults);
        setIsProcessing(false);
        
        // Scroll to results
        const resultsElement = document.getElementById('audit-results');
        if (resultsElement) {
          resultsElement.scrollIntoView({ behavior: 'smooth' });
        }

        // Check for 100% match
        const is100PercentMatch = auditResults.length > 0 && 
          auditResults.every(r => r.status === 'BOTH_MATCH');
          
        if (is100PercentMatch) {
          try {
            confetti({
              particleCount: 150,
              spread: 70,
              origin: { y: 0.6 },
              colors: ['#10b981', '#34d399', '#059669']
            });
          } catch (e) {
            console.error("Confetti error:", e);
          }
        }
      } catch (error) {
        console.error("Audit processing error:", error);
        setErrorMessage("Erro ao processar auditoria: " + (error as Error).message);
        setIsProcessing(false);
      }
    }, 800);
  };

  const handleUpdateResult = (updatedResult: AuditResult) => {
    setResults(prev => prev.map(r => r.cte === updatedResult.cte ? updatedResult : r));
  };

  const saveAudit = async () => {
    if (!user || results.length === 0) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'audits'), {
        userId: user.uid,
        name: `Auditoria ${new Date().toLocaleString('pt-BR')}`,
        summary,
        results: results, // Salvando todos os resultados para manter os gráficos precisos no histórico
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error saving audit:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const resetAudit = () => {
    setFileA(null);
    setFileB(null);
    setRawA([]);
    setRawB([]);
    setResults([]);
    setErrorMessage(null);
    setFooterTotalA(0);
    setActiveTab("audit");
  };

  const summary: AuditSummary = useMemo(() => {
    return calculateSummary(results, footerTotalA);
  }, [results, footerTotalA]);

  const canAudit = rawA.length > 0 && rawB.length > 0 && 
                  mappingA.cte && mappingB.cte;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans">
      <header className="bg-white border-b border-zinc-200 shadow-sm sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-4 md:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 p-2.5 rounded-xl shadow-sm">
              <Truck className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 font-heading">Amanda Gestão</h1>
              <p className="text-sm text-zinc-500 font-medium hidden sm:block">Auditoria de Transportes</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {(fileA || fileB || results.length > 0) && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={resetAudit}
                className="hidden sm:flex border-zinc-200 text-zinc-600 hover:bg-zinc-50 rounded-xl"
              >
                <RefreshCcw className="mr-2 h-4 w-4" />
                Nova Auditoria
              </Button>
            )}
            {user ? (
              <div className="flex items-center gap-3">
                <div className="hidden md:flex flex-col items-end">
                  <span className="text-sm font-bold text-zinc-900">{user.displayName || user.email}</span>
                  <span className="text-[10px] text-zinc-500 font-medium">Usuário Verificado</span>
                </div>
                <Button variant="ghost" size="icon" onClick={logout} className="rounded-full hover:bg-zinc-100">
                  <LogOut className="h-5 w-5 text-zinc-600" />
                </Button>
              </div>
            ) : (
              <Button onClick={login} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm">
                <LogIn className="mr-2 h-4 w-4" />
                Entrar
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4 md:p-8 space-y-8">
        {errorMessage && (
          <div className="p-4 bg-red-100 text-red-700 rounded-md border border-red-200 flex items-center justify-between">
            <span>{errorMessage}</span>
            <Button variant="ghost" size="sm" onClick={() => setErrorMessage(null)}>X</Button>
          </div>
        )}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-8 bg-white border border-zinc-200 shadow-sm rounded-lg p-1">
            <TabsTrigger value="audit" className="flex items-center gap-2 rounded-md data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">
              <FileSpreadsheet className="h-4 w-4" /> Auditoria
            </TabsTrigger>
            <TabsTrigger value="help-center" className="flex items-center gap-2 rounded-md data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">
              <MessageSquare className="h-4 w-4" /> Suporte Técnico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="audit" className="space-y-8">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-zinc-200 shadow-sm">
              <h2 className="text-xl font-semibold font-heading text-zinc-800">Nova Auditoria</h2>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setFileA(null); setFileB(null);
                    setRawA([]); setRawB([]);
                    setResults([]);
                  }}
                  className="border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                >
                  <RefreshCcw className="mr-2 h-4 w-4" /> Limpar
                </Button>
                {results.length > 0 && (
                  <div className="flex gap-2">
                    <Button onClick={() => exportToExcel(results)} variant="outline" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                      <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
                    </Button>
                    <Button onClick={() => exportToPDF(results, summary)} variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50">
                      <FileText className="mr-2 h-4 w-4" /> PDF
                    </Button>
                    <Button onClick={() => shareToWhatsApp(results, summary)} className="bg-green-600 hover:bg-green-700 text-white shadow-sm">
                      <Share2 className="mr-2 h-4 w-4" /> WhatsApp
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
              <Card className="border-zinc-200 shadow-sm rounded-xl overflow-hidden">
                <CardHeader className="bg-zinc-50/50 border-b border-zinc-100">
                  <CardTitle className="flex items-center gap-2 font-heading text-lg">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                    </div>
                    Sistema A (Relatório DL)
                  </CardTitle>
                  <CardDescription>Upload do relatório principal da empresa (atua go.pdf)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  <FileUpload 
                    label="Sistema A (Relatório DL)" 
                    selectedFile={fileA} 
                    onFileSelect={setFileA} 
                  />
                  {isParsingA && (
                    <div className="flex items-center justify-center p-4 text-sm text-indigo-600 bg-indigo-50 rounded-lg border border-indigo-100">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Extraindo dados do arquivo...
                    </div>
                  )}
                  {!isParsingA && fileA && columnsA.length === 0 && (
                    <div className="p-4 bg-amber-50 text-amber-700 rounded-lg border border-amber-200 text-sm flex flex-col gap-2">
                      <div className="flex items-center gap-2 font-semibold">
                        <RefreshCcw className="h-4 w-4" />
                        <span>Nenhum dado identificado no Sistema A.</span>
                      </div>
                      <p className="text-xs opacity-90">
                        O sistema não conseguiu extrair tabelas deste arquivo. Verifique se o PDF possui texto selecionável (não é apenas uma foto/scan) ou tente outro formato.
                      </p>
                    </div>
                  )}
                  {!isParsingA && columnsA.length > 0 && (
                    <div className="space-y-4 bg-zinc-50 p-4 rounded-lg border border-zinc-100">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-zinc-700">Mapeamento de Colunas</span>
                        <Button variant="ghost" size="sm" onClick={() => handleAutoMap('A')} className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50">
                          <RefreshCcw className="mr-2 h-4 w-4" /> Mapeamento Automático
                        </Button>
                      </div>
                      <ColumnMapper 
                        title="" 
                        columns={columnsA} 
                        mapping={mappingA} 
                        onMappingChange={setMappingA} 
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-zinc-200 shadow-sm rounded-xl overflow-hidden">
                <CardHeader className="bg-zinc-50/50 border-b border-zinc-100">
                  <CardTitle className="flex items-center gap-2 font-heading text-lg">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <FileSpreadsheet className="h-5 w-5 text-purple-600" />
                    </div>
                    Sistema B (Relatório Carreteiro)
                  </CardTitle>
                  <CardDescription>Upload do relatório de conferência (gw go.pdf)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  <FileUpload 
                    label="Sistema B (Relatório Carreteiro)" 
                    selectedFile={fileB} 
                    onFileSelect={setFileB} 
                  />
                  {isParsingB && (
                    <div className="flex items-center justify-center p-4 text-sm text-purple-600 bg-purple-50 rounded-lg border border-purple-100">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Extraindo dados do arquivo...
                    </div>
                  )}
                  {!isParsingB && fileB && columnsB.length === 0 && (
                    <div className="p-4 bg-amber-50 text-amber-700 rounded-lg border border-amber-200 text-sm flex flex-col gap-2">
                      <div className="flex items-center gap-2 font-semibold">
                        <RefreshCcw className="h-4 w-4" />
                        <span>Nenhum dado identificado no Sistema B.</span>
                      </div>
                      <p className="text-xs opacity-90">
                        O sistema não conseguiu extrair tabelas deste arquivo. Verifique se o PDF possui texto selecionável (não é apenas uma foto/scan) ou tente outro formato.
                      </p>
                    </div>
                  )}
                  {!isParsingB && columnsB.length > 0 && (
                    <div className="space-y-4 bg-zinc-50 p-4 rounded-lg border border-zinc-100">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-zinc-700">Mapeamento de Colunas</span>
                        <Button variant="ghost" size="sm" onClick={() => handleAutoMap('B')} className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50">
                          <RefreshCcw className="mr-2 h-4 w-4" /> Mapeamento Automático
                        </Button>
                      </div>
                      <ColumnMapper 
                        title="" 
                        columns={columnsB} 
                        mapping={mappingB} 
                        onMappingChange={setMappingB} 
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col items-center gap-2 py-4">
              <Button 
                size="lg" 
                disabled={!canAudit || isProcessing} 
                onClick={handleAudit}
                className="px-12 py-6 text-lg font-heading font-semibold shadow-md transition-all hover:scale-105 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed min-w-[280px]"
              >
                {isProcessing ? (
                  <>
                    <RefreshCcw className="mr-2 h-6 w-6 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-6 w-6" />
                    Iniciar Auditoria
                  </>
                )}
              </Button>
              {!isProcessing && !canAudit && (fileA || fileB) && (
                <p className="text-xs text-zinc-500">
                  {!fileA || !fileB ? "Carregue os dois arquivos para continuar." : 
                   (!mappingA.cte || !mappingB.cte) ? "Mapeie a coluna 'CTE' em ambos os arquivos." : 
                   "Aguardando extração de dados..."}
                </p>
              )}
            </div>

            <div className="space-y-8" id="audit-results">
              {results.length > 0 && (
                <div className="space-y-8">
                  <KPISection summary={summary} />
                  
                  {summary.divergencias === 0 && summary.faltantes === 0 && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-2 shadow-sm">
                      <div className="bg-emerald-100 p-3 rounded-full">
                        <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                      </div>
                      <h3 className="text-xl font-bold text-emerald-800 font-heading">Auditoria 100% Conciliada!</h3>
                      <p className="text-emerald-600 font-medium">Nenhuma divergência ou CTE faltante encontrado. Excelente trabalho!</p>
                    </div>
                  )}

                  <DashboardCharts results={results} summary={summary} />

                  <Card className="border-zinc-200 shadow-sm rounded-xl overflow-hidden">
                    <CardHeader className="bg-zinc-50/50 border-b border-zinc-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="font-heading">Resultados da Auditoria</CardTitle>
                          <CardDescription>Tabela completa com filtros e pesquisa</CardDescription>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="outline" className="bg-white">{results.length} CTEs Totais</Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <AuditTable results={results} onUpdateResult={handleUpdateResult} />
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="help-center" className="space-y-6">
            <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm">
              <h2 className="text-xl font-semibold font-heading text-zinc-800">Suporte Técnico</h2>
              <p className="text-sm text-zinc-500">Tire dúvidas sobre os relatórios carregados para auxiliar na sua análise.</p>
            </div>
            <HelpCenter results={results} summary={summary} />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="mx-auto max-w-7xl px-4 md:px-8 py-8 border-t border-zinc-200 mt-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-zinc-500">© {new Date().getFullYear()} Amanda Gestão Logística. Todos os direitos reservados.</p>
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <span>Desenvolvido por</span>
            <span className="font-bold text-zinc-600">Mateus</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
