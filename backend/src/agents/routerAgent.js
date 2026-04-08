const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Você é o Roteador de Intenções do BrainFly, uma ferramenta interna da Onfly para engenheiros.
Sua ÚNICA função é ler a mensagem do usuário e classificar a intenção, retornando um JSON.

INTENÇÕES POSSÍVEIS:
- "TASK_SPECIFIC": a mensagem menciona um ID de tarefa Jira (ex: ONF-123, PROJ-456).
- "GENERAL_QUESTION": a mensagem é uma dúvida técnica ou de negócio sobre a Onfly (arquitetura, código, processos).
- "CHITCHAT": a mensagem é apenas uma saudação ou conversa sem conteúdo técnico (ex: "oi", "tudo bem?", "obrigado").

FORMATO DE SAÍDA OBRIGATÓRIO — retorne SOMENTE este JSON cru, sem markdown, sem explicações:
{"intent":"TASK_SPECIFIC","taskId":"ONF-123"}
{"intent":"GENERAL_QUESTION","taskId":null}
{"intent":"CHITCHAT","taskId":null}

REGRAS:
- O formato do ID Jira é: letras maiúsculas + hífen + números (ex: ONF-123, PROJ-456).
- Se a intenção for TASK_SPECIFIC, preencha "taskId" com o ID encontrado.
- Para GENERAL_QUESTION e CHITCHAT, "taskId" deve ser null.
- Nunca inclua texto fora do JSON.`;

function safeParseJSON(text) {
  try {
    const cleaned = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function routeWithRegex(userMessage) {
  const taskMatch = userMessage.match(/\b([A-Z]+-\d+)\b/);
  if (taskMatch) {
    return { intent: "TASK_SPECIFIC", taskId: taskMatch[1] };
  }

  const chitchatPattern = /^(oi|olá|ola|hey|hi|hello|tudo bem|bom dia|boa tarde|boa noite|obrigad|valeu|thanks)\b/i;
  if (chitchatPattern.test(userMessage.trim())) {
    return { intent: "CHITCHAT", taskId: null };
  }

  return { intent: "GENERAL_QUESTION", taskId: null };
}

async function routeIntent(userMessage) {
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 100,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const rawText = response.content[0].text.trim();
    const parsed = safeParseJSON(rawText);

    const validIntents = ["TASK_SPECIFIC", "GENERAL_QUESTION", "CHITCHAT"];
    if (parsed && validIntents.includes(parsed.intent)) {
      console.log(`[RouterAgent] LLM roteou: intent=${parsed.intent}, taskId=${parsed.taskId}`);
      return parsed;
    }

    console.warn(`[RouterAgent] JSON inválido retornado: "${rawText}". Usando fallback regex.`);
    return routeWithRegex(userMessage);
  } catch (error) {
    console.warn(
      `[RouterAgent] Anthropic indisponível (${error.message?.split("\n")[0]}). Usando fallback regex.`
    );
    return routeWithRegex(userMessage);
  }
}

module.exports = { routeIntent };
