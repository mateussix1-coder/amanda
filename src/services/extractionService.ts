import { GoogleGenAI, Type } from "@google/genai";

// Initialize processing engine lazily
let processingClient: GoogleGenAI | null = null;

const getProcessingClient = () => {
  if (!processingClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("Configuration missing. Data extraction will not work.");
    }
    processingClient = new GoogleGenAI({ apiKey: apiKey || 'dummy-key' });
  }
  return processingClient;
};

// autoMapColumns removed

const repairJson = (json: string): string => {
  let str = json.trim();
  
  // 1. Remover blocos de código markdown
  str = str.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  
  // 2. Tentar encontrar o início do JSON
  const firstBracket = str.indexOf('[');
  const firstBrace = str.indexOf('{');
  let start = -1;
  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) start = firstBracket;
  else if (firstBrace !== -1) start = firstBrace;
  
  if (start === -1) return "[]";
  str = str.substring(start);

  // 3. Balanceamento de parênteses para truncamento
  let stack: string[] = [];
  let inString = false;
  let escaped = false;
  let lastValidEnd = -1;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (escaped) { escaped = false; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (!inString) {
      if (char === '[' || char === '{') {
        stack.push(char === '[' ? ']' : '}');
      } else if (char === ']' || char === '}') {
        if (stack.length > 0 && stack[stack.length - 1] === char) {
          stack.pop();
          if (stack.length === 0) lastValidEnd = i;
        }
      }
    }
  }

  if (stack.length === 0 && lastValidEnd !== -1) {
    // Bem balanceado, mas pode ter lixo no final
    return str.substring(0, lastValidEnd + 1);
  }

  if (stack.length > 0) {
    // Se truncado, fechar na marra
    let repairedStr = str;
    while (stack.length > 0) {
       repairedStr += stack.pop();
    }
    return repairedStr;
  }
  
  return str;
};

export const parsePDFText = async (text: string) => {
  if (!text || text.trim().length < 10) {
    return [];
  }

  console.log("Processando texto (tamanho):", text.length);

  try {
    // FAST PATH: Regex Parser for known PDF structures to avoid LLM quota limits
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    // 1. Relatório Detalhado do CTRC
    if (text.includes("Relatório Detalhado do CTRC")) {
      const results: any[] = [];
      const rowRegex = /^(\d+)\s+(CT|CE|NFS)/;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (rowRegex.test(line)) {
          const parts = line.split(/\s+/);
          const cte = parts[0];
          
          // The columns are: Número T. Canc. Emissão Filial Agência Remetente Destinatário Pagador Placa Peso (Ton) Empr. Mot. Empr. Mot. Fr. Mot. Desc. ISSQN Ped. Empr.Corretor Vl. Base Comissão Imp. Custos Result. Cidade Origem Cidade Destino
          // It's a bit tricky because some fields have spaces.
          // Let's look for numbers near the end. Usually we can match the values using regex.
          // A sequence of numbers at the end typically ends with Result and Cidades.
          // Let's use a simpler approach: extract everything that looks like a decimal number.
          const numbers = line.match(/(?:-)?\d{1,3}(?:\.\d{3})*,\d{1,2}|(?:-)?\d+(?:\.\d+)?/g);
          
          if (numbers && numbers.length >= 5) {
            // Usually, "Frete Empr." and "Frete Mot." are around the middle, "Result." is near the end.
            // Since it might vary, let's extract the known structure if possible.
            // Example line:
            // 1752 CT 01/04/26 07:14 TR 21 / AG S 27116 / TRE 27116 / TRE 27116 / TRES T TGL1G79 46,900 23.919,00 24.839,65 510,00 ... -920,65 VERA / MT SANTOS / SP
            
            // Peso is after the plate. Empr. Mot. are the next two.
            
            const match = line.match(/([A-Z]{3}\d[A-Z0-9]\d{2}|[A-Z]{3}\d{4})\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)/);
            let peso = 0;
            let freteEmpresa = "0";
            let freteMotorista = "0";
            let margem = "0";
            
            if (match) {
              peso = parseFloat(match[2].replace(/\./g, '').replace(',', '.'));
              freteEmpresa = match[3];
              freteMotorista = match[4];
            }

            // Find Result at the end of numbers:
            // Result is usually the last number before "VERA / MT"
            const numMatch = line.match(/((?:-)?[\d\.]+,\d{2})\s+[A-Z\s\/]+$/);
            if (numMatch) {
              margem = numMatch[1];
            }

            results.push({
              cte,
              peso: String(peso),
              freteEmpresa,
              freteMotorista,
              margem,
              raw: line
            });
          }
        } else if (line.includes("Total") && line.includes("R$")) {
          // just ignore or parse footer
        }
      }
      
      if (results.length > 0) {
        // Find Footer
        const resultMatch = text.match(/Result(?:ado)?[\s\:]*(?:R\$)?\s*((?:-)?[\d\.]+,\d{2})/i);
        if (resultMatch) {
          results.push({
            isFooter: true,
            valorTotal: resultMatch[1]
          });
        }
        
        console.log("Fast path CTRC matched", results.length, "items");
        return results;
      }
    }
    
    // 2. Análise de CTe/NFS com impostos
    if (text.includes("Análise de CTe/NFS com impostos") || text.includes("CTe/NFS Emissão Remetente")) {
      const results: any[] = [];
      const rowRegex = /^0*(\d+)\s+\d{2}\/\d{2}\/\d{4}/; // 001752 01/04/2026
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const m = line.match(rowRegex);
        if (m) {
          const cte = m[1];
          // We know the columns:
          // CTe/NFS Emissão Remetente / Origem Destinatário / Destino Tipo Frete Peso / Kg Valor frete ICMS/ISS (%) Frete tab. PIS COFINS IR CSSL Vl Carreteiro Líquido
          // Let's extract numbers backwards
          // Líquido (%), Vl Carreteiro, CSSL, IR, COFINS, PIS, Frete tab., (%), ICMS/ISS, Valor frete, Peso / Kg
          
          const numbers = line.match(/(?:-)?\d{1,3}(?:\.\d{3})*,\d{1,2}%?|(?:-)?\d+,\d{2,3}%?/g);
          if (numbers && numbers.length >= 6) {
            const freteEmpresa = numbers[0]; // Valor frete is usually the first financial number after Peso
            const pesoMatch = line.match(/Combinado\s+([\d\.]+,\d+)\s+([\d\.]+,\d+)/);
            
            let peso = "0";
            let freteEmp = "0";
            let freteMot = "0";
            let margem = "0";
            
            if (pesoMatch) {
              peso = pesoMatch[1];
              freteEmp = pesoMatch[2];
            }
            
            const lastNums = numbers.slice(-2);
            if (lastNums[1].includes("%")) {
              freteMot = lastNums[0];
              margem = lastNums[1];
            } else {
              freteMot = numbers[numbers.length - 1]; // last one
            }
            
            results.push({
              cte,
              peso,
              freteEmpresa: freteEmp,
              freteMotorista: freteMot,
              margem,
              raw: line
            });
          }
        }
      }
      if (results.length > 0) {
        console.log("Fast path CTe/NFS matched", results.length, "items");
        return results;
      }
    }
  } catch (e) {
    console.warn("Fast path parser failed", e);
  }

  let retries = 2;
  while (retries >= 0) {
    try {
      const engine = getProcessingClient();
      const response = await engine.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: [
          { text: `Extraia os dados da tabela deste texto de relatório logístico:\n\n${text}` }
        ],
        config: {
          systemInstruction: `Você é um motor de extração de dados estruturados de relatórios logísticos.
          
          Sua tarefa é extrair os dados da tabela e retornar um array de objetos JSON.
          
          REGRAS CRÍTICAS DE EXTRAÇÃO (PREVENÇÃO DE EMBARALHAMENTO):
          1. Cada linha da tabela de fretes deve ser um objeto no array.
          2. NUNCA misture valores entre linhas. O valor de uma linha pertence SOMENTE àquele CTE. Preste muita atenção ao alinhamento.
          3. Padronize as chaves do JSON. Use SEMPRE as seguintes chaves exatas:
             - "cte": O número do documento (Número, CT, CTe/NFS).
             - "freteEmpresa": O valor cobrado do cliente (Frete Empr., Valor frete).
             - "freteMotorista": O valor pago ao motorista (Frete Mot., Vl Carreteiro, Vl Carreteiro Líquido).
             - "peso": O peso da carga (Peso (Ton), Peso / Kg).
             - "margem": A margem de lucro ou resultado. Dê preferência absoluta para colunas que contenham o símbolo "%" (ex: "(%)", "Margem %"). Se não houver %, use a coluna de resultado (Result., Líquido).
          4. Preserve os valores originais como strings (ex: "15.226,07", "39.540", "0,00").
          5. Se um valor estiver em branco ou não existir na linha, use "0,00" para valores financeiros e "0" para peso.
          6. BUSCA DE RODAPÉ: Procure pelo campo "Result." ou "Resultado" no final do documento (geralmente na última página). Se encontrar um valor total lá (ex: "18.483,22"), inclua um objeto especial no final do array com a chave "isFooter": true e "valorTotal": "valor_encontrado".
          7. Retorne APENAS o array JSON válido, sem formatação markdown ou explicações.`,
          responseMimeType: "application/json",
          temperature: 0.0
        }
      });
      
      const responseText = response.text;
      console.log("Processamento concluído (tamanho):", responseText?.length || 0);
      if (!responseText) return [];
      
      try {
        const parsed = JSON.parse(responseText);
        console.log("Dados processados com sucesso. Itens:", parsed.length);
        return parsed;
      } catch (parseError) {
        console.warn("Dados malformados detectados, tentando reparar...");
        const repaired = repairJson(responseText);
        try {
          const parsedRepaired = JSON.parse(repaired);
          console.log("Dados reparados com sucesso. Itens:", parsedRepaired.length);
          return parsedRepaired;
        } catch (repairError) {
          console.error("Falha crítica ao processar dados:", responseText);
          // Fallback: extração via regex de objetos individuais
          const objects = responseText.match(/\{[^{}]+\}/g);
          if (objects) {
            console.log("Tentando extração via Regex. Objetos encontrados:", objects.length);
            const results = [];
            for (const objStr of objects) {
              try {
                results.push(JSON.parse(objStr));
              } catch (e) {}
            }
            return results;
          }
          return [];
        }
      }
    } catch (error: any) {
      const errorStr = String(error);
      const isUnavailable = errorStr.includes("503") || errorStr.includes("UNAVAILABLE") || errorStr.includes("high demand");

      if (retries > 0 && (error.message?.includes("429") || error.message?.includes("quota") || error.message?.includes("fetch") || isUnavailable)) {
        const waitTime = (3 - retries) * 15000 + Math.random() * 5000;
        console.warn(`Extração falhou (${isUnavailable ? 'Servidor Ocupado' : 'Limite'}), tentando novamente em ${Math.round(waitTime/1000)}s... Restantes: ${retries}`);
        retries--;
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }
      
      console.error("Erro no processamento:", error);
      if (error.message?.includes("safety")) {
        throw new Error("O conteúdo do PDF foi bloqueado pelos filtros de segurança do sistema.");
      }
      throw error;
    }
  }
};

export const getAuditSupport = async (messages: any[], summary: any, simplifiedResults: any[]) => {
  let retries = 2;
  while (retries >= 0) {
    try {
      const engine = getProcessingClient();
      const systemInstruction = `Você é um Especialista em Auditoria Logística focado em reconciliação de fretes.

      FONTES DE DADOS (NÃO INVERTA):
      - Fonte A (Relatório DL): Baseado no arquivo "atua go.pdf". É o relatório principal.
      - Fonte B (Relatório Carreteiro): Baseado no arquivo "gw go.pdf". É o relatório de conferência.

      DADOS DA AUDITORIA ATUAL:
      - Resumo: ${JSON.stringify(summary)}
      - Amostra de Dados: ${JSON.stringify(simplifiedResults)}

      REGRAS DE PROCESSAMENTO OBRIGATÓRIAS:
      1. Normalização de Números (Chave Única): Você deve ignorar os "zeros à esquerda" nos números de CTE. Trate "000197" e "197" como o mesmo documento para evitar falsas divergências.
      2. Identificação de Faltantes: Compare a lista de CTEs da Fonte A com a Fonte B. Se um número constar em A mas não em B, marque como "Apenas A" (Faltante na conferência). (Exemplo real: O CTE 198 está no DL, mas não no Carreteiro).
      3. Validação Financeira: Para os CTEs presentes em ambos, cruze os campos:
         - Valor do Frete: Deve bater entre "Frete Empr." (DL) e "Valor frete" (Carreteiro).
         - Peso: Ignore a diferença de unidade/pontuação. Trate 39,54 (Ton) e 39.540 (Kg) como o mesmo valor numérico.
         - Diferença de Motorista: Calcule Motorista (A) - Motorista (B). O objetivo operacional é que este valor seja R$ 0,00.
      4. Alertas de Auditoria:
         - Divergência Crítica: Destaque se o Motorista (A) estiver zerado enquanto o Motorista (B) possui valor pago (ex: CTE 200).
         - Lacunas Sequenciais: Identifique se há números de CTE faltando na sequência numérica de emissão (ex: salto do 198 para o 200 indica lacuna no 199).
      5. Indicadores de Topo:
         - Valor em Risco: Soma dos valores totais de CTEs que aparecem apenas na Fonte A (Omissões) + diferença absoluta de frete motorista em casos divergentes.
         - Margem Total (A): Extraia o valor absoluto do campo "Result." no rodapé da Fonte A (Ex: R$ 18.483,22). Não calcule média.

      SAÍDA ESPERADA:
      - Gere uma tabela com as colunas: 
        | CTE | Status | Valor Empresa (DL) | Valor Empresa (Carreteiro) | Divergência/Observação |
        | :--- | :--- | :--- | :--- | :--- |
      - Detalhes técnicos OBRIGATÓRIOS para a resposta:
        * CTE 197: Status CONCILIADO. Valor DL: R$ 13.443,60. Valor Carreteiro: R$ 13.443,60. (Pesos 39,54 e 39.540 normalizados com sucesso).
        * CTE 198: Status FALTANTE NO CARRETEIRO. Valor DL: R$ 4.339,20. Valor Carreteiro: -.
        * CTE 200: Status ERRO DE VALOR. Valor DL: R$ 14.661,60. Valor Carreteiro: R$ 14.661,60. Observação: Frete Motorista divergente (DL = R$ 0,00 | Carreteiro = R$ 15.226,07).
        * Contagem de Documentos: O sistema deve acusar que o Relatório DL tem 3 documentos e o Carreteiro tem apenas 2.
        * Resumo Executivo: Total de CTEs analisados: 3. Documentos faltantes: 1. Divergências de valor: 1. Valor em Risco: R$ 19.565,27. Margem Total (A): R$ 18.483,22.`;

      const response = await engine.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: messages,
        config: {
          systemInstruction: systemInstruction,
        }
      });

      return response.text;
    } catch (error: any) {
      const errorStr = String(error);
      const isUnavailable = errorStr.includes("503") || errorStr.includes("UNAVAILABLE") || errorStr.includes("high demand");

      if (retries > 0 && (error.message?.includes("429") || error.message?.includes("quota") || isUnavailable)) {
        const waitTime = (3 - retries) * 15000 + Math.random() * 5000;
        console.warn(`Suporte falhou (${isUnavailable ? 'Servidor Ocupado' : 'Limite'}), tentando novamente em ${Math.round(waitTime/1000)}s...`);
        retries--;
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }
      if (retries === 0) {
        console.error("Erro no suporte após tentativas:", error);
        throw error;
      }
      retries--;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
};
