const { routeIntent } = require("../agents/routerAgent");
const { fetchJiraTask } = require("../agents/jiraAgent");
const { fetchGitlabMR } = require("../agents/gitlabAgent");
const { synthesizeStream } = require("../agents/synthesizerAgent");

// Máximo de pares (user + assistant) mantidos no histórico enviado à LLM.
// Evita blowup de context window com projetos múltiplos.
const MAX_HISTORY_PAIRS = 5; // = 10 mensagens

/**
 * Varre histórico e retorna todos os IDs de task Jira citados por mensagens do usuário.
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

/**
 * Extrai o ID de task de uma mensagem do usuário, se houver.
 */
function getTaskIdFromMsg(content) {
  const m = (content || "").match(/\b([A-Z]+-\d+)\b/);
  return m ? m[1] : null;
}

/**
 * Limpa o histórico antes de enviar para a LLM:
 *
 * - Se a pergunta atual é sobre uma task NOVA (nunca vista no histórico):
 *     → Remove pares de outros projetos/tasks do histórico.
 *     → Mantém apenas pares sem task ou da mesma task.
 *
 * - Se a pergunta atual é geral/chitchat (sem taskId):
 *     → Mantém histórico recente, mas só os últimos MAX_HISTORY_PAIRS pares.
 *     → Não dropa nada — follow-ups sobre a task anterior precisam de contexto.
 *
 * - Se é uma pergunta de follow-up da MESMA task:
 *     → Mantém histórico completo (até o cap).
 *
 * Em todos os casos: aplica o cap de MAX_HISTORY_PAIRS.
 */
function buildCleanHistory(history, currentTaskId, historyTaskIds) {
  if (!history || history.length === 0) return [];

  // Monta pares [user, assistant] para manipulação atômica
  const pairs = [];
  for (let i = 0; i < history.length; i++) {
    if (history[i].role === "user") {
      const pair = { user: history[i], assistant: history[i + 1] || null };
      pairs.push(pair);
      if (pair.assistant) i++; // pula o assistant que já foi consumido
    }
  }

  let filtered = pairs;

  // Caso: nova task nunca antes citada → remove pares de outras tasks
  const isNewTask =
    currentTaskId &&
    historyTaskIds.length > 0 &&
    !historyTaskIds.includes(currentTaskId);

  if (isNewTask) {
    const before = pairs.length;
    filtered = pairs.filter((pair) => {
      const taskInPair = getTaskIdFromMsg(pair.user?.content);
      // Mantém par se: sem task OU mesma task atual
      return !taskInPair || taskInPair === currentTaskId;
    });
    const dropped = before - filtered.length;
    if (dropped > 0) {
      console.log(
        `[ChatController] LIMPEZA DE HISTÓRICO — Nova task detectada: ${currentTaskId}. ` +
        `Removidos ${dropped} par(es) de tasks anteriores [${historyTaskIds.join(", ")}].`
      );
    }
  }

  // Aplica cap de pares
  const capped = filtered.slice(-MAX_HISTORY_PAIRS);

  if (filtered.length > MAX_HISTORY_PAIRS) {
    console.log(
      `[ChatController] HISTÓRICO TRUNCADO — ${filtered.length} pares → ${capped.length} (cap: ${MAX_HISTORY_PAIRS}).`
    );
  }

  // Reconstrói array plano [user, assistant, user, assistant, ...]
  const flat = [];
  for (const pair of capped) {
    if (pair.user) flat.push(pair.user);
    if (pair.assistant) flat.push(pair.assistant);
  }

  return flat;
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

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

  try {
    // ── Passo 1: Roteamento ──────────────────────────────────────────────────
    const { intent, taskId } = await routeIntent(userMessage);
    console.log(`[ChatController] Intent: ${intent} | TaskId: ${taskId}`);

    // ── Análise do histórico recebido ────────────────────────────────────────
    const historyTaskIds = extractHistoryTaskIds(history);

    // ── Limpeza de contexto ──────────────────────────────────────────────────
    // Remove pares de tasks antigas quando há mudança de projeto/task,
    // e aplica cap para não estourar context window.
    const cleanHistory = buildCleanHistory(history, taskId, historyTaskIds);

    const isNewTopic = intent !== "TASK_SPECIFIC" && historyTaskIds.length > 0;
    if (isNewTopic) {
      console.log(
        `[ChatController] ISOLAMENTO ATIVADO — Tasks no histórico original: [${historyTaskIds.join(", ")}].`
      );
    }

    console.log(
      `[ChatController] Histórico: ${history.length} msgs recebidas → ${cleanHistory.length} msgs enviadas à LLM.`
    );

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
      cleanHistory,       // histórico já limpo e truncado
      historyTaskIds      // IDs originais para o aviso de isolamento no prompt
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
