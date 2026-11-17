// Memória do Alerta DAS: por CNPJ, o mês mais recente e o anterior a ele (o par já analisado).
"use strict";

const db = require("../db/database");

// Faturamento do mês = soma das fontes que existem (serviços e saídas); null se não houver nenhuma.
function mes(ano, m, valor, fatServicos, fatSaidas) {
  const faturamento = fatServicos == null && fatSaidas == null ? null : Math.round(((fatServicos || 0) + (fatSaidas || 0)) * 100) / 100;
  return { ano, mes: m, valor, fatServicos, fatSaidas, faturamento };
}

function toEntry(r) {
  return {
    cnpj: r.cnpj,
    empresa: r.empresa,
    atual: mes(r.atual_ano, r.atual_mes, r.atual_valor, r.atual_fat_servicos, r.atual_fat_saidas),
    anterior: r.anterior_ano == null ? null : mes(r.anterior_ano, r.anterior_mes, r.anterior_valor, r.anterior_fat_servicos, r.anterior_fat_saidas),
    atualizadoEm: r.atualizado_em,
    atualizadoPor: r.atualizado_por
  };
}

const nul = (v) => (v == null ? null : v);

function listAll() {
  return db.prepare("SELECT * FROM das_memoria ORDER BY empresa COLLATE NOCASE").all().map(toEntry);
}

// Grava vários clientes de uma vez, tudo ou nada (transação).
function upsertMany(entries, username) {
  const stmt = db.prepare(`
    INSERT INTO das_memoria (cnpj, empresa, atual_ano, atual_mes, atual_valor, atual_fat_servicos, atual_fat_saidas, anterior_ano, anterior_mes, anterior_valor, anterior_fat_servicos, anterior_fat_saidas, atualizado_em, atualizado_por)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    ON CONFLICT(cnpj) DO UPDATE SET
      empresa=excluded.empresa,
      atual_ano=excluded.atual_ano, atual_mes=excluded.atual_mes, atual_valor=excluded.atual_valor, atual_fat_servicos=excluded.atual_fat_servicos, atual_fat_saidas=excluded.atual_fat_saidas,
      anterior_ano=excluded.anterior_ano, anterior_mes=excluded.anterior_mes, anterior_valor=excluded.anterior_valor,
      anterior_fat_servicos=excluded.anterior_fat_servicos, anterior_fat_saidas=excluded.anterior_fat_saidas,
      atualizado_em=excluded.atualizado_em, atualizado_por=excluded.atualizado_por`);
  db.exec("BEGIN");
  try {
    for (const e of entries) {
      stmt.run(e.cnpj, e.empresa, e.atual.ano, e.atual.mes, e.atual.valor, nul(e.atual.fatServicos), nul(e.atual.fatSaidas),
        e.anterior ? e.anterior.ano : null, e.anterior ? e.anterior.mes : null, e.anterior ? e.anterior.valor : null,
        e.anterior ? nul(e.anterior.fatServicos) : null, e.anterior ? nul(e.anterior.fatSaidas) : null,
        username || null);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function remove(cnpj) {
  return db.prepare("DELETE FROM das_memoria WHERE cnpj = ?").run(cnpj).changes;
}

function clear() {
  return db.prepare("DELETE FROM das_memoria").run().changes;
}

module.exports = { listAll, upsertMany, remove, clear };
