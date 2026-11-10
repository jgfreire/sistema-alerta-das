# Alerta DAS

Compara o valor total do DAS (Simples Nacional) de dois meses para **vários clientes de uma vez**
(sem limite fixo; testado com 300 PDFs simulados = 150 clientes) e gera uma planilha Excel única.

- Entrada: todos os PDFs de DAS de uma vez (arrastar ou selecionar). O sistema lê no navegador e agrupa pelo CNPJ.
- Saída (`.xlsx`):
  - aba **Alertas**: um cliente por linha, com o alerta na primeira coluna (texto + cor), empresa, CNPJ,
    competência e valor total dos dois DAS, variação em R$ e %. Ordenada do mais grave para o menos grave.
  - aba **Pendências**: o que não pôde ser analisado e o motivo (PDF que não é DAS, cliente com só 1 DAS,
    mesma competência com valores diferentes).
- **Faturamento:** além do DAS, o sistema lê o relatório "Acompanhamento de Serviços" (um por cliente e por mês; período dentro de um único mês). O faturamento é o "Valor Contábil" da linha "Total Geral". Ele é ligado ao DAS pelo CNPJ e pela competência, aparece nas colunas "Faturamento (anterior/atual)" da planilha e fica guardado na memória junto com o mês. Sem relatório, a célula fica em branco (nunca zero, nunca estimado). Relatório sem DAS correspondente, com mais de um mês, ou com total não identificado, vai para Pendências.
- Alerta (variação em módulo sobre o DAS mais antigo): até 20% = Normalidade (verde); 21% a 50% = Atenção (amarelo); acima de 50% = Crítico (vermelho).
- **Memória:** para cada cliente o sistema guarda (no servidor) o mês mais recente e o anterior. Depois da primeira vez basta enviar só o mês novo: ele compara com o mês guardado, grava o novo par e descarta o mais antigo (ex.: guardado 8 e 9; ao enviar o 10, compara 9 x 10 e o 8 é apagado). Reenviar o mesmo mês não muda nada. Se o valor de um mês enviado for diferente do guardado (retificação), o cliente vai para Pendências sem alterar a memória; o administrador pode apagar o cliente na aba "Memória DAS" do painel e reenviar.
- Se um cliente tiver mais de 2 competências, compara as duas mais recentes e avisa na coluna Observação.
- Colaboradores usam a tela principal; o administrador tem acesso a tudo (painel em `/admin`, com atalho para a tela principal).

## Iniciar
1. Copie `server/.env.example` para `server/.env` e preencha (use `npm run hash-password -- "senha"` dentro de `server/`).
2. Em `server/`: `npm install` e `npm start`, ou use `Iniciar Alerta DAS.bat`.
3. Acesse `http://localhost:3200` no Chrome.
