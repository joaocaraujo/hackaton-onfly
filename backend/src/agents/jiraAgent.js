const axios = require("axios");

// Requer no .env: JIRA_DOMAIN=onfly.atlassian.net
function extractTextFromADF(node) {
  if (!node) return "";
  if (node.type === "text") return node.text || "";
  if (Array.isArray(node.content)) {
    return node.content.map(extractTextFromADF).join(" ").replace(/\s+/g, " ").trim();
  }
  return "";
}

async function fetchJiraTask(taskId) {
  const baseUrl = `https://${process.env.JIRA_DOMAIN}`;
  const authConfig = {
    auth: {
      username: process.env.JIRA_EMAIL,
      password: process.env.JIRA_API_TOKEN,
    },
    timeout: 8000,
  };

  try {
    const [issueRes, commentRes] = await Promise.all([
      axios.get(`${baseUrl}/rest/api/3/issue/${taskId}`, authConfig),
      axios.get(
        `${baseUrl}/rest/api/3/issue/${taskId}/comment?maxResults=3&orderBy=-created`,
        authConfig
      ),
    ]);

    const fields = issueRes.data.fields;

    const descricao = fields.description
      ? extractTextFromADF(fields.description)
      : "Sem descrição cadastrada.";

    const comentarios = (commentRes.data.comments || [])
      .slice(-3)
      .map((c) => extractTextFromADF(c.body))
      .filter(Boolean);

    console.log(`[JiraAgent] Task ${taskId} buscada com sucesso.`);
    return {
      titulo: fields.summary || taskId,
      descricao,
      status: fields.status?.name || "Desconhecido",
      comentarios,
    };
  } catch (error) {
    const status = error.response?.status ?? "NETWORK_ERROR";
    const detail =
      error.response?.data?.errorMessages?.join(", ") ||
      error.response?.data?.message ||
      error.message;
    throw new Error(`[JiraAgent] ${status}: ${detail}`);
  }
}

module.exports = { fetchJiraTask };
