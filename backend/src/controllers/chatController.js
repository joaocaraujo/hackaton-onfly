const { routeIntent } = require("../agents/routerAgent");

async function handleChat(req, res) {
  const { message } = req.body;

  if (!message || typeof message !== "string" || message.trim() === "") {
    return res.status(400).json({
      status: "erro",
      message: 'O campo "message" é obrigatório e não pode estar vazio.',
    });
  }

  try {
    const { intent, taskId } = await routeIntent(message.trim());

    return res.status(200).json({
      status: "sucesso",
      step: "roteamento",
      intent,
      taskId,
    });
  } catch (error) {
    console.error("[ChatController] Falha no pipeline:", error.message);
    return res.status(500).json({
      status: "erro",
      message: "Erro interno no servidor.",
    });
  }
}

module.exports = { handleChat };
