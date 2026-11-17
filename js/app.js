// Tela do Alerta DAS (lote): lê vários PDFs no navegador, agrupa por CNPJ, compara os dois meses
// de cada cliente e gera uma planilha Excel única.
(function () {
  "use strict";

  const esc = CF.utils.escapeHtml;
  const $ = (id) => document.getElementById(id);
  const brl = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  // Faturamento ausente (sem relatório) aparece em branco, nunca como zero.
  // Variação em % com sinal (queda = negativa); "—" quando não dá para calcular (mês anterior zerado).
  const pctTxt = (p) => (p == null ? "—" : (p > 0 ? "+" : "") + p.toLocaleString("pt-BR") + "%");
  const fatTxt = (d) => (d.faturamento == null ? "" : brl(d.faturamento));

  // Lista acumulada: { arquivo, dados } ou { arquivo, erro }. `vistos` evita ler o mesmo arquivo duas vezes.
  let itens = [];
  const vistos = new Set();
  let lendo = false;
  let analise = null;

  async function pdfToText(file) {
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    try {
      let out = "";
      // O DAS tem 1 página; ler só as primeiras evita gastar tempo com PDFs longos enviados por engano.
      // O relatório de faturamento pode ter mais páginas (o "Total Geral" fica na última).
      for (let p = 1; p <= Math.min(pdf.numPages, 10); p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        out += content.items.map((i) => i.str).join(" ") + "\n";
      }
      return out;
    } finally {
      if (pdf.destroy) pdf.destroy(); // libera a memória de cada PDF: importante em lotes grandes
    }
  }

  async function lerArquivo(f) {
    if (!/\.pdf$/i.test(f.name)) return { arquivo: f.name, erro: "Não é um arquivo PDF." };
    try {
      return { arquivo: f.name, dados: CF.das.parseDocumento(await pdfToText(f)) };
    } catch (err) {
      return { arquivo: f.name, erro: err.message };
    }
  }

  function showErrors(msgs) {
    $("errors").innerHTML = msgs.map((m) => `<div class="alert alert-error">${esc(m)}</div>`).join("");
  }

  function renderLista() {
    const ok = itens.filter((i) => i.dados).length;
    const nDas = itens.filter((i) => i.dados && i.dados.tipo === "das").length;
    const nVen = itens.filter((i) => i.dados && i.dados.fonte === "saidas").length;
    const nSer = itens.filter((i) => i.dados && i.dados.fonte === "servicos").length;
    const ruins = itens.filter((i) => i.erro);
    $("files-summary").textContent = itens.length
      ? `${itens.length} arquivo(s): ${nDas} DAS, ${nVen} relatório(s) de vendas (saídas) e ${nSer} de serviços lidos com sucesso, ${ruins.length} com problema.`
      : "Nenhum arquivo selecionado";
    renderPrevia();
    $("file-list").innerHTML = ruins.map((i) => `<div class="bad">${esc(i.arquivo)} — ${esc(i.erro)}</div>`).join("");
    $("btn-analisar").disabled = lendo || ok === 0;
  }

  // Conferência do que foi lido, antes de analisar: uma linha por empresa e mês, com o valor lido de
  // cada tipo de documento. "—" = não enviado. O faturamento é a soma de vendas e serviços do que existe.
  function renderPrevia() {
    const el = $("preview");
    const linhas = new Map();
    for (const i of itens) {
      if (!i.dados) continue;
      const d = i.dados;
      const k = d.cnpj + "|" + (d.ano * 12 + d.mes);
      if (!linhas.has(k)) linhas.set(k, { cnpj: d.cnpj, ano: d.ano, mes: d.mes, empresa: "", das: [], saidas: [], servicos: [], dev: 0 });
      const l = linhas.get(k);
      if (d.tipo === "das") { l.empresa = d.empresa; l.das.push(d.valor); }
      else if (d.fonte === "saidas") { l.saidas.push(d.valor); l.dev += d.devolucoes || 0; }
      else l.servicos.push(d.valor);
    }
    if (!linhas.size) { el.innerHTML = ""; return; }
    const cel = (vals) => {
      const u = [...new Set(vals)];
      if (!u.length) return '<td class="num">—</td>';
      return u.length === 1 ? `<td class="num">${brl(u[0])}</td>` : `<td class="num bad">${u.map(brl).join(" / ")} (valores diferentes)</td>`;
    };
    const lista = [...linhas.values()].sort((a, b) => a.cnpj.localeCompare(b.cnpj) || (a.ano * 12 + a.mes) - (b.ano * 12 + b.mes));
    const corpo = lista.map((l) => {
      const v = [...new Set(l.saidas)], s = [...new Set(l.servicos)];
      const total = v.length > 1 || s.length > 1 ? null : (v.length || s.length ? (v[0] || 0) + (s[0] || 0) : null);
      return `<tr><td>${esc(l.empresa || "—")}</td><td>${esc(l.cnpj)}</td><td>${CF.das.fmtComp(l)}</td>${cel(l.das)}${cel(l.saidas)}<td class="num">${l.dev ? brl(l.dev) : "—"}</td>${cel(l.servicos)}<td class="num">${total == null ? "—" : brl(Math.round(total * 100) / 100)}</td></tr>`;
    }).join("");
    el.innerHTML = `<h3>Conferência do que foi lido</h3>
      <div class="scroll"><table class="das-result"><thead><tr><th>Empresa</th><th>CNPJ</th><th>Competência</th><th>DAS</th><th>Vendas (saídas)</th><th>Devoluções (fora do faturamento)</th><th>Serviços</th><th>Faturamento (vendas + serviços)</th></tr></thead><tbody>${corpo}</tbody></table></div>
      <p class="slot-status">O faturamento só vale para o mês que tiver DAS (enviado agora ou já guardado na memória). Mês sem relatório fica em branco.</p>`;
  }

  async function adicionarArquivos(fileList) {
    if (lendo) return;
    const novos = [...fileList].filter((f) => {
      const chave = f.name + "|" + f.size + "|" + f.lastModified;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });
    if (!novos.length) return;
    showErrors([]);
    lendo = true;
    $("btn-analisar").disabled = true;
    $("progress-area").classList.remove("hidden");
    $("progress-bar").style.width = "0%";
    $("progress-text").textContent = `Lendo 0 de ${novos.length}…`;

    // Lê vários arquivos ao mesmo tempo (4), guardando o resultado na posição de cada um.
    const lidos = new Array(novos.length);
    let proximo = 0, concluidos = 0;
    const trabalhador = async () => {
      while (proximo < novos.length) {
        const n = proximo++;
        lidos[n] = await lerArquivo(novos[n]);
        concluidos++;
        $("progress-text").textContent = `Lendo ${concluidos} de ${novos.length}…`;
        $("progress-bar").style.width = Math.round((concluidos / novos.length) * 100) + "%";
      }
    };
    await Promise.all([trabalhador(), trabalhador(), trabalhador(), trabalhador()]);
    itens.push(...lidos);

    $("progress-bar").style.width = "100%";
    $("progress-text").textContent = "Leitura concluída.";
    lendo = false;
    renderLista();
  }

  function limpar() {
    if (lendo) return;
    itens = [];
    vistos.clear();
    analise = null;
    $("input-files").value = "";
    $("progress-area").classList.add("hidden");
    showErrors([]);
    renderLista();
  }

  function logEvento(event) {
    fetch("/api/activity/log", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event })
    }).catch(() => {});
  }

  async function analisar() {
    // A memória (últimos meses de cada cliente) é lida do servidor a cada análise.
    let memoria;
    try {
      const res = await fetch("/api/memoria", { credentials: "same-origin" });
      if (res.status === 401) { window.location.href = "/login"; return; }
      if (!res.ok) throw new Error("HTTP " + res.status);
      memoria = await res.json();
    } catch (err) {
      showErrors(["Não foi possível ler a memória do sistema (" + err.message + "). A análise foi cancelada para não dar resultado errado. Tente de novo."]);
      return;
    }
    showErrors([]);

    analise = CF.das.analyzeBatch(itens, memoria);
    const { resultados, pendencias, resumo } = analise;

    // Guarda o par de meses de cada cliente analisado; o mês mais antigo sai da memória.
    let avisoMemoria = "";
    if (analise.memoriaNova.length) {
      try {
        const res = await fetch("/api/memoria", {
          method: "PUT", credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ entradas: analise.memoriaNova })
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        avisoMemoria = `<div class="alert alert-ok">Memória atualizada: ${analise.memoriaNova.length} cliente(s). ${resumo.daMemoria} comparação(ões) usaram o mês anterior guardado.</div>`;
      } catch (err) {
        avisoMemoria = `<div class="alert alert-error">A análise está pronta, mas NÃO foi possível salvar na memória (${esc(err.message)}). No próximo mês será preciso enviar os dois meses de novo.</div>`;
      }
    }

    const linhas = resultados.map((r) => `
      <tr>
        <td class="lvl ${r.alerta.cor}">${esc(r.alerta.texto)}</td>
        <td>${esc(r.empresa)}</td>
        <td>${CF.das.fmtComp(r.anterior)}</td><td class="num">${brl(r.anterior.valor)}</td><td class="num">${fatTxt(r.anterior)}</td>
        <td>${CF.das.fmtComp(r.atual)}</td><td class="num">${brl(r.atual.valor)}</td><td class="num">${fatTxt(r.atual)}</td>
        <td class="num">${brl(r.varImposto.valor)}</td><td class="num">${pctTxt(r.varImposto.pct)}</td>
        <td class="num">${r.varFat ? brl(r.varFat.valor) : ""}</td><td class="num">${r.varFat ? pctTxt(r.varFat.pct) : ""}</td>
      </tr>`).join("");

    const pend = pendencias.length ? `
      <h3>Pendências (${pendencias.length})</h3>
      <div class="scroll"><table class="das-result"><thead><tr><th>Empresa</th><th>Arquivo(s)</th><th>Motivo</th></tr></thead><tbody>
      ${pendencias.map((p) => `<tr><td>${esc(p.empresa || "—")}</td><td>${esc(p.arquivo)}</td><td>${esc(p.motivo)}</td></tr>`).join("")}
      </tbody></table></div>` : "";

    $("result-content").innerHTML = `
      ${avisoMemoria}
      <div class="summary">
        <div class="chip vermelho">${resumo["Crítico"]}<small>Crítico (vermelho)</small></div>
        <div class="chip amarelo">${resumo["Atenção"]}<small>Atenção (amarelo)</small></div>
        <div class="chip verde">${resumo["Normalidade"]}<small>Normalidade (verde)</small></div>
        <div class="chip cinza">${resumo.pendencias}<small>Pendências</small></div>
      </div>
      <p class="slot-status">Variações sempre sobre o mês anterior (queda = negativa). A cor do alerta vem só da variação do imposto (DAS); a do faturamento é informativa.</p>
      ${resultados.length ? `<div class="scroll"><table class="das-result">
        <thead><tr><th>Alerta</th><th>Empresa</th><th>Comp. anterior</th><th>Valor anterior</th><th>Faturamento anterior</th><th>Comp. atual</th><th>Valor atual</th><th>Faturamento atual</th><th>Variação do imposto (R$)</th><th>Variação do imposto (%)</th><th>Variação do faturamento (R$)</th><th>Variação do faturamento (%)</th></tr></thead>
        <tbody>${linhas}</tbody></table></div>` : "<p>Nenhum cliente pôde ser comparado.</p>"}
      ${pend}`;

    $("upload-screen").classList.add("hidden");
    $("result-screen").classList.remove("hidden");
    $("download-error").innerHTML = "";
    $("btn-baixar").disabled = resultados.length === 0 && pendencias.length === 0;
    logEvento("ANALISE_EXECUTADA");
  }

  const CORES = { verde: "FFC6EFCE", amarelo: "FFFFEB9C", vermelho: "FFFFC7CE" };
  const CORES_TEXTO = { verde: "FF006100", amarelo: "FF7A5B00", vermelho: "FF9C0006" };
  const FILL = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

  function showDownloadError(msg) {
    $("download-error").innerHTML = `<div class="alert alert-error">${esc(msg)}</div>`;
  }

  async function baixar() {
    $("download-error").innerHTML = "";
    try {
      await gerarPlanilha();
    } catch (err) {
      console.error("[planilha]", err);
      showDownloadError("Não foi possível gerar a planilha: " + (err && err.message ? err.message : err));
    }
  }

  function cabecalho(ws, titulos, larguras) {
    ws.columns = larguras.map((width) => ({ width }));
    const head = ws.addRow(titulos);
    head.font = { bold: true };
    head.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    head.height = 30;
    head.eachCell((c) => { c.border = { bottom: { style: "thin" } }; c.fill = FILL("FFEDEDED"); });
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }

  async function gerarPlanilha() {
    if (!analise) return;
    if (typeof ExcelJS === "undefined") {
      throw new Error("a biblioteca de planilhas (ExcelJS) não carregou. Verifique a conexão com a internet e recarregue a página (Ctrl+F5).");
    }
    const wb = new ExcelJS.Workbook();

    // Aba 1: um cliente por linha. O alerta fica na primeira coluna, escrito e colorido.
    const ws = wb.addWorksheet("Alertas");
    cabecalho(ws,
      ["Alerta", "Empresa", "CNPJ", "Competência (anterior)", "Valor total (anterior)", "Faturamento (anterior)", "Competência (atual)", "Valor total (atual)", "Faturamento (atual)", "Variação do imposto (R$)", "Variação do imposto (%)", "Variação do faturamento (R$)", "Variação do faturamento (%)", "Observação"],
      [22, 42, 21, 15, 18, 18, 15, 18, 18, 18, 16, 20, 18, 48]);
    for (const r of analise.resultados) {
      // Sem relatório de faturamento a célula fica vazia (null), nunca zero.
      const row = ws.addRow([
        r.alerta.texto, r.empresa, r.cnpj,
        CF.das.fmtComp(r.anterior), r.anterior.valor, r.anterior.faturamento == null ? null : r.anterior.faturamento,
        CF.das.fmtComp(r.atual), r.atual.valor, r.atual.faturamento == null ? null : r.atual.faturamento,
        r.varImposto.valor, r.varImposto.pct == null ? "—" : r.varImposto.pct / 100,
        r.varFat ? r.varFat.valor : null, r.varFat ? (r.varFat.pct == null ? "—" : r.varFat.pct / 100) : null,
        r.observacao || ""
      ]);
      const a = row.getCell(1);
      a.fill = FILL(CORES[r.alerta.cor]);
      a.font = { bold: true, color: { argb: CORES_TEXTO[r.alerta.cor] } };
      [5, 6, 8, 9, 10, 12].forEach((c) => { row.getCell(c).numFmt = '"R$" #,##0.00'; });
      [11, 13].forEach((c) => { row.getCell(c).numFmt = "+0.00%;-0.00%;0.00%"; });
      [4, 7].forEach((c) => { row.getCell(c).alignment = { horizontal: "center" }; });
    }
    ws.autoFilter = { from: "A1", to: "N1" };

    // Aba 2: o que ficou de fora e por quê.
    const wp = wb.addWorksheet("Pendências");
    cabecalho(wp, ["Empresa", "Arquivo(s)", "Motivo"], [42, 60, 80]);
    for (const p of analise.pendencias) wp.addRow([p.empresa || "—", p.arquivo, p.motivo]);

    const buf = await wb.xlsx.writeBuffer();
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    a.download = `Alerta DAS - ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}h${pad(d.getMinutes())}.xlsx`;
    a.style.display = "none";
    document.body.appendChild(a); // alguns navegadores ignoram o clique em links fora da página
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 60000);
    logEvento("RELATORIO_GERADO");
  }

  function novo() {
    limpar();
    $("result-screen").classList.add("hidden");
    $("upload-screen").classList.remove("hidden");
  }

  document.addEventListener("DOMContentLoaded", () => {
    const input = $("input-files");
    const drop = $("drop");
    input.addEventListener("change", () => { adicionarArquivos(input.files); input.value = ""; });
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); adicionarArquivos(e.dataTransfer.files); });
    $("btn-analisar").addEventListener("click", analisar);
    $("btn-limpar").addEventListener("click", limpar);
    $("btn-baixar").addEventListener("click", baixar);
    $("btn-novo").addEventListener("click", novo);
    renderLista();
  });
})();
