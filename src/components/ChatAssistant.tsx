import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Bot, User, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AuditResult, AuditSummary } from '@/src/types';
import { chatWithAuditor } from '../services/geminiService';

interface Message {
  role: 'user' | 'model';
  content: string;
}

interface ChatAssistantProps {
  results: AuditResult[];
  summary: AuditSummary;
}

export const ChatAssistant: React.FC<ChatAssistantProps> = ({ results, summary }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', content: 'Olá! Sou seu assistente de IA. Carregue seus relatórios na aba "Auditoria" e me faça perguntas sobre os dados.' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || results.length === 0) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      // Preparar dados resumidos para a IA (removendo o 'raw' para economizar tokens)
      const simplifiedResults = results.slice(0, 150).map(r => ({
        cte: r.cte,
        status: r.status,
        empresaA: r.sistemaA?.freteEmpresa,
        empresaB: r.sistemaB?.freteEmpresa,
        motoristaA: r.sistemaA?.freteMotorista,
        motoristaB: r.sistemaB?.freteMotorista,
        margemA: r.sistemaA?.margem,
        margemB: r.sistemaB?.margem,
        diffEmpresa: r.divergencias.freteEmpresa,
        diffMotorista: r.divergencias.freteMotorista,
        diffMargem: r.divergencias.margem
      }));

      const contents = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
      }));
      contents.push({ role: 'user', parts: [{ text: userMsg }] });

      const aiResponse = await chatWithAuditor(contents, summary, simplifiedResults);
      setMessages(prev => [...prev, { role: 'model', content: aiResponse || 'Desculpe, não consegui gerar uma resposta.' }]);
    } catch (error) {
      console.error("Erro no chat:", error);
      setMessages(prev => [...prev, { role: 'model', content: 'Ocorreu um erro ao processar sua pergunta. Verifique se os arquivos não são muito grandes ou tente novamente.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="flex flex-col h-[600px] border-zinc-200 shadow-sm rounded-xl overflow-hidden">
      <CardHeader className="bg-indigo-50/50 border-b border-indigo-100 pb-4">
        <CardTitle className="flex items-center gap-2 font-heading text-lg text-indigo-900">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <Sparkles className="h-5 w-5 text-indigo-600" />
          </div>
          Assistente IA
        </CardTitle>
        <CardDescription>Faça perguntas sobre os relatórios carregados</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden bg-zinc-50/30">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={cn("flex gap-3 max-w-[85%]", msg.role === 'user' ? "ml-auto flex-row-reverse" : "")}>
              <div className={cn("flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center shadow-sm", msg.role === 'user' ? "bg-indigo-600 text-white" : "bg-white border border-zinc-200 text-indigo-600")}>
                {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>
              <div className={cn("p-3 rounded-2xl text-sm shadow-sm", msg.role === 'user' ? "bg-indigo-600 text-white rounded-tr-none" : "bg-white border border-zinc-100 text-zinc-800 rounded-tl-none")}>
                {msg.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3 max-w-[80%]">
              <div className="flex-shrink-0 h-8 w-8 rounded-full bg-white border border-zinc-200 text-indigo-600 flex items-center justify-center shadow-sm">
                <Bot className="h-4 w-4" />
              </div>
              <div className="p-4 rounded-2xl text-sm bg-white border border-zinc-100 text-zinc-800 rounded-tl-none flex items-center gap-1.5 shadow-sm">
                <div className="h-2 w-2 bg-indigo-400 rounded-full animate-bounce" />
                <div className="h-2 w-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                <div className="h-2 w-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className="p-4 bg-white border-t border-zinc-100">
          <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2">
            <Input 
              value={input} 
              onChange={(e) => setInput(e.target.value)} 
              placeholder={results.length ? "Pergunte algo sobre os dados (ex: Qual o CTE com maior divergência?)" : "Carregue os relatórios primeiro..."}
              disabled={isLoading || results.length === 0}
              className="flex-1 border-zinc-200 focus-visible:ring-indigo-500"
            />
            <Button type="submit" disabled={isLoading || !input.trim() || results.length === 0} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
};
