"use strict";

const app = require("./app");
const env = require("./config/env");

// Sempre disponível na rede (todas as interfaces), não só neste computador.
app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`Alerta DAS — servidor rodando em http://localhost:${env.PORT}`);
});
