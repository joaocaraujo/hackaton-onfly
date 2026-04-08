const express = require("express");

const app = express();
const PORT = process.env.PORT || 3001;

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Backend rodando na porta ${PORT}`);
});
