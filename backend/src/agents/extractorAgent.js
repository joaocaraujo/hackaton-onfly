const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Você é um roteador de intenções para uma ferramenta chamada BrainFly.
Sua ÚNICA função é analisar a mensagem do usuário e retornar um objeto JSON com exatamente dois campos:

- "intent": "explain_task" se a mensagem mencionar um ID de tarefa Jira, ou "general_question" se não mencionar.
- "taskId": o ID da tarefa encontrado (ex: "ONF-123") ou "NENHUM" se não houver.

REGRAS ABSOLUTAS:
- O formato do ID Jira é: letras maiúsculas + hífen + números (ex: ONF-123, PROJ-456, ABC-789).
- Retorne SOMENTE o objeto JSON cru. Zero texto adicional, zero markdown, zero blocos de código.
- Exemplo de saída válida: {"intent":"explain_task","taskId":"ONF-123"}
- Exemplo de saída válida: {"intent":"general_question","taskId":"NENHUM"}`;

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

function extractWithRegex(userMessage) {
  const match = userMessage.match(/\b([A-Z]+-\d+)\b/);
  const taskId = match ? match[1] : "NENHUM";
  const intent = taskId !== "NENHUM" ? "explain_task" : "general_question";
  return { intent, taskId };
}

async function analyzeIntent(userMessage) {
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 100,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const rawText = response.content[0].text.trim();
    const parsed = safeParseJSON(rawText);

    if (parsed && parsed.intent && parsed.taskId) {
      console.log(`[ExtractorAgent] LLM analisou: intent=${parsed.intent}, taskId=${parsed.taskId}`);
      return parsed;
    }

    console.warn(`[ExtractorAgent] JSON inválido retornado pelo LLM: "${rawText}". Usando fallback regex.`);
    return extractWithRegex(userMessage);
  } catch (error) {
    console.warn(
      `[ExtractorAgent] Anthropic indisponível (${error.message?.split("\n")[0]}). Usando fallback regex.`
    );
    return extractWithRegex(userMessage);
  }
}

module.exports = { analyzeIntent };
