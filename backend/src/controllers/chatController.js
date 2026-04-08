const { routeIntent } = require("../agents/routerAgent");
const { fetchJiraTask } = require("../agents/jiraAgent");
const { fetchGitlabMR } = require("../agents/gitlabAgent");
const { synthesizeStream } = require("../agents/synthesizerAgent");

/**
 * Varre o histórico de mensagens e retorna todos os IDs de task Jira
 * que foram explicitamente citados nas mensagens do usuário.
 * Usado para construir o contexto de isolamento anti-alucinação.
 */
function extractHistoryTaskIds(history) {
  const ids = new Set();
  for (const msg of history) {
    if (msg.role === "user" && msg.content) {
      const matches = msg.content.match(/\b([A-Z]+-\d+)\b/g);
      if (matches) matches.forEach((id) => ids.add(id));
    }
  }
  return [...ids];
}

async function handleChat(req, res) {
  const { message, history = [] } = req.body;

  if (!message || typeof message !== "string" || message.trim() === "") {
    return res.status(400).json({
      status: "erro",
      message: 'O campo "message" é obrigatório e não pode estar vazio.',
    });
  }

  const userMessage = message.trim();

  // Inicia SSE antes de qualquer processamento assíncrono
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

  try {
    // ── Passo 1: Roteamento ──────────────────────────────────────────────────
    const { intent, taskId } = await routeIntent(userMessage);
    console.log(`[ChatController] Intent: ${intent} | TaskId: ${taskId}`);

    // ── Detecção de contaminação de contexto ─────────────────────────────────
    // Extrai tasks mencionadas em turnos anteriores para o sintetizador poder
    // isolar o contexto atual e evitar alucinações cross-task.
    const historyTaskIds = extractHistoryTaskIds(history);
    const isNewTopic = intent !== "TASK_SPECIFIC" && historyTaskIds.length > 0;

    if (isNewTopic) {
      console.log(
        `[ChatController] ISOLAMENTO ATIVADO — Pergunta atual não referencia task. ` +
        `Tasks no histórico: [${historyTaskIds.join(", ")}]. ` +
        `Sintetizador instruído a NÃO usar contexto dessas tasks.`
      );
    }

    // ── Passo 2: Busca de contexto ───────────────────────────────────────────
    let jiraData = null;
    let gitlabData = null;

    if (intent === "TASK_SPECIFIC" && taskId) {
      try {
        [jiraData, gitlabData] = await Promise.all([
          fetchJiraTask(taskId),
          fetchGitlabMR(taskId),
        ]);
        console.log(`[ChatController] Contexto obtido. Jira ✓ | GitLab ✓`);
      } catch (fetchError) {
        console.error(`[ChatController] Falha na busca: ${fetchError.message}`);
      }
    }

    // ── Passo 3: Síntese com streaming ───────────────────────────────────────
    const stream = synthesizeStream(
      userMessage,
      taskId,
      jiraData,
      gitlabData,
      history,
      historyTaskIds   // <-- contexto de isolamento anti-alucinação
    );

    for await (const chunk of stream) {
      sendEvent({ type: "chunk", text: chunk });
    }

    sendEvent({ type: "done" });
    res.end();
  } catch (error) {
    console.error("[ChatController] Falha no pipeline:", error.message);
    sendEvent({ type: "error", message: "Erro interno no servidor." });
    res.end();
  }
}

module.exports = { handleChat };
