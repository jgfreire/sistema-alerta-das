// Toda rota aqui passa por requireAuthApi + requireAdminApi antes de chegar no controller —
// aplicado uma vez, no mount point (ver server/src/app.js: app.use('/api/admin', requireAuthApi, requireAdminApi, adminRoutes)).
"use strict";

const express = require("express");
const userController = require("../controllers/userController");
const adminInfoController = require("../controllers/adminInfoController");
const memoriaModel = require("../models/memoriaModel");
const { logEvent } = require("../utils/logger");

const router = express.Router();

router.get("/dashboard", adminInfoController.dashboard);
router.get("/settings", adminInfoController.settings);
router.get("/logs", adminInfoController.logs);

router.get("/users", userController.list);
router.post("/users", userController.create);
router.put("/users/:id", userController.update);
router.post("/users/:id/role", userController.setRole);
router.post("/users/:id/password", userController.resetPassword);
router.post("/users/:id/block", userController.block);
router.post("/users/:id/unblock", userController.unblock);
router.delete("/users/:id", userController.remove);

// Memória do Alerta DAS: o administrador consulta e apaga (um cliente ou tudo).
router.get("/memoria", (req, res) => res.json(memoriaModel.listAll()));
router.delete("/memoria/:cnpj", (req, res) => {
  const cnpj = decodeURIComponent(req.params.cnpj);
  const removidos = memoriaModel.remove(cnpj);
  if (!removidos) return res.status(404).json({ error: "Cliente não encontrado na memória." });
  logEvent("MEMORIA_CLIENTE_REMOVIDO", { username: req.session.user.username, detail: cnpj });
  res.json({ ok: true });
});
router.delete("/memoria", (req, res) => {
  const removidos = memoriaModel.clear();
  logEvent("MEMORIA_LIMPA", { username: req.session.user.username, detail: `${removidos} cliente(s)` });
  res.json({ ok: true, removidos });
});

module.exports = router;
