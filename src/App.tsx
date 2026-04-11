import React, { useState, useEffect, useMemo } from 'react';
import { FileUpload } from './components/FileUpload';
import { KPISection } from './components/KPISection';
import { AuditTable } from './components/AuditTable';
import { ColumnMapper } from './components/ColumnMapper';
import { parseFile, mapData, performAudit, exportToExcel, detectSequentialGaps } from './services/freightService';
import { autoMapColumns } from './services/geminiService';
import { DashboardCharts } from './components/DashboardCharts';
import { ChatAssistant } from './components/ChatAssistant';
import { CTEData, ColumnMapping, AuditResult, AuditSummary, SavedAudit } from './types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Download, Play, RefreshCcw, FileSpreadsheet, Sparkles, LogIn, LogOut, History, Save, User as UserIcon, Truck, MessageSquare, CheckCircle2, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { useFirebase } from './contexts/FirebaseContext';
import { db, collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp } from './firebase';
import { cn } from '@/lib/utils';

const DEFAULT_MAPPING: ColumnMapping = {
  cte: '',
  freteEmpresa: '',
  freteMotorista: '',
  margem: ''
};

export default function App() {
  const { user, login, logout, loading: authLoading } = useFirebase();
  
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  
  const [rawA, setRawA] = useState<any[]>([]);
  const [rawB, setRawB] = useState<any[]>([]);
  
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
        .then(setRawA)
        .catch(err => {
          console.error(err);
          setErrorMessage("Erro ao processar o arquivo A: " + err.message);
          setFileA(null);
        })
        .finally(() => setIsParsingA(false));
    } else {
      setRawA([]);
    }
  }, [fileA]);

  useEffect(() => {
    if (fileB) {
      setResults([]); // Clear results when new file is uploaded
      setIsParsingB(true);
      parseFile(fileB)
        .then(setRawB)
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
        if (lower.includes('cte') || lower.includes('numero')) mapping.cte = col;
        if (lower.includes('normal') || lower.includes('empresa') || lower.includes('frete_emp')) mapping.freteEmpresa = col;
        if (lower.includes('motorista') || lower.includes('mot')) mapping.freteMotorista = col;
        if (lower.includes('margem')) mapping.margem = col;
      });
      setMappingA(mapping);
    }
  }, [columnsA]);

  useEffect(() => {
    if (columnsB.length > 0) {
      const mapping = { ...DEFAULT_MAPPING };
      columnsB.forEach(col => {
        const lower = col.toLowerCase();
        if (lower.includes('cte') || lower.includes('numero')) mapping.cte = col;
        if (lower.includes('conta') || lower.includes('frete') || lower.includes('empresa')) mapping.freteEmpresa = col;
        if (lower.includes('motorista') || lower.includes('mot')) mapping.freteMotorista = col;
        if (lower.includes('margem')) mapping.margem = col;
      });
      setMappingB(mapping);
    }
  }, [columnsB]);

  const handleAiAutoMap = async (system: 'A' | 'B') => {
    const cols = system === 'A' ? columnsA : columnsB;
    if (cols.length === 0) return;

    try {
      const mapping = await autoMapColumns(cols);
      if (system === 'A') setMappingA(prev => ({ ...prev, ...mapping }));
      else setMappingB(prev => ({ ...prev, ...mapping }));
    } catch (error) {
      console.error("Erro no AI Auto-Map:", error);
    }
  };

  const handleAudit = () => {
    setIsProcessing(true);
    setTimeout(() => {
      const dataA = mapData(rawA, mappingA);
      const dataB = mapData(rawB, mappingB);
      const auditResults = performAudit(dataA, dataB);
      setResults(auditResults);
      setIsProcessing(false);
      
      // Check for 100% match
      const is100PercentMatch = auditResults.length > 0 && 
        auditResults.every(r => r.status === 'BOTH_MATCH');
        
      if (is100PercentMatch) {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#10b981', '#34d399', '#059669']
        });
      }
    }, 800);
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

  const summary: AuditSummary = useMemo(() => {
    let valorTotalDivergencia = 0;
    let margemTotal = 0;

    results.forEach(r => {
      if (r.divergencias.freteEmpresa) valorTotalDivergencia += r.divergencias.freteEmpresa;
      if (r.divergencias.freteMotorista) valorTotalDivergencia += r.divergencias.freteMotorista;
      // Not adding margin diff to total monetary divergence as it might be a percentage or just a different metric, 
      // but let's add it if it's monetary. Assuming it's monetary based on context.
      if (r.divergencias.margem) valorTotalDivergencia += r.divergencias.margem;

      if (r.sistemaA?.margem) margemTotal += r.sistemaA.margem;
    });

    const lacunasSequenciais = detectSequentialGaps(results.map(r => r.cte));

    return {
      totalAnalizados: results.length,
      faltantes: results.filter(r => r.status === 'A_ONLY' || r.status === 'B_ONLY').length,
      divergencias: results.filter(r => r.status === 'BOTH_DIVERGENT').length,
      valorTotalDivergencia,
      margemTotal,
      lacunasSequenciais
    };
  }, [results]);

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
          <div className="flex items-center gap-4">
            {authLoading ? (
              <div className="h-10 w-10 animate-pulse rounded-full bg-zinc-200" />
            ) : user ? (
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-zinc-900">{user.displayName}</p>
                  <p className="text-xs text-zinc-500">{user.email}</p>
                </div>
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || ''} className="h-10 w-10 rounded-full border border-zinc-200 shadow-sm" referrerPolicy="no-referrer" />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center shadow-sm">
                    <UserIcon className="h-5 w-5 text-zinc-500" />
                  </div>
                )}
                <Button variant="ghost" size="icon" onClick={logout} title="Sair" className="text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100">
                  <LogOut className="h-5 w-5" />
                </Button>
              </div>
            ) : (
              <Button onClick={login} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm rounded-lg">
                <LogIn className="mr-2 h-4 w-4" /> Entrar com Google
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
            <TabsTrigger value="ai-assistant" className="flex items-center gap-2 rounded-md data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">
              <MessageSquare className="h-4 w-4" /> Assistente IA
            </TabsTrigger>
            {user && (
              <TabsTrigger value="history" className="flex items-center gap-2 rounded-md data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">
                <History className="h-4 w-4" /> Histórico
              </TabsTrigger>
            )}
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
                    {user && (
                      <Button variant="outline" onClick={saveAudit} disabled={isSaving} className="border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                        <Save className={cn("mr-2 h-4 w-4", isSaving && "animate-spin")} />
                        {isSaving ? "Salvando..." : "Salvar no Histórico"}
                      </Button>
                    )}
                    <Button onClick={() => exportToExcel(results)} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
                      <Download className="mr-2 h-4 w-4" /> Exportar XLSX
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
                    Relatório Sistema A
                  </CardTitle>
                  <CardDescription>Upload do relatório principal da empresa</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  <FileUpload 
                    label="Sistema A (Empresa)" 
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
                        A IA não conseguiu extrair tabelas deste arquivo. Verifique se o PDF possui texto selecionável (não é apenas uma foto/scan) ou tente outro formato.
                      </p>
                    </div>
                  )}
                  {!isParsingA && columnsA.length > 0 && (
                    <div className="space-y-4 bg-zinc-50 p-4 rounded-lg border border-zinc-100">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-zinc-700">Mapeamento de Colunas</span>
                        <Button variant="ghost" size="sm" onClick={() => handleAiAutoMap('A')} className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50">
                          <Sparkles className="mr-2 h-4 w-4" /> IA Auto-Map
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
                    Relatório Sistema B
                  </CardTitle>
                  <CardDescription>Upload do relatório de conferência</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  <FileUpload 
                    label="Sistema B (Conferência)" 
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
                        A IA não conseguiu extrair tabelas deste arquivo. Verifique se o PDF possui texto selecionável (não é apenas uma foto/scan) ou tente outro formato.
                      </p>
                    </div>
                  )}
                  {!isParsingB && columnsB.length > 0 && (
                    <div className="space-y-4 bg-zinc-50 p-4 rounded-lg border border-zinc-100">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-zinc-700">Mapeamento de Colunas</span>
                        <Button variant="ghost" size="sm" onClick={() => handleAiAutoMap('B')} className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50">
                          <Sparkles className="mr-2 h-4 w-4" /> IA Auto-Map
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
                className="px-12 py-6 text-lg font-heading font-semibold shadow-md transition-all hover:scale-105 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <RefreshCcw className="mr-2 h-6 w-6 animate-spin" />
                ) : (
                  <Play className="mr-2 h-6 w-6" />
                )}
                {isProcessing ? "Processando..." : "Iniciar Auditoria"}
              </Button>
              {!canAudit && (fileA || fileB) && !isProcessing && (
                <p className="text-xs text-zinc-500 animate-pulse">
                  {!fileA || !fileB ? "Carregue os dois arquivos para continuar." : 
                   (!mappingA.cte || !mappingB.cte) ? "Certifique-se de mapear a coluna 'CTE' em ambos os arquivos." : 
                   "Aguardando extração de dados..."}
                </p>
              )}
            </div>

            <AnimatePresence>
              {results.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-8"
                >
                  <KPISection summary={summary} />
                  
                  {summary.divergencias === 0 && summary.faltantes === 0 && results.length > 0 && (
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-2 shadow-sm"
                    >
                      <div className="bg-emerald-100 p-3 rounded-full">
                        <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                      </div>
                      <h3 className="text-xl font-bold text-emerald-800 font-heading">Auditoria 100% Conciliada!</h3>
                      <p className="text-emerald-600 font-medium">Nenhuma divergência ou CTE faltante encontrado. Excelente trabalho!</p>
                    </motion.div>
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
                      <AuditTable results={results} />
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </TabsContent>

          <TabsContent value="ai-assistant" className="space-y-6">
            <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm">
              <h2 className="text-xl font-semibold font-heading text-zinc-800">Assistente IA</h2>
              <p className="text-sm text-zinc-500">Converse com a inteligência artificial para analisar os relatórios carregados.</p>
            </div>
            <ChatAssistant results={results} summary={summary} />
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm">
              <h2 className="text-xl font-semibold font-heading text-zinc-800">Histórico de Auditorias</h2>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {history.map((audit) => (
                <Card 
                  key={audit.id} 
                  className="cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all rounded-xl border-zinc-200" 
                  onClick={() => {
                    setResults(audit.results);
                    setActiveTab("audit");
                  }}
                >
                  <CardHeader className="bg-zinc-50/50 border-b border-zinc-100 pb-4">
                    <CardTitle className="text-base font-heading text-zinc-800">{audit.name}</CardTitle>
                    <CardDescription className="text-xs mt-1">
                      {audit.createdAt?.toDate().toLocaleString() || "Processando..."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex justify-between items-center text-sm p-2 bg-rose-50 rounded-lg">
                      <span className="text-rose-700 font-medium">Divergências</span>
                      <span className="font-bold text-rose-700 bg-white px-2 py-0.5 rounded-md shadow-sm">{audit.summary.divergencias}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm p-2 bg-amber-50 rounded-lg">
                      <span className="text-amber-700 font-medium">Faltantes</span>
                      <span className="font-bold text-amber-700 bg-white px-2 py-0.5 rounded-md shadow-sm">{audit.summary.faltantes}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {history.length === 0 && (
                <div className="col-span-full py-16 text-center bg-white rounded-xl border border-zinc-200 border-dashed">
                  <History className="h-12 w-12 text-zinc-300 mx-auto mb-4" />
                  <p className="text-zinc-500 font-medium">Nenhuma auditoria salva encontrada.</p>
                  <p className="text-sm text-zinc-400 mt-1">Realize uma auditoria e clique em "Salvar no Histórico".</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
