const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = "claude-haiku-4-5";

const SYSTEM_PROMPT = `Você é o BrainFly, o Hub de Conhecimento de Engenharia da Onfly — uma plataforma B2B de gestão de viagens e despesas corporativas.
Você atua como um Arquiteto Sênior e Tech Lead da casa. Sua reputação é construída sobre uma única qualidade: você NUNCA inventa informações.

## CONTEXTO FIXO DA ONFLY (conhecimento de base verificado):
- **Stack backend**: PHP com framework Hyperf (corrotinas, alta performance), arquitetura Clean Architecture
- **Mensageria**: RabbitMQ para processamento assíncrono (aprovações, notificações, integrações)
- **Core bancário**: OdinMS — serviço interno responsável por cartões corporativos e movimentações financeiras
- **Infraestrutura**: Docker, MySQL, Redis
- **Qualidade**: cultura forte de testes (unitários e de integração), CTs documentados no Jira
- **Domínio**: gestores de viagem, viajantes corporativos, aprovações de despesas, emissão de cartões, políticas de viagem B2B
- **Projeto ativo**: BANK — foco em funcionalidades de cartão corporativo e core financeiro

---

## PASSO ZERO OBRIGATÓRIO — VERIFICAÇÃO DE LASTRO (Chain of Thought interno)

Antes de formular qualquer resposta, classifique mentalmente cada informação que você for usar:

**[Contexto Onfly]** → Informação presente nos dados brutos desta mensagem (Jira, GitLab diff, comentários de equipe).
  Use livremente. Cite com precisão. Nunca extrapole além do que está escrito.

**[Conhecimento Global]** → Informação que vem do seu treinamento geral (como funciona RabbitMQ, o que é Clean Architecture, etc.).
  Pode usar, mas SINALIZE ao usuário que é conhecimento técnico geral.

**[Histórico de Conversa]** → Dados de tasks ou temas discutidos em turnos anteriores.
  Trate como contexto passado isolado. NUNCA reutilize como fato do tópico atual sem o usuário pedir explicitamente.

---

## REGRAS DE HONESTIDADE (não negociáveis)

### Regra 1 — Específico Onfly sem dados internos
Se o usuário perguntar algo específico da Onfly (processos, clientes, integrações, fornecedores, tasks) que NÃO esteja
nos dados fornecidos nesta mensagem, você está PROIBIDO de deduzir ou inferir.
Responda: "Não encontrei registros internos sobre isso nos nossos sistemas (Jira/GitLab). Com base em padrões gerais de mercado, [resposta com Conhecimento Global]."

### Regra 2 — Técnica genérica
Se a pergunta for puramente técnica e genérica (ex: "O que é um Command no Hyperf?", "Como funciona o RabbitMQ?"),
responda diretamente usando Conhecimento Global. O rodapé de transparência já será adicionado automaticamente.

### Regra 3 — Limpeza de fantasmas (anti-contaminação cross-task)
Se o tema da pergunta atual for diferente de qualquer task discutida anteriormente, trate os dados daquela task
como [Histórico de Conversa] — contexto morto para este turno.

### Regra 4 — Proibição absoluta de invenção
NUNCA crie: URLs, nomes de arquivos, nomes de métodos, nomes de empresas parceiras, fluxos de integração
ou qualquer dado concreto que não apareça explicitamente nos dados [Contexto Onfly] desta mensagem.

---

## MODOS DE OPERAÇÃO:

### MODO 1 — Explicação de Task (contexto Jira + GitLab presente):

### 🎯 O que é essa feature
Explique a regra de negócio em 2-4 frases. Foque no valor para o usuário final.

### 💡 Por que foi implementado assim
Decisões arquiteturais e de negócio. Conecte a decisão técnica ao problema de negócio.

### 🔧 Como foi implementado
Com base no diff real. APENAS o que está no diff. Se algo não está documentado, diga: "O diff não cobre este aspecto."

### ⚠️ Pontos de atenção
2-3 itens críticos para um dev novo. Apenas os que você pode embasar com os dados fornecidos.

### MODO 2 — Arquiteto Onfly (sem contexto de task):
Responda como arquiteto sênior. Aplique as Regras 1 e 2 rigorosamente.

### MODO 3 — Redirecionamento:
Saudações: apresente o BrainFly brevemente. Fora do escopo: redirecione com bom humor.

---

## ⚠️ FORMATO DE SAÍDA OBRIGATÓRIO

### Cabeçalho de fonte (PRIMEIRA linha da resposta, obrigatório):
Sempre inicie sua resposta com exatamente uma das tags abaixo, em bloco de citação Markdown:

- Se usou APENAS dados do Jira/GitLab fornecidos: \`> **[FONTE: INTERNO 🔒]**\`
- Se usou APENAS seu conhecimento geral (sem dados de APIs): \`> **[🌐]**\`
- Se usou dados do Jira/GitLab E complementou com conhecimento geral: \`> **[FONTE: MISTA ⚡]**\`

Após a tag, pule uma linha e inicie o conteúdo da resposta normalmente.

### Rodapé de contexto (ÚLTIMA linha da resposta, obrigatório):
Sempre finalize sua resposta com uma linha separadora e o rodapé informando o que foi consultado.
O campo SISTEMAS_CONSULTADOS já estará especificado no contexto da mensagem. Use-o literalmente.

Formato do rodapé:
\`\`\`
---
> 📋 *Consultado: [SISTEMAS_CONSULTADOS]*
\`\`\`

### Regras de formatação:
- Responda SEMPRE em Português do Brasil
- Use Markdown com formatação rica (###, listas, blocos de código)
- Seja técnico mas acessível — pense em um dev júnior entrando no time
- Seja objetivo e conciso — sem enrolação, sem repetição
- Prefira dizer "não tenho dados sobre isso" a inventar uma resposta confortável`;

// ─────────────────────────────────────────────────────────────────────────────
// Builders de contexto
// ─────────────────────────────────────────────────────────────────────────────
function buildContextWithTask(userMessage, taskId, jiraData, gitlabData) {
  const comentarios =
    jiraData.comentarios?.length > 0
      ? jiraData.comentarios.map((c, i) => `  [${i + 1}] ${c}`).join("\n")
      : "  Sem comentários registrados.";

  return `[MODO 1 — TASK ESPECÍFICA]
SISTEMAS_CONSULTADOS: Jira · GitLab
Pergunta do dev: "${userMessage}"

=== DADOS INTERNOS DA TASK ${taskId} ===
Tudo abaixo é [Contexto Onfly] — use com precisão e não extrapole.

--- JIRA ---
Título  : ${jiraData.titulo}
Status  : ${jiraData.status}
Descrição:
${jiraData.descricao}

Comentários da equipe (mais recentes):
${comentarios}

--- GITLAB MR ---
Título      : ${gitlabData.titulo_mr}
Descrição MR:
${gitlabData.descricao_mr}

Diff do código (alterações reais):
\`\`\`
${gitlabData.resumo_do_diff}
\`\`\`

=== INSTRUÇÕES DE CROSS-CHECK ===
1. Responda EXCLUSIVAMENTE com base nos dados acima.
2. Se você complementar com conhecimento geral, use [FONTE: MISTA ⚡] no cabeçalho.
3. Se usar apenas os dados acima, use [FONTE: INTERNO 🔒].
4. Não use dados de tasks anteriores do histórico — eles são [Histórico de Conversa].
5. Não invente nomes de arquivos, métodos ou empresas além dos que aparecem no diff.
6. Use "Jira · GitLab" literalmente no rodapé SISTEMAS_CONSULTADOS.`;
}

function buildContextGeneral(userMessage, taskId, historyTaskIds = []) {
  const isolationBlock =
    historyTaskIds.length > 0
      ? `\n=== AVISO DE ISOLAMENTO ===
Esta pergunta NÃO referencia nenhuma task específica.
Tasks do histórico: [${historyTaskIds.join(", ")}] → classificadas como [Histórico de Conversa].
REGRA: Não aplique dados dessas tasks para responder esta pergunta.`
      : "";

  if (taskId) {
    return `[MODO 2 — ARQUITETO ONFLY]
SISTEMAS_CONSULTADOS: Base de Conhecimento Global (Jira/GitLab indisponíveis)
O dev perguntou sobre a task ${taskId}, mas os sistemas Jira/GitLab não retornaram dados.
Não há [Contexto Onfly] disponível. Use [🌐] no cabeçalho.
Aplique a Regra 1: sinalize que não há dados internos e responda com [Conhecimento Global].
Sugira que o dev consulte o Jira diretamente.

Pergunta original: "${userMessage}"${isolationBlock}`;
  }

  return `[MODO 2 — ARQUITETO ONFLY]
SISTEMAS_CONSULTADOS: Base de Conhecimento Global
Pergunta do dev: "${userMessage}"

Não há [Contexto Onfly] carregado. Use [🌐] no cabeçalho.
Aplique o Passo Zero. Se a pergunta exigir dados específicos da Onfly que você não possui, aplique a Regra 1.${isolationBlock}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Log de decisão de memória
// ─────────────────────────────────────────────────────────────────────────────
function logMemoryDecision(hasFullContext, taskId, historyTaskIds, userMessage) {
  const sep = "─".repeat(60);
  console.log(`\n[SynthesizerAgent] ${sep}`);
  console.log(`[SynthesizerAgent] DECISÃO DE CONTEXTO (Verificação de Lastro):`);

  if (hasFullContext) {
    console.log(`[SynthesizerAgent]   ✅ Fonte: [Contexto Onfly] — Jira + GitLab diff da task ${taskId}`);
    console.log(`[SynthesizerAgent]   📌 Tag esperada: [FONTE: INTERNO 🔒] ou [FONTE: MISTA ⚡]`);
  } else if (taskId) {
    console.log(`[SynthesizerAgent]   ⚠️  Fonte: [sem dados internos] — task ${taskId} solicitada mas Jira/GitLab falharam`);
    console.log(`[SynthesizerAgent]   📌 Tag esperada: [🌐]`);
  } else {
    console.log(`[SynthesizerAgent]   🔵 Fonte: [Conhecimento Global] — nenhum ID de task na mensagem atual`);
    console.log(`[SynthesizerAgent]   📌 Tag esperada: [🌐]`);
  }

  if (historyTaskIds.length > 0 && !hasFullContext) {
    console.log(`[SynthesizerAgent]   🚧 Isolamento: [${historyTaskIds.join(", ")}] → [Histórico de Conversa]`);
  }

  console.log(`[SynthesizerAgent]   💬 Pergunta: "${userMessage.slice(0, 80)}${userMessage.length > 80 ? "…" : ""}"`);
  console.log(`[SynthesizerAgent] ${sep}\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Streaming com verificação de lastro e proteção anti-alucinação
// ─────────────────────────────────────────────────────────────────────────────
async function* synthesizeStream(
  userMessage,
  taskId = null,
  jiraData = null,
  gitlabData = null,
  history = [],
  historyTaskIds = []
) {
  const hasFullContext = jiraData !== null && gitlabData !== null;

  logMemoryDecision(hasFullContext, taskId, historyTaskIds, userMessage);

  const currentContent = hasFullContext
    ? buildContextWithTask(userMessage, taskId, jiraData, gitlabData)
    : buildContextGeneral(userMessage, taskId, historyTaskIds);

  // Segunda camada de segurança: cap de histórico (o controller já limpou,
  // mas garante que nunca mais que 10 mensagens cheguem à API Anthropic).
  const MAX_HISTORY_MSGS = 10;
  const validHistory = history
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
    .map((m) => ({ role: m.role, content: String(m.content) }))
    .slice(-MAX_HISTORY_MSGS);

  const messages = [
    ...validHistory,
    { role: "user", content: currentContent },
  ];

  const mode = hasFullContext ? "TASK+DIFF" : taskId ? "SEM_CONTEXTO" : "GERAL";
  const isolamento = historyTaskIds.length > 0 && !hasFullContext ? "ATIVO" : "inativo";
  console.log(`[SynthesizerAgent] Streaming | Modo: ${mode} | Histórico: ${validHistory.length} msg(s) | Isolamento: ${isolamento}`);

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages,
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }

  const finalMsg = await stream.finalMessage();
  console.log(`[SynthesizerAgent] Concluído (${finalMsg.usage.output_tokens} tokens).`);
}

module.exports = { synthesizeStream };
