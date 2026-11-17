// Memória do Alerta DAS. Leitura e gravação para qualquer usuário logado (é o que a tela usa em
// cada análise); excluir da memória é só do administrador (ver adminRoutes).
"use strict";

const express = require("express");
const memoriaModel = require("../models/memoriaModel");
const { logEvent } = require("../utils/logger");

const router = express.Router();

const CNPJ_RE = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/;

// Faturamento é opcional (sem relatório = null), mas se vier tem que ser número >= 0.
function fatValido(v) {
  return v == null || (typeof v === "number" && Number.isFinite(v) && v >= 0);
}

function mesValido(m) {
  return m && Number.isInteger(m.ano) && m.ano >= 2000 && m.ano <= 2100 &&
    Number.isInteger(m.mes) && m.mes >= 1 && m.mes <= 12 &&
    typeof m.valor === "number" && Number.isFinite(m.valor) && m.valor >= 0 &&
    fatValido(m.fatServicos) && fatValido(m.fatSaidas);
}

function entradaValida(e) {
  return e && typeof e.cnpj === "string" && CNPJ_RE.test(e.cnpj) &&
    typeof e.empresa === "string" && e.empresa.trim().length > 0 && e.empresa.length <= 200 &&
    mesValido(e.atual) && (e.anterior == null || mesValido(e.anterior)) &&
    (e.anterior == null || e.anterior.ano * 12 + e.anterior.mes < e.atual.ano * 12 + e.atual.mes);
}

router.get("/", (req, res) => {
  res.json(memoriaModel.listAll());
});

router.put("/", (req, res) => {
  const { entradas } = req.body || {};
  if (!Array.isArray(entradas) || entradas.length > 5000 || !entradas.every(entradaValida)) {
    return res.status(400).json({ error: "Dados da memória inválidos." });
  }
  memoriaModel.upsertMany(entradas, req.session.user.username);
  logEvent("MEMORIA_ATUALIZADA", { username: req.session.user.username, detail: `${entradas.length} cliente(s)` });
  res.json({ ok: true, total: entradas.length });
});

module.exports = router;
