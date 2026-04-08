const axios = require("axios");

// Para GitLab self-hosted: adicione GITLAB_BASE_URL no .env
// Ex: GITLAB_BASE_URL=https://gitlab.onfly.com.br
const GITLAB_BASE_URL = process.env.GITLAB_BASE_URL || "https://gitlab.com";
const GITLAB_GROUP_ID = process.env.GITLAB_GROUP_ID || process.env.GITLAB_PROJECT_ID;

function limitDiff(diffText, maxLines = 200) {
  const lines = diffText.split("\n");
  if (lines.length <= maxLines) return diffText;
  return (
    lines.slice(0, maxLines).join("\n") +
    `\n\n[... diff truncado após ${maxLines} linhas ...]`
  );
}

async function fetchGitlabMR(taskId) {
  const headers = { "PRIVATE-TOKEN": process.env.GITLAB_API_TOKEN };

  try {
    // 1ª chamada: busca MRs que mencionam o taskId
    const mrListRes = await axios.get(
      `${GITLAB_BASE_URL}/api/v4/groups/${GITLAB_GROUP_ID}/merge_requests`,
      {
        headers,
        timeout: 8000,
        params: { search: taskId, state: "all", per_page: 5, order_by: "updated_at" },
      }
    );

    const mrs = mrListRes.data;
    if (!mrs || mrs.length === 0) {
      throw new Error(`[GitlabAgent] 404: Nenhum MR encontrado para a task ${taskId}`);
    }

    const mr = mrs[0];
    console.log(
      `[GitlabAgent] MR encontrado: "${mr.title}" (project_id: ${mr.project_id}, iid: ${mr.iid})`
    );

    // 2ª chamada: busca o diff do MR
    const changesRes = await axios.get(
      `${GITLAB_BASE_URL}/api/v4/projects/${mr.project_id}/merge_requests/${mr.iid}/changes`,
      { headers, timeout: 10000 }
    );

    const changes = changesRes.data.changes || [];
    const rawDiff = changes
      .map((c) => `--- a/${c.old_path}\n+++ b/${c.new_path}\n${c.diff}`)
      .join("\n\n");

    console.log(`[GitlabAgent] Diff obtido: ${changes.length} arquivo(s) alterado(s).`);
    return {
      titulo_mr: mr.title,
      descricao_mr: mr.description || "Sem descrição.",
      resumo_do_diff: limitDiff(rawDiff),
    };
  } catch (error) {
    // Repassa erros que já foram formatados (ex: "nenhum MR encontrado")
    if (error.message.startsWith("[GitlabAgent]")) throw error;

    const status = error.response?.status ?? "NETWORK_ERROR";
    const detail =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message;
    throw new Error(`[GitlabAgent] ${status}: ${detail}`);
  }
}

module.exports = { fetchGitlabMR };
