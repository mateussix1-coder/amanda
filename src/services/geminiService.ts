import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini API
// process.env.GEMINI_API_KEY is automatically injected in the frontend by the platform
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const autoMapColumns = async (columns: string[]) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        { text: `Identifique as colunas correspondentes para: cte, freteEmpresa, freteMotorista, margem.\nColunas: ${columns.join(', ')}` }
      ],
      config: { 
        systemInstruction: "Você é um assistente de mapeamento de dados. Retorne um JSON com as chaves: cte, freteEmpresa, freteMotorista, margem. Os valores devem ser os nomes exatos das colunas fornecidas. Se não encontrar, use string vazia.",
        responseMimeType: "application/json"
      }
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Erro no automap:", error);
    throw error;
  }
};

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

  // Se estiver balanceado, ok
  if (stack.length === 0) return str;

  // Se truncado, tentar fechar ou cortar no último válido
  if (lastValidEnd !== -1) {
    return str.substring(0, lastValidEnd + 1);
  }

  // Último recurso: fechar na marra
  while (stack.length > 0) {
    str += stack.pop();
  }
  return str;
};

export const parsePDFText = async (text: string) => {
  if (!text || text.trim().length < 10) {
    return [];
  }

  console.log("Enviando texto para IA (tamanho):", text.length);

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        { text: `Extraia os dados da tabela deste texto de relatório logístico:\n\n${text}` }
      ],
      config: {
        systemInstruction: `Você é um especialista em extração de dados estruturados. 
        Sua tarefa é converter o texto de um relatório de transportadora em um array JSON de objetos.
        
        REGRAS:
        1. Identifique a tabela principal (ignore cabeçalhos globais, rodapés e totais).
        2. Cada objeto no array deve representar uma linha da tabela.
        3. Use os nomes das colunas originais como chaves do JSON (ex: "CTE", "Emissão", "Valor Frete").
        4. Preserve os valores originais (números, datas).
        5. Retorne APENAS o array JSON, sem explicações.
        6. Se não houver dados de tabela, retorne [].`,
        responseMimeType: "application/json"
      }
    });
    
    const responseText = response.text;
    console.log("Resposta da IA recebida (tamanho):", responseText?.length || 0);
    if (!responseText) return [];
    
    try {
      const parsed = JSON.parse(responseText);
      console.log("JSON parseado com sucesso. Itens:", parsed.length);
      return parsed;
    } catch (parseError) {
      console.warn("JSON malformado detectado, tentando reparar...");
      const repaired = repairJson(responseText);
      try {
        const parsedRepaired = JSON.parse(repaired);
        console.log("JSON reparado com sucesso. Itens:", parsedRepaired.length);
        return parsedRepaired;
      } catch (repairError) {
        console.error("Falha crítica ao reparar JSON:", responseText);
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
    console.error("Erro no parse-pdf:", error);
    if (error.message?.includes("safety")) {
      throw new Error("O conteúdo do PDF foi bloqueado pelos filtros de segurança da IA.");
    }
    throw error;
  }
};

export const chatWithAuditor = async (messages: any[], summary: any, simplifiedResults: any[]) => {
  try {
    const systemInstruction = `Você é um Auditor de Dados Logísticos Especializado em CTEs. Sua função é realizar o cruzamento técnico entre dois conjuntos de dados (Lista A e Lista B). A prioridade máxima é a precisão absoluta. O tom da resposta deve ser estritamente analítico e técnico, eliminando qualquer verbosidade desnecessária.

    DADOS DA AUDITORIA ATUAL:
    - Resumo: ${JSON.stringify(summary)}
    - Amostra de Dados (primeiros 150): ${JSON.stringify(simplifiedResults)}

    PROTOCOLO DE PROCESSAMENTO (Lógica Sequencial):
    1. SANEAMENTO: Ignore símbolos monetários (R$), pontos de milhar ou inconsistências de formatação. Trate vírgulas como separadores decimais. O "Número do CTE" é a Chave Única (Matching Key).
    2. CONTAGEM E DIFERENÇA SIMÉTRICA: Compare o volume total. Identifique CTEs na Lista A ausentes na B, e vice-versa.
    3. AUDITORIA DE VALORES: Para CTEs presentes em ambas, cruze os valores financeiros.
    4. CÁLCULO DE DELTA E STATUS: Delta = Valor Lista A - Valor Lista B. Atribua status "Valor a Maior" (positivo) ou "Valor a Menor" (negative).

    DIRETRIZES DE SAÍDA:
    - CONDIÇÃO DE SUCESSO: SE todos os CTEs estiverem presentes em ambas as listas E todos os valores forem idênticos, emita APENAS: "Conciliação Concluída com Sucesso".
    - CTEs FALTANTES: Se houver disparidade, aponte o número do documento e em qual lista ele está ausente.
    - TABELA DE DIVERGÊNCIAS: Para discrepâncias, crie uma tabela Markdown:
      | Número do CTE | Valor na Lista A | Valor na Lista B | Diferença (Delta) | Status |
      | :--- | :--- | :--- | :--- | :--- |
      | [Número] | R$ [0,00] | R$ [0,00] | [+/- 0,00] | [A Maior/Menor] |
      * Use (+) para excesso na Lista A e (-) para valor menor na Lista A.
    - RESUMO EXECUTIVO (Obrigatório se houver divergências):
      * Total de CTEs analisados: [Soma total de documentos únicos]
      * Quantidade de documentos faltantes: [Total de ausências detectadas]
      * Quantidade de divergências de valor encontradas: [Total de linhas com Delta ≠ 0]

    RESTRIÇÕES:
    - Idioma: Português (Brasil).
    - Proibido: Gráficos, imagens, fluxogramas ou comentários subjetivos.
    - Use **negrito** em todos os números de documentos e valores monetários.
    - Siga rigorosamente o método de Chain of Thought internamente antes de gerar o output.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: messages,
      config: {
        systemInstruction: systemInstruction,
      }
    });

    return response.text;
  } catch (error) {
    console.error("Erro no chat:", error);
    throw error;
  }
};
