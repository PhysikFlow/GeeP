# GeeP — portfólio cripto

App web (React + Vite) instalável como PWA no Android e no desktop. Sem conta e sem servidor: as carteiras ficam no aparelho (localStorage), e tudo vem de APIs públicas e gratuitas direto do navegador.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # gera dist/ (estático, com service worker)
npm run preview    # serve o build para testar o PWA
npm run icons      # regenera os ícones a partir de public/icons/logo.svg
```

**Publicação:** cada push na `main` builda e publica no GitHub Pages pelo workflow `.github/workflows/deploy.yml` (site em `https://physikflow.github.io/GeeP/`). O build recebe `BASE_PATH=/GeeP/` porque o Pages serve o site numa subpasta. Para outra hospedagem estática na raiz (Cloudflare Pages, Netlify, Vercel), basta `npm run build` sem `BASE_PATH`. As rotas usam hash (`#/indicadores/ciclo`), então não precisa de configuração de rewrite.

## Páginas

**Portfólio** — cole endereços públicos (nunca chave privada; o app recusa frase-semente/WIF/chave hex):

- **BTC**: `bc1q…`, `bc1p…` (Taproot), `1…`, `3…` e chaves estendidas `xpub`/`ypub`/`zpub` (derivadas no próprio aparelho, gap limit 20).
- **ETH**: `0x…` ou nome `.eth`. Saldo, tokens ERC-20 com preço, histórico de saldo.
- **SOL**: saldo e tokens SPL com preço.
- **Contra os benchmarks**: o mesmo dinheiro, nas mesmas datas, em "só BTC" e em "50% BTC / 50% ETH".
- Patrimônio em R$ ou US$, variação 24h, alocação, evolução diária, **preço médio estimado** (custo médio pelas entradas on-chain, com câmbio histórico para o custo em reais) e preço médio manual que substitui o estimado.
- Tokens sem liquidez (meme/spam enviado de presente) ficam fora do patrimônio.

**Indicadores** — começa com o **veredito**, baseado exclusivamente nos dados disponíveis e **conservador de propósito** (na dúvida, não fazer nada): *é hora de comprar*, *de não fazer nada* ou *de vender*, cruzando o termômetro do ciclo, o regime de mercado e uma **régua de capitulação** de 6 sinais de fundo. Com regime 3 nunca é "comprar"; com capitulação forte aparece só uma **parcela de seguro** (10–20% de uma parcela normal), para o cenário menos provável de o fundo ser agora. Mostra também o **custo de esperar** (Selic e juro real, do Banco Central) e um aviso à parte de **"é melhor ficar quieto"** quando faltam dados, os sinais brigam, a volatilidade ou a alavancagem estão extremas, houve hack grande na semana ou o sentimento está no extremo. Logo abaixo, as **zonas de preço**: em que preço do BTC o veredito viraria compra, parcela de seguro ou venda em cada regime, se só o preço mexesse (guia para revisar, não ordem para deixar parada), e a lista do que **fica fora do cálculo** e vale conferir à mão (FedWatch, spread high yield, ETFs por emissor, liquidações, notícias). Nas outras abas o veredito aparece numa linha compacta. Depois, nove abas:

- **Visão geral**: BTC/ETH/SOL, termômetro do ciclo, Medo & Ganância, mercado, funding e uma "leitura do dia" com o porquê de cada sinal (inclui o regime).
- **Regime e macro**: nível 1 (expansão), 2 (seletivo) ou 3 (deterioração) pela soma de 11 sinais — Fed funds, expectativa (T-bill 3m − Fed funds), juro real de 10 anos, DXY, balanço do Fed, reverse repo, CPI, desemprego, stablecoins, dominância do BTC e tendência do BTC. Gráficos de juros, curva 10a−2a, liquidez, saldo/fluxo das corretoras e hacks recentes. O nível define o ritmo das compras, não o que comprar.
- **Dossiê (etapas 3–5)**: ao abrir um token da triagem, notas por critério (adoção 30, tokenomics 25, competitiva 15, valuation 15, narrativa 10, macro 5 — este sugerido pelo regime), alertas que bloqueiam, textos do dossiê, bear case e resposta, condições de invalidação e memo de exceção para nota 65–74. Decisão automática: ≥ 75 pode comprar, 65–74 só com memo, < 65 não compra. Fica salvo no aparelho e entra no backup.
- **Short 2x**: para BTC, ETH e SOL, sempre com 2x de alavancagem: *dá para shortar*, *não dá para dizer* ou *fique longe dessa ideia*. Três dimensões separadas — viés (a tendência é de baixa?), entrada (é um bom ponto agora?) e risco (há sinal de squeeze?) — e vetos que mandam ficar longe (regime 1, BTC na zona de fundo do ciclo, capitulação, shorts lotados, queda esticada, stop longe demais). Mostra o plano: stop, alvo, retorno ÷ risco, liquidação e funding na margem. Sem backtest: as notas contam critérios, não probabilidade.
- **Range de pool**: para SOL/USDC, ETH/USDC e cbBTC/USDC, primeiro responde se **vale** prover liquidez agora (R = taxas ÷ custo da volatilidade, medido numa pool de referência da Orca ou do Uniswap; abaixo de 1, fique de fora com qualquer range) e depois devolve **três ranges** — conservador, equilibrado e agressivo — pelo caminho histórico do preço no horizonte escolhido (7, 14 ou 30 dias), com tempo dentro, reposicionamentos, taxas, custo da volatilidade, saldo esperado e o que acontece em cada borda. Marca um ponto de partida conservador.
- **Triagem de tokens**: etapa 2 do funil — top 500 da CoinGecko sem BTC/ETH/BNB, stables, embrulhados e tokenizados; filtro de market cap ≥ US$ 100 mi e volume ≥ US$ 1 mi; FDV/MC, FDV/receita, receita para o detentor ÷ market cap, crescimento da receita, volume/MC; nota quantitativa; lista curta de até 10, um por setor; detalhe com receita diária, liquidez de saída (spread e profundidade ±2% na Bybit/OKX) e hacks.
- **Ciclo do BTC**: termômetro (média de 9 indicadores), MVRV-Z, NUPL, Mayer, Puell, Pi Cycle, média de 200 semanas, lei de potência, RSI, Hash Ribbons, drawdown, fluxo dos ETFs, halving.
- **Derivativos**: funding, open interest, long/short, fluxo agressor (Binance Futures).
- **Rendimentos DeFi**: pools da DefiLlama com "cartaz" (APY de agora), **chão** (APY superado em 9 de cada 10 dias do último mês), base × incentivo, sinais de mudança e simulador.
- **Redes**: taxas, mempool, hashrate, gás, TPS, TVL por rede, volume de DEX, taxas pagas, stablecoins.

**Simulação** — carteiras de mentirinha com o capital que você escolher, com custos de verdade: 0,1% de taxa e 0,1% de slippage por operação, e caixa parado rendendo Selic.
- **Robô do método:** uma vez por dia faz o que o veredito manda, como um humano imperfeito. Às vezes esquece, varia o valor, e de vez em quando faz um aporte mínimo por ansiedade.
- **Modo manual:** você compra e vende quando quiser, inclusive contra o método. Cada operação guarda o que o método dizia na hora.
- **Placar:** depois de 7 dias e um movimento acima de 2%, cada operação sua contra o método vira "eu avisei" (o método acertou) ou "admita" (você acertou).
- **Benchmark:** o mesmo capital todo em BTC no dia da criação.

## Fontes (todas grátis, sem chave)

| Dado | Fonte | Reserva |
|---|---|---|
| BTC: saldo, transações | mempool.space | blockstream.info |
| ETH: saldo | RPC publicnode | llamarpc, 1rpc |
| ETH: tokens, histórico | Blockscout | Ethplorer (`freekey`) |
| SOL: saldo | RPC publicnode | Jupiter |
| SOL: tokens, preços | Jupiter (lite-api) | — |
| Preço agora | CoinGecko | Binance |
| Histórico de preço | Binance (desde 2017) + mempool.space (BTC antes de 2017) | Bitstamp |
| Câmbio USD/BRL | AwesomeAPI | Binance USDT/BRL |
| Medo & Ganância | alternative.me | — |
| On-chain BTC (MVRV-Z, NUPL, preço realizado, ETFs) | bitcoin-data.com | snapshot do mesmo |
| Derivativos | Binance Futures | — |
| DeFi, TVL, stablecoins, DEX, receitas, corretoras, hacks | DefiLlama | — |
| MVRV, preço realizado | Coin Metrics Community | bitcoin-data.com |
| Fed funds, reverse repo, balanço do Fed | NY Fed | — |
| Treasuries nominais e reais | Tesouro americano | — |
| CPI e desemprego | BLS (25 consultas/dia sem chave) | — |
| Dólar (DXY) | calculado com o câmbio do BCE (Frankfurter) | — |
| Selic e IPCA | Banco Central (SGS) | — |
| Liquidez de saída, funding | Bybit, OKX, Binance | — |
| Pools de referência (range) | Orca, Uniswap v3 via RPC público, GeckoTerminal | — |

## O que precisa de cadastro (grátis)

- **Solana — histórico, preço médio e stake nativo**: os RPCs públicos da Solana não guardam histórico e o oficial recusa pedidos de navegador. Com a chave do plano grátis da [Helius](https://dashboard.helius.dev/signup) (Ajustes → Chave Helius) isso liga. Sem ela, a carteira SOL mostra saldo e tokens.

## Pesquisa

- **Range de pool (liquidez concentrada):** [docs/pesquisa-range-lp.md](docs/pesquisa-range-lp.md) — o método, as fontes testadas e as decisões que viraram a aba.

## Limites conhecidos

- O FRED não libera acesso pelo navegador (sem CORS, nem com chave). Por isso cada série macro vem da fonte primária equivalente, e o **spread de crédito high yield** (só existe no FRED) e a **probabilidade do FedWatch** (sem API grátis) ficam de fora até existir um backend. Fluxo de ETFs por emissor (Farside/SoSoValue), liquidações (CoinGlass) e unlocks (Tokenomist) também dependem de backend ou plano pago.
- Carteiras ficam no localStorage com cópia no IndexedDB; se um dos dois for apagado, o app restaura do outro. Apagar os dados do site no navegador apaga os dois — use Exportar nos Ajustes como backup.

- **bitcoin-data.com** grátis: 15 chamadas por dia, 4 anos de histórico e até 7 dias de atraso em MVRV/NUPL. O app guarda as séries por 24 h; um plano maior é pago.
- APIs grátis limitam chamadas por IP. Carteiras enormes (milhares de transações) baixam as ~600–1.000 mais recentes e o app avisa que o histórico é parcial; o preço médio considera o saldo anterior pelo preço da primeira movimentação vista.
- Preço médio é **estimativa**: a blockchain mostra quando a moeda chegou, não quanto foi pago. Transferências entre carteiras suas que estão no app se anulam; de fora delas, não. Informe o preço real à mão quando souber.
- Liquidações agregadas (Coinglass), dados macro (DXY, S&P) e fluxo de corretoras exigem plano pago ou chave — não entram.
- xpub de Taproot (BIP86) ainda não é derivada; endereços `bc1p…` avulsos funcionam.
