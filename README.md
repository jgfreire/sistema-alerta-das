# Alerta DAS

Compara o valor total do DAS (Simples Nacional) de dois meses para **vários clientes de uma vez**
(sem limite fixo; testado com 300 PDFs simulados = 150 clientes) e gera uma planilha Excel única.

- Entrada: todos os PDFs de DAS de uma vez (arrastar ou selecionar). O sistema lê no navegador e agrupa pelo CNPJ.
- Saída (`.xlsx`):
  - aba **Alertas**: um cliente por linha, com o alerta na primeira coluna (texto + cor), empresa, CNPJ,
    competência e valor total dos dois DAS, variação em R$ e %. Ordenada do mais grave para o menos grave.
  - aba **Pendências**: o que não pôde ser analisado e o motivo (PDF que não é DAS, cliente com só 1 DAS,
    mesma competência com valores diferentes).
- **Faturamento:** além do DAS, o sistema lê dois relatórios da Domínio, um por cliente e por mês (período dentro de um único mês): "Acompanhamento de Serviços" e "Acompanhamento de Saídas" (vendas). O valor de cada um é o "Valor Contábil" da linha "Total Geral"; nas saídas, os acumuladores de devolução (com "DEV" no nome) são descontados e não entram no faturamento. O faturamento do mês é a soma de vendas e serviços do que foi enviado, ligado ao DAS pelo CNPJ e pela competência. Aparece nas colunas "Faturamento (anterior/atual)" da planilha e fica guardado na memória (vendas e serviços separados). Sem nenhum relatório a célula fica em branco (nunca zero, nunca estimado); se só houver um dos dois, a Observação avisa. A soma dos acumuladores precisa bater com o Total Geral. Relatório sem DAS correspondente, com mais de um mês ou que não bate vai para Pendências. Antes de analisar, a tela mostra uma conferência do que foi lido em cada PDF.
- Variações (planilha e tela, sempre sobre o mês anterior, com sinal: queda = negativa): **Variação do imposto (R$ e %)**, do valor total do DAS, e **Variação do faturamento (R$ e %)**, que só aparece quando os dois meses têm faturamento. A cor do alerta vem **só da variação do imposto**.
- Alerta (variação em módulo sobre o DAS mais antigo): até 20% = Normalidade (verde); 21% a 50% = Atenção (amarelo); acima de 50% = Crítico (vermelho).
- **Memória:** para cada cliente o sistema guarda (no servidor) o mês mais recente e o anterior. Depois da primeira vez basta enviar só o mês novo: ele compara com o mês guardado, grava o novo par e descarta o mais antigo (ex.: guardado 8 e 9; ao enviar o 10, compara 9 x 10 e o 8 é apagado). Reenviar o mesmo mês não muda nada. Se o valor de um mês enviado for diferente do guardado (retificação), o cliente vai para Pendências sem alterar a memória; o administrador pode apagar o cliente na aba "Memória DAS" do painel e reenviar.
- Se um cliente tiver mais de 2 competências, compara as duas mais recentes e avisa na coluna Observação.
- Colaboradores usam a tela principal; o administrador tem acesso a tudo (painel em `/admin`, com atalho para a tela principal).

## Iniciar
1. Copie `server/.env.example` para `server/.env` e preencha (use `npm run hash-password -- "senha"` dentro de `server/`).
   - **Login:** só é exigido com `REQUIRE_LOGIN=true` no `.env`. Sem essa linha o sistema entra direto como administrador. O servidor sempre fica disponível na rede (porta 3200), não só no próprio computador.
   - O administrador entra com `ADMIN_USERNAME`, a senha cujo hash está em `ADMIN_PASSWORD_HASH` e a `ADMIN_ACCESS_KEY` (campo "Chave de administrador"). Colaboradores são criados no painel e entram só com usuário e senha.
2. Em `server/`: `npm install` e `npm start`, ou use `Iniciar Alerta DAS.bat`.
3. Acesse `http://localhost:3200` no Chrome.
