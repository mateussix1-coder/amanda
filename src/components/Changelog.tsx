import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, CheckCircle2, Zap, ShieldCheck, BarChart3, FileText } from 'lucide-react';

export const Changelog: React.FC = () => {
  const updates = [
    {
      title: "Novo Indicador: Diferença Empresa",
      description: "Adicionamos um card no topo que mostra o desvio total entre o que foi cobrado no Sistema A e o que consta no Sistema B.",
      icon: <BarChart3 className="h-5 w-5 text-emerald-600" />,
      tag: "Novo"
    },
    {
      title: "Restauração da Margem (B)",
      description: "A coluna de margem do relatório de carreteiro voltou à tabela, agora com destaque em vermelho para valores negativos, facilitando a identificação de prejuízos.",
      icon: <FileText className="h-5 w-5 text-blue-600" />,
      tag: "Melhoria"
    },
    {
      title: "Renomeação: Diferença Motorista",
      description: "O antigo 'Valor em Risco' agora se chama 'Diferença Motorista', tornando o indicador mais direto e fácil de explicar para a equipe.",
      icon: <Zap className="h-5 w-5 text-amber-600" />,
      tag: "Ajuste"
    },
    {
      title: "Mapeamento Automático Inteligente",
      description: "O sistema agora tenta identificar as colunas (CTE, Frete, Peso) automaticamente assim que você carrega os arquivos, economizando cliques.",
      icon: <Sparkles className="h-5 w-5 text-indigo-600" />,
      tag: "Produtividade"
    },
    {
      title: "Estabilidade para Múltiplos Usuários",
      description: "Implementamos um sistema de processamento em lotes para evitar que o servidor fique 'ocupado' quando várias pessoas usam a ferramenta ao mesmo tempo.",
      icon: <ShieldCheck className="h-5 w-5 text-rose-600" />,
      tag: "Estabilidade"
    },
    {
      title: "Relatórios Exportáveis Aprimorados",
      description: "Tanto o PDF quanto o Excel agora incluem as novas colunas e indicadores, garantindo que o relatório impresso seja idêntico ao que você vê na tela.",
      icon: <CheckCircle2 className="h-5 w-5 text-emerald-600" />,
      tag: "Concluído"
    }
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
        <h2 className="text-2xl font-bold font-heading text-zinc-800 flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-indigo-500" />
          O que mudou na ferramenta?
        </h2>
        <p className="text-zinc-500 mt-2">
          Acompanhe as últimas melhorias implementadas para tornar sua auditoria mais rápida e precisa.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {updates.map((update, index) => (
          <Card key={index} className="border-zinc-200 shadow-sm hover:shadow-md transition-shadow rounded-xl overflow-hidden">
            <CardHeader className="flex flex-row items-center gap-4 space-y-0 pb-2 bg-zinc-50/30 border-b border-zinc-100">
              <div className="p-2 bg-white rounded-lg border border-zinc-100 shadow-sm">
                {update.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-bold font-heading text-zinc-800">
                    {update.title}
                  </CardTitle>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 border border-zinc-200">
                    {update.tag}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <p className="text-sm text-zinc-600 leading-relaxed">
                {update.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex items-start gap-3">
        <Zap className="h-5 w-5 text-indigo-600 mt-0.5" />
        <div>
          <h4 className="text-sm font-bold text-indigo-900">Dica de Produtividade</h4>
          <p className="text-xs text-indigo-700 mt-1">
            Sempre que subir um arquivo novo, o sistema fará o mapeamento automático. Se alguma coluna não for identificada, você ainda pode ajustá-la manualmente na aba de Auditoria.
          </p>
        </div>
      </div>
    </div>
  );
};
