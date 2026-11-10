"use strict";

const app = require("./app");
const env = require("./config/env");

// Sem login, só aceita conexões deste computador (ninguém da rede entra como administrador).
// Com REQUIRE_LOGIN=true volta a aceitar a rede.
app.listen(env.PORT, env.REQUIRE_LOGIN ? undefined : "127.0.0.1", () => {
  console.log(`Alerta DAS — servidor rodando em http://localhost:${env.PORT}`);
});
