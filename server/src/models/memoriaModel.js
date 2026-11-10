// Memória do Alerta DAS: por CNPJ, o mês mais recente e o anterior a ele (o par já analisado).
"use strict";

const db = require("../db/database");

function toEntry(r) {
  return {
    cnpj: r.cnpj,
    empresa: r.empresa,
    atual: { ano: r.atual_ano, mes: r.atual_mes, valor: r.atual_valor, faturamento: r.atual_faturamento },
    anterior: r.anterior_ano == null ? null : { ano: r.anterior_ano, mes: r.anterior_mes, valor: r.anterior_valor, faturamento: r.anterior_faturamento },
    atualizadoEm: r.atualizado_em,
    atualizadoPor: r.atualizado_por
  };
}

function listAll() {
  return db.prepare("SELECT * FROM das_memoria ORDER BY empresa COLLATE NOCASE").all().map(toEntry);
}

// Grava vários clientes de uma vez, tudo ou nada (transação).
function upsertMany(entries, username) {
  const stmt = db.prepare(`
    INSERT INTO das_memoria (cnpj, empresa, atual_ano, atual_mes, atual_valor, atual_faturamento, anterior_ano, anterior_mes, anterior_valor, anterior_faturamento, atualizado_em, atualizado_por)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    ON CONFLICT(cnpj) DO UPDATE SET
      empresa=excluded.empresa,
      atual_ano=excluded.atual_ano, atual_mes=excluded.atual_mes, atual_valor=excluded.atual_valor, atual_faturamento=excluded.atual_faturamento,
      anterior_ano=excluded.anterior_ano, anterior_mes=excluded.anterior_mes, anterior_valor=excluded.anterior_valor, anterior_faturamento=excluded.anterior_faturamento,
      atualizado_em=excluded.atualizado_em, atualizado_por=excluded.atualizado_por`);
  db.exec("BEGIN");
  try {
    for (const e of entries) {
      stmt.run(e.cnpj, e.empresa, e.atual.ano, e.atual.mes, e.atual.valor, e.atual.faturamento == null ? null : e.atual.faturamento,
        e.anterior ? e.anterior.ano : null, e.anterior ? e.anterior.mes : null, e.anterior ? e.anterior.valor : null,
        e.anterior && e.anterior.faturamento != null ? e.anterior.faturamento : null,
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
