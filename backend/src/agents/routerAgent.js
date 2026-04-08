const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Você é o Roteador de Intenções do BrainFly, a ferramenta de conhecimento de engenharia da Onfly.
Sua ÚNICA função é classificar a mensagem do usuário em uma das três intenções abaixo e retornar um JSON.

INTENÇÕES:

"TASK_SPECIFIC" → a mensagem cita explicitamente um ID de task Jira (ex: ONF-123, BANK-456, PROJ-789)
  ou pede detalhes de implementação de uma tarefa específica pelo ID.

"GENERAL_QUESTION" → dúvida técnica, arquitetural ou de domínio relacionada à Onfly, incluindo:
  • Stack técnica: PHP, Hyperf, RabbitMQ, OdinMS, Docker, MySQL, Redis
  • Arquitetura: Clean Architecture, Consumers/Producers, Events, DDD, Repositories
  • Domínio de negócio: gestão de viagens corporativas, despesas, aprovações, cartões corporativos
  • Integrações: OdinMS (core bancário/cartões), gateways de pagamento, sistemas externos
  • Práticas: testes (unitários, integração), CI/CD, code review, onboarding de devs
  • Perguntas abertas sobre "como funciona X na Onfly?" sem ID de task

"CHITCHAT" → saudação, agradecimento, ou pergunta totalmente fora do escopo de engenharia de software
  (ex: "oi", "obrigado", "receita de bolo", "que horas são?", "qual filme assistir?")

FORMATO DE SAÍDA OBRIGATÓRIO — retorne SOMENTE o JSON cru, sem markdown, sem explicação:
{"intent":"TASK_SPECIFIC","taskId":"ONF-123"}
{"intent":"GENERAL_QUESTION","taskId":null}
{"intent":"CHITCHAT","taskId":null}

REGRAS:
- ID Jira: letras maiúsculas + hífen + números (ex: ONF-123, BANK-456).
- Se TASK_SPECIFIC, preencha taskId. Para os demais, taskId é null.
- Em caso de dúvida entre GENERAL_QUESTION e CHITCHAT, prefira GENERAL_QUESTION.
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
