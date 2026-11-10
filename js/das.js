// Lógica do Alerta DAS: lê o texto do "Documento de Arrecadação do Simples Nacional" e
// classifica a variação entre dois documentos. Sem dependência de navegador — roda também no Node (testes).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.CF = root.CF || {}; root.CF.das = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const MONEY = String.raw`(\d{1,3}(?:\.\d{3})*,\d{2})`;

  function semAcento(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  function parseMoney(txt) {
    return Math.round(parseFloat(String(txt).replace(/\./g, "").replace(",", ".")) * 100) / 100;
  }

  // Extrai { cnpj, empresa, ano, mes, valor } do texto do DAS. Lança Error com mensagem clara se não achar.
  function parseDasText(raw) {
    const text = semAcento(String(raw || "")).replace(/\s+/g, " ");
    if (!/Arrecadacao do Simples Nacional/i.test(text)) {
      throw new Error("O arquivo não parece ser um Documento de Arrecadação do Simples Nacional (DAS).");
    }

    const cnpjM = text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
    if (!cnpjM) throw new Error("CNPJ não encontrado no documento.");
    const cnpj = cnpjM[0];

    // Nome da empresa: texto entre o CNPJ e o cabeçalho "Período de Apuração". Não depende do
    // rótulo "Razão Social", que o leitor de PDF do navegador entrega em ordem diferente.
    const nomeM = text.match(new RegExp(cnpj.replace(/[.\/-]/g, "\\$&") + String.raw`\s+(.+?)\s+Periodo de Apuracao`, "i"));
    const empresa = nomeM ? nomeM[1].trim() : "";
    if (!empresa) throw new Error("Nome da empresa não encontrado no documento.");

    // Competência: primeiro "mês/ano" (ex.: agosto/2026) depois do cabeçalho "Período de Apuração".
    const perM = text.match(new RegExp(String.raw`Periodo de Apuracao.*?\b(` + MESES.join("|") + String.raw`)\s*/\s*(\d{4})`, "i"));
    if (!perM) throw new Error("Período de apuração (competência) não encontrado no documento.");
    const mes = MESES.indexOf(perM[1].toLowerCase()) + 1;
    const ano = parseInt(perM[2], 10);

    // O campo "Totais" da composição sai fora de ordem em alguns PDFs; só serve de reserva.
    const totM =
      text.match(new RegExp(String.raw`Valor Total do Documento\s+` + MONEY, "i")) ||
      text.match(new RegExp(String.raw`Totais\s+` + MONEY, "i"));
    if (!totM) throw new Error("Valor total do documento não encontrado.");
    const valor = parseMoney(totM[1]);

    return { cnpj, empresa, ano, mes, valor };
  }

  // Relatório "ACOMPANHAMENTO DE SERVIÇOS" (faturamento do mês). Devolve { cnpj, ano, mes, valor }.
  // O faturamento é o "Valor Contábil" da linha "Total Geral". O leitor de PDF entrega as colunas
  // fora de ordem (o Valor Contábil vem depois do "Tipo", ex.: "Total Geral 0,00 0,00 23.000,00 0,00 ISS 23.000,00"),
  // por isso o valor é o que vem logo depois do tipo (ISS, ICMS...). Se não houver exatamente um, não chuta.
  function parseFaturamentoText(raw) {
    const text = semAcento(String(raw || "")).replace(/\s+/g, " ");
    if (!/ACOMPANHAMENTO DE SERVICOS/i.test(text)) {
      throw new Error("O arquivo não parece ser o relatório de faturamento (Acompanhamento de Serviços).");
    }

    const cnpjM = text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
    if (!cnpjM) throw new Error("CNPJ não encontrado no relatório de faturamento.");

    const perM = text.match(/Periodo:\s*(\d{2})\/(\d{2})\/(\d{4})\s+ate\s+(\d{2})\/(\d{2})\/(\d{4})/i);
    if (!perM) throw new Error("Período não encontrado no relatório de faturamento.");
    if (perM[2] !== perM[5] || perM[3] !== perM[6]) {
      throw new Error("O relatório de faturamento cobre mais de um mês (" + perM[1] + "/" + perM[2] + "/" + perM[3] + " até " + perM[4] + "/" + perM[5] + "/" + perM[6] + "). Gere um relatório por mês.");
    }

    const i = text.toLowerCase().lastIndexOf("total geral");
    if (i < 0) throw new Error("Linha \"Total Geral\" não encontrada no relatório de faturamento.");
    const valores = [...text.slice(i).matchAll(new RegExp(String.raw`\b[A-Z]{2,}\s+` + MONEY, "g"))].map((m) => parseMoney(m[1]));
    if (valores.length !== 1) {
      throw new Error("Não foi possível identificar com segurança o valor do \"Total Geral\" no relatório de faturamento.");
    }

    return { cnpj: cnpjM[0], ano: parseInt(perM[3], 10), mes: parseInt(perM[2], 10), valor: valores[0] };
  }

  // Descobre se o PDF é um DAS ou um relatório de faturamento. `tipo` diz qual.
  function parseDocumento(raw) {
    const text = semAcento(String(raw || ""));
    if (/ACOMPANHAMENTO DE SERVICOS/i.test(text) && !/Arrecadacao do Simples Nacional/i.test(text)) {
      return Object.assign({ tipo: "faturamento" }, parseFaturamentoText(raw));
    }
    return Object.assign({ tipo: "das" }, parseDasText(raw));
  }

  // Níveis: até 20% normalidade, 21–50% atenção, acima de 50% crítico (aumento ou queda).
  function classify(valorAnterior, valorAtual) {
    let pct;
    if (valorAnterior === 0) pct = valorAtual === 0 ? 0 : Infinity;
    else pct = (Math.abs(valorAtual - valorAnterior) / valorAnterior) * 100;
    const pctArred = Math.round(pct * 100) / 100;
    let nivel, cor;
    if (pct <= 20) { nivel = "Normalidade"; cor = "verde"; }
    else if (pct <= 50) { nivel = "Atenção"; cor = "amarelo"; }
    else { nivel = "Crítico"; cor = "vermelho"; }
    return { nivel, cor, pct: pctArred, texto: nivel + " (" + cor + ")" };
  }

  function fmtComp(d) { return String(d.mes).padStart(2, "0") + "/" + d.ano; }

  // Recebe dois resultados de parseDasText, valida e ordena por competência.
  function compare(a, b) {
    if (a.cnpj !== b.cnpj) {
      throw new Error("Os dois documentos são de empresas diferentes (" + a.cnpj + " e " + b.cnpj + ").");
    }
    const ka = a.ano * 12 + a.mes, kb = b.ano * 12 + b.mes;
    if (ka === kb) throw new Error("Os dois documentos têm a mesma competência (" + fmtComp(a) + ").");
    const [ant, atu] = ka < kb ? [a, b] : [b, a];
    return {
      empresa: atu.empresa, cnpj: atu.cnpj, anterior: ant, atual: atu,
      diferenca: Math.round((atu.valor - ant.valor) * 100) / 100,
      alerta: classify(ant.valor, atu.valor)
    };
  }

  const ORDEM_NIVEL = { "Crítico": 0, "Atenção": 1, "Normalidade": 2 };

  const chave = (d) => d.ano * 12 + d.mes;
  const fmtBRL = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Lote com memória. `items` = [{ arquivo, dados }] (dados = parseDasText) ou [{ arquivo, erro }].
  // `memoria` = [{ cnpj, empresa, atual:{ano,mes,valor}, anterior:{...}|null }] (o que já ficou guardado).
  // Para cada cliente enviado: junta os meses dos PDFs com os da memória, compara os dois mais recentes
  // e devolve em `memoriaNova` o par que deve ficar guardado (o mês mais antigo é descartado).
  function analyzeBatch(items, memoria) {
    const pendencias = [];
    const porCnpj = new Map();      // DAS enviados, por CNPJ
    const fatPorCnpj = new Map();   // relatórios de faturamento enviados, por CNPJ
    const mem = new Map((memoria || []).map((m) => [m.cnpj, m]));

    for (const it of items) {
      if (it.erro) { pendencias.push({ arquivo: it.arquivo, empresa: "", motivo: it.erro }); continue; }
      const alvo = it.dados.tipo === "faturamento" ? fatPorCnpj : porCnpj;
      if (!alvo.has(it.dados.cnpj)) alvo.set(it.dados.cnpj, []);
      alvo.get(it.dados.cnpj).push(it);
    }

    const resultados = [];
    const memoriaNova = [];
    let usaramMemoria = 0;

    for (const cnpj of new Set([...porCnpj.keys(), ...fatPorCnpj.keys()])) {
      const docs = porCnpj.get(cnpj) || [];
      const fats = fatPorCnpj.get(cnpj) || [];
      const m = mem.get(cnpj);
      const arquivos = [...docs, ...fats].map((d) => d.arquivo).join(" | ");
      const empresa = docs.length ? docs[docs.length - 1].dados.empresa : (m ? m.empresa : "");
      const pool = new Map(); // competência -> { dados, daMemoria, enviado }
      if (m) {
        for (const x of [m.atual, m.anterior]) {
          if (x) pool.set(x.ano * 12 + x.mes, { dados: { cnpj, empresa, ano: x.ano, mes: x.mes, valor: x.valor, faturamento: x.faturamento == null ? null : x.faturamento }, daMemoria: true, enviado: false });
        }
      }

      let conflito = null;
      for (const d of docs) {
        const k = chave(d.dados);
        const ja = pool.get(k);
        if (!ja) pool.set(k, { dados: Object.assign({}, d.dados, { faturamento: null }), daMemoria: false, enviado: true });
        else if (ja.dados.valor === d.dados.valor) ja.enviado = true;
        else if (ja.daMemoria) conflito = "O DAS de " + fmtComp(d.dados) + " veio com valor " + fmtBRL(d.dados.valor) + ", mas a memória tem " + fmtBRL(ja.dados.valor) + " para essa competência (retificação?). Nada foi alterado: se o novo valor estiver certo, apague o cliente da memória no painel administrativo e envie de novo.";
        else conflito = "A competência " + fmtComp(d.dados) + " aparece em mais de um DAS com valores diferentes.";
      }
      if (conflito) { pendencias.push({ arquivo: arquivos, empresa, motivo: conflito }); continue; }

      // Faturamento: cada relatório entra na competência do mesmo mês do DAS (enviado agora ou já guardado).
      // Nunca se inventa valor: sem relatório, o faturamento fica em branco.
      const obsFat = [];
      let fatAplicado = 0;
      const fatPorComp = new Map();
      for (const f of fats) {
        const k = chave(f.dados);
        if (!fatPorComp.has(k)) fatPorComp.set(k, []);
        fatPorComp.get(k).push(f);
      }
      for (const [k, lista] of fatPorComp) {
        const alvo = pool.get(k);
        const comp = fmtComp(lista[0].dados);
        if (!alvo) {
          pendencias.push({ arquivo: lista.map((f) => f.arquivo).join(" | "), empresa, motivo: "Relatório de faturamento de " + comp + " sem o DAS dessa competência (envie o DAS junto, ou ele precisa já estar na memória). O faturamento não foi guardado." });
          continue;
        }
        const valores = [...new Set(lista.map((f) => f.dados.valor))];
        if (valores.length > 1) { obsFat.push("Faturamento de " + comp + ": relatórios com valores diferentes, nada foi alterado."); continue; }
        if (alvo.dados.faturamento != null && alvo.dados.faturamento !== valores[0]) {
          obsFat.push("Faturamento de " + comp + " atualizado: era " + fmtBRL(alvo.dados.faturamento) + ", agora " + fmtBRL(valores[0]) + ".");
        }
        alvo.dados.faturamento = valores[0];
        fatAplicado++;
      }
      if (!pool.size || (!docs.length && !fatAplicado)) continue; // nada novo para este cliente

      const chaves = [...pool.keys()].sort((x, y) => x - y);
      const topo = chaves.slice(-2).map((k) => pool.get(k));
      const mesGuardado = (x) => ({ ano: x.dados.ano, mes: x.dados.mes, valor: x.dados.valor, faturamento: x.dados.faturamento == null ? null : x.dados.faturamento });
      const guardar = (par) => memoriaNova.push({
        cnpj, empresa,
        atual: mesGuardado(par[par.length - 1]),
        anterior: par.length > 1 ? mesGuardado(par[0]) : null
      });

      if (chaves.length < 2) {
        guardar(topo);
        pendencias.push({ arquivo: arquivos, empresa, motivo: "Só existe o DAS de " + fmtComp(topo[0].dados) + ": ele foi guardado na memória. Envie o DAS do mês seguinte para comparar." });
        continue;
      }

      const [ant, atu] = topo;
      const r = compare(ant.dados, atu.dados);
      const obs = [...obsFat];
      if (ant.daMemoria && !ant.enviado) { obs.push("Mês anterior (" + fmtComp(ant.dados) + ") veio da memória."); usaramMemoria++; }
      if (chaveDif(ant.dados, atu.dados) > 1) obs.push("Entre " + fmtComp(ant.dados) + " e " + fmtComp(atu.dados) + " há mês(es) sem DAS comparado.");
      const ignorados = chaves.slice(0, -2).map((k) => pool.get(k)).filter((x) => x.enviado);
      if (ignorados.length) obs.push("DAS de " + ignorados.map((x) => fmtComp(x.dados)).join(", ") + " ignorado(s): mais antigo(s) que os dois meses analisados.");
      r.observacao = obs.join(" ");
      resultados.push(r);
      guardar(topo);
    }

    resultados.sort((a, b) =>
      ORDEM_NIVEL[a.alerta.nivel] - ORDEM_NIVEL[b.alerta.nivel] ||
      b.alerta.pct - a.alerta.pct ||
      a.empresa.localeCompare(b.empresa, "pt-BR"));
    pendencias.sort((a, b) => a.empresa.localeCompare(b.empresa, "pt-BR") || a.arquivo.localeCompare(b.arquivo, "pt-BR"));

    const resumo = { total: resultados.length, "Crítico": 0, "Atenção": 0, "Normalidade": 0, pendencias: pendencias.length, daMemoria: usaramMemoria };
    for (const r of resultados) resumo[r.alerta.nivel]++;
    return { resultados, pendencias, resumo, memoriaNova };
  }

  function chaveDif(a, b) { return chave(b) - chave(a); }

  return { parseDasText, parseFaturamentoText, parseDocumento, classify, compare, fmtComp, analyzeBatch };
});
