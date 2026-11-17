# Range de pool (liquidez concentrada) — pesquisa antes de implementar

Objetivo: dado um par (ex.: SOL/USDC), o app devolve **só o range** (preço mínimo e máximo) para abrir uma posição agora — não escolhe a pool — e diz quando é melhor **não** abrir.

## 1. O que a pesquisa diz

- **Prover liquidez é vender volatilidade.** Você ganha taxas e perde quando o preço anda, porque a pool sempre vende o que está subindo e compra o que está caindo.
- **A maioria perde para quem só segurou as moedas.** Um estudo de 17 pools do Uniswap v3 (maio a setembro de 2021, 17 mil carteiras) mediu US$ 199 mi em taxas contra US$ 260 mi de perda impermanente. 49,5% dos provedores ficaram negativos, inclusive os que geriam a posição ativamente; só os provedores "just-in-time", que entram e saem no mesmo bloco, ganharam com consistência ([arXiv 2111.09192](https://arxiv.org/pdf/2111.09192)).
- **O custo de prover liquidez tem fórmula: LVR (loss-versus-rebalancing).** É o quanto a posição perde para uma carteira que rebalanceia a preço de mercado. Depende só da variância do preço e da liquidez naquele preço ([Milionis, Moallemi, Roughgarden e Zhang, arXiv 2208.06046](https://arxiv.org/abs/2208.06046v5)).
  - Na liquidez concentrada, **taxas e LVR são os dois proporcionais à liquidez da posição**. Estreitar o range multiplica os dois pelo mesmo fator enquanto o preço está dentro.
  - Consequência central: **o range não transforma uma pool ruim em boa.** Quem decide se vale a pena é a relação entre as taxas que a pool paga e a volatilidade do par.
- **A largura ótima depende de três coisas:** quanto a pool rende (taxas menos custos), a perda previsível (que cresce com σ²) e a tendência do preço. Com tendência, o range ótimo é **assimétrico** ([Cartea, Drissi e Monga, SIAM J. Financial Math., arXiv 2309.08431](https://arxiv.org/html/2309.08431)).

## 2. O que muda no desenho da ferramenta

São duas perguntas, nesta ordem:

1. **Vale prover liquidez neste par agora?** (pool + volatilidade) → se não, a resposta é "fique de fora", com qualquer range.
2. **Se vale, qual range?** (horizonte, tolerância a reposicionar, contexto de mercado)

### 2.1 Teste de viabilidade: taxas ÷ LVR

Para uma posição concentrada com liquidez L, enquanto o preço P está dentro do range:

- taxas por dia ≈ (taxas do dia da pool ÷ liquidez ativa no preço atual) × L
- LVR por dia ≈ σ²_diária × √P × L ÷ 4

O L se cancela na razão:

> **R = (taxas do dia ÷ liquidez ativa no preço atual) ÷ (σ²_diária × √P ÷ 4)**

| R | Leitura |
|---|---|
| < 1 | Prover liquidez perde para "segurar e rebalancear". **Fique de fora**, com qualquer range. |
| 1 a 1,5 | Margem fina: taxas de transação, slippage e reposicionamento comem o resto. |
| ≥ 1,5 | Vale considerar. Aí sim o range importa. |

Dados necessários: taxas do dia e a liquidez ativa no tick atual (Raydium dá as duas, ver seção 4), mais a volatilidade realizada (velas diárias que o app já baixa).

Ressalvas:
- Incentivos (tokens de recompensa) entram separados e com desconto: acabam e o token costuma cair.
- Volume de um dia oscila muito; usar média de 7 e 30 dias.

### 2.2 Range: pelo caminho do preço, não pelo ponto final

Para o horizonte H que você aceita (7, 14 ou 30 dias até reposicionar):

1. Nas velas diárias dos últimos 2 a 3 anos, para cada janela de H dias, medir a **máxima e a mínima atingidas** em relação ao preço de entrada (o caminho, não só onde terminou — sair do range no meio já para as taxas).
2. **Ajustar pela volatilidade de agora.** Volatilidade vem em ondas: as excursões históricas são escaladas por (volatilidade realizada de 30 dias ÷ volatilidade média do período).
3. **Range = quantis das excursões**, em três perfis:

   | Perfil | % das janelas históricas que ficaram dentro |
   |---|---|
   | Conservador | 90% |
   | Equilibrado | 75% |
   | Agressivo | 50% |

4. Para cada perfil, mostrar:
   - o range;
   - o tempo dentro do range no histórico;
   - os reposicionamentos esperados por mês;
   - o multiplicador de taxas contra o range cheio (eficiência de capital = 1 ÷ (1 − (Pmin/Pmax)^¼));
   - a perda impermanente nas bordas;
   - **com qual moeda você termina se sair por baixo e por cima.**

### 2.3 Lateralidade e assimetria (a parte "gráfica")

- **Mercado lateral** (pouca tendência: preço preso numa faixa por 30+ dias, faixa ÷ ATR baixa):
  - o range natural é a própria faixa (suporte e resistência dos últimos 30 dias), com uma margem de meio ATR;
  - o app compara com o range de volatilidade e mostra os dois.
- **Mercado com tendência** (médias inclinadas, topos e fundos numa direção): range assimétrico na direção da tendência, como em Cartea et al.
- **Ligação com o veredito.** Uma posição SOL/USDC abaixo do preço atual **compra SOL na queda**; acima, **vende SOL na alta**.
  - Com veredito "não fazer nada" ou regime 3, e se você não quer acumular mais SOL: favorecer range acima do preço (funciona como venda escalonada).
  - Se o veredito for de compra: range abaixo (compra escalonada).
  - O app sugere a assimetria e explica; não decide sozinho.
- **Volatilidade extrema ou "melhor ficar quieto" no veredito** → a sugestão padrão é não abrir.

## 3. Pares sugeridos

| Par | Por quê |
|---|---|
| SOL/USDC, ETH/USDC, cbBTC/USDC (ou WBTC/USDC) | Os três ativos que o app já analisa; velas e derivativos já disponíveis. |
| Pares correlacionados (JitoSOL/SOL, stETH/ETH) | Outra lógica: range estreito em volta do câmbio de staking, risco de "depeg" no lugar da volatilidade. Fica para uma segunda etapa. |

## 4. Fontes grátis e acessíveis pelo navegador (testadas em 17/11/2026)

| Fonte | O que dá | CORS |
|---|---|---|
| Raydium API v3 `pools/info/list` e `pools/info/mint` | Pools CLMM por par: TVL, taxa, volume, taxas e APR de taxas em dia/semana/mês, **mínima e máxima do preço em cada janela** | ✅ |
| Raydium `pools/line/position?id=` | **Distribuição de liquidez por preço/tick** (quanto capital disputa cada faixa) | ✅ |
| Raydium `pools/line/liquidity?id=` | TVL dos últimos 30 dias | ✅ |
| Orca API v2 `solana/pools` | Whirlpools: liquidez, tick atual, taxa | ✅ |
| GeckoTerminal `.../pools/{id}/ohlcv` | Velas da própria pool (limite de ~30 chamadas/min) | ✅ |
| Binance (já no app) | Velas diárias de SOL, ETH e BTC | ✅ |
| Subgraph do Uniswap (The Graph) | Distribuição de liquidez nas EVMs | ❌ exige chave (grátis com cadastro) |

Exemplo real, SOL/USDC no Raydium (CLMM, taxa 0,04%):
- TVL US$ 5,55 mi; volume de 24 h US$ 15,7 mi; taxas de 24 h US$ 6,3 mil.
- APR de taxas: 41% no dia, 29% na semana, 59% no mês.
- Preço de SOL no mês: entre US$ 64 e US$ 114 — uma faixa de 77%. É por isso que o range importa tanto quanto a taxa.

## 5. Limites honestos

- **Sem backtest de verdade.** A distribuição histórica de liquidez por tick não está disponível de graça, então o teste de viabilidade usa a foto de hoje e as médias de volume. O backtest possível é o do range (tempo dentro, reposicionamentos), não o do lucro.
- O LVR com σ²/8 vale para o produto constante. A versão concentrada (σ²·√P·L/4 por unidade de tempo) é a mesma conta aplicada à liquidez da posição, o que é uma aproximação: ignora bloco a bloco, taxas dinâmicas e MEV.
- Taxas de transação para abrir e reposicionar, e slippage, entram como custo fixo informado por você.
- Não é recomendação de investimento: o app mostra a conta e as premissas para você decidir.

## 6. Decisões em aberto (suas)

1. **Protocolo e rede:** começar só pelo Raydium CLMM (Solana), onde os dados grátis são os mais completos?
2. **Pares:** SOL/USDC, ETH/USDC e cbBTC/USDC? Pares correlacionados ficam para depois?
3. **Horizonte:** de quanto em quanto tempo você aceita reposicionar (7, 14 ou 30 dias)? Isso define a largura.
4. **Saída:** três perfis (conservador / equilibrado / agressivo) ou só um range recomendado?
