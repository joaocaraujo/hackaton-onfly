require("dotenv").config();

const express = require("express");
const cors = require("cors");
const chatRoutes = require("./src/routes/chat");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/chat", chatRoutes);

app.listen(PORT, () => {
  console.log(`BrainFly backend rodando na porta ${PORT}`);
});
