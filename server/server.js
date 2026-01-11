const express = require("express");
const cors = require("cors");
const authRoutes = require("./auth");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", authRoutes);

app.listen(3000, () => {
  console.log("🚀 Сервер запущен: http://localhost:3000");
});
