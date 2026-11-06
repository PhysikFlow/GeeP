import { useQuery } from '@tanstack/react-query'
import { pedirJson } from '../http'
import { DIA, HORA, MIN } from '../query'
import { ajusteDificuldade, alturaAtual, hashrate1a, hashrateHistorico, mempoolInfo, recompensasHistoricas, taxasBtc } from '../chains/btc'
import { statsEth } from '../chains/eth'
import { statsSol } from '../chains/sol'
import { velas, type Serie } from '../precos'

// Todas as fontes dos indicadores, cada uma com a validade que o dado tem:
// derivativos mudam a cada minuto; on-chain diário muda uma vez por dia. O
// bitcoin-data.com grátis aceita só 15 chamadas por DIA — por isso as séries
// dele valem 24 h e moram no cache persistente.

// ---------------------------------------------------------------------------
// mercado geral
// ---------------------------------------------------------------------------

type Global = {
  data: {
    total_market_cap: { usd: number }
    total_volume: { usd: number }
    market_cap_percentage: Record<string, number>
    market_cap_change_percentage_24h_usd: number
    active_cryptocurrencies: number
  }
}
export const useGlobal = () =>
  useQuery({
    queryKey: ['ind', 'global'],
    queryFn: () => pedirJson<Global>('https://api.coingecko.com/api/v3/global').then((r) => r.data),
    staleTime: 5 * MIN,
    refetchInterval: 10 * MIN,
  })

type Fng = { data: { value: string; value_classification: string; timestamp: string }[] }
export const useMedoGanancia = () =>
  useQuery({
    queryKey: ['ind', 'fng'],
    queryFn: async () => {
      const r = await pedirJson<Fng>('https://api.alternative.me/fng/?limit=0')
      const s: Serie = r.data.map((d) => [Number(d.timestamp), Number(d.value)] as [number, number]).sort((a, b) => a[0] - b[0])
      return { serie: s, rotulo: r.data[0]?.value_classification ?? '' }
    },
    staleTime: 2 * HORA,
  })

type StableDia = { date: string; totalCirculatingUSD: { peggedUSD: number } }
export const useStablecoins = () =>
  useQuery({
    queryKey: ['ind', 'stables'],
    queryFn: async () => {
      const r = await pedirJson<StableDia[]>('https://stablecoins.llama.fi/stablecoincharts/all')
      return r.map((d) => [Number(d.date), d.totalCirculatingUSD.peggedUSD] as [number, number]) as Serie
    },
    staleTime: 6 * HORA,
  })

type Chain = { name: string; tvl: number; tokenSymbol: string | null }
export const useTvlRedes = () =>
  useQuery({
    queryKey: ['ind', 'chains'],
    queryFn: () => pedirJson<Chain[]>('https://api.llama.fi/v2/chains'),
    staleTime: 3 * HORA,
  })

export const useTvlHistorico = (rede: string) =>
  useQuery({
    queryKey: ['ind', 'tvlhist', rede],
    queryFn: async () => {
      const r = await pedirJson<{ date: number; tvl: number }[]>(`https://api.llama.fi/v2/historicalChainTvl/${rede}`)
      return r.map((d) => [d.date, d.tvl] as [number, number]) as Serie
    },
    staleTime: 6 * HORA,
  })

type Overview = {
  protocols?: unknown
  total24h: number | null
  total7d: number | null
  total30d?: number | null
  change_1d: number | null
  change_30dover30d?: number | null
}
export const useVolumeDex = (rede: string) =>
  useQuery({
    queryKey: ['ind', 'dex', rede],
    queryFn: () =>
      pedirJson<Overview>(
        `https://api.llama.fi/overview/dexs/${rede}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`,
      ).then(({ protocols: _p, ...r }) => r),
    staleTime: 3 * HORA,
  })
export const useTaxasRede = (rede: string) =>
  useQuery({
    queryKey: ['ind', 'fees', rede],
    queryFn: () =>
      pedirJson<Overview>(
        `https://api.llama.fi/overview/fees/${rede}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`,
      ).then(({ protocols: _p, ...r }) => r),
    staleTime: 3 * HORA,
  })

// ---------------------------------------------------------------------------
// redes
// ---------------------------------------------------------------------------

export const useTaxasBtc = () => useQuery({ queryKey: ['ind', 'btcfees'], queryFn: taxasBtc, staleTime: MIN, refetchInterval: 2 * MIN })
export const useAjusteDificuldade = () => useQuery({ queryKey: ['ind', 'diff'], queryFn: ajusteDificuldade, staleTime: 10 * MIN })
export const useAltura = () => useQuery({ queryKey: ['ind', 'altura'], queryFn: alturaAtual, staleTime: 5 * MIN, refetchInterval: 5 * MIN })
export const useHashrate = () => useQuery({ queryKey: ['ind', 'hashrate1y'], queryFn: hashrate1a, staleTime: 3 * HORA })
export const useMempool = () => useQuery({ queryKey: ['ind', 'mempool'], queryFn: mempoolInfo, staleTime: MIN, refetchInterval: 2 * MIN })
export const useStatsEth = () => useQuery({ queryKey: ['ind', 'ethstats'], queryFn: statsEth, staleTime: 2 * MIN, refetchInterval: 3 * MIN })
export const useStatsSol = () => useQuery({ queryKey: ['ind', 'solstats'], queryFn: statsSol, staleTime: 2 * MIN, refetchInterval: 5 * MIN })

// ---------------------------------------------------------------------------
// on-chain BTC
// ---------------------------------------------------------------------------

/** Receita diária dos mineradores em USD (recompensa média × 144 blocos × preço). */
export const useReceitaMineradores = () =>
  useQuery({
    queryKey: ['ind', 'receita-mineradores'],
    queryFn: async () => {
      const r = await recompensasHistoricas()
      const porDia = new Map<number, number>()
      for (const p of r) if (p.USD > 0) porDia.set(Math.floor(p.timestamp / 86400) * 86400, (p.avgRewards / 1e8) * 144 * p.USD)
      return [...porDia.entries()].sort((a, b) => a[0] - b[0]) as Serie
    },
    staleTime: 12 * HORA,
  })

/** Hashrate médio diário desde 2009 (mempool.space), em EH/s (H/s passa do
 *  limite numérico do gráfico). */
export const useHashrateHistorico = () =>
  useQuery({
    queryKey: ['ind', 'hashrate-all'],
    queryFn: async () => {
      const r = await hashrateHistorico()
      return r.hashrates
        .filter((h) => h.avgHashrate > 0)
        .map((h) => [Math.floor(h.timestamp / 86400) * 86400, h.avgHashrate / 1e18] as [number, number]) as Serie
    },
    staleTime: 12 * HORA,
  })

const BD = 'https://bitcoin-data.com/v1'
type Snapshot = {
  date: string
  btcPrice: string
  realizedPrice: number
  mvrv: number
  mvrvZscore: number
  fearGreed: number
  puellMultiple: number
  mayerMultiple: number
  sopr: number
  activeAddresses: number
}
export const useSnapshotOnchain = () =>
  useQuery({
    queryKey: ['ind', 'bd', 'snapshot'],
    queryFn: () => pedirJson<Snapshot>(`${BD}/snapshot`, { tentativas: 1 }),
    staleTime: 12 * HORA,
    gcTime: 7 * DIA,
    retry: false,
  })

/** Série histórica do bitcoin-data (até 4 anos no plano grátis). Sem `campo`,
 *  usa o primeiro número que não é data. */
export const useSerieOnchain = (endpoint: string, campo?: string) =>
  useQuery({
    queryKey: ['ind', 'bd', endpoint],
    queryFn: async () => {
      const desde = new Date(Date.now() - 4 * 365 * 86400_000).toISOString().slice(0, 10)
      const r = await pedirJson<Record<string, unknown>[] | { content: Record<string, unknown>[] }>(
        `${BD}/${endpoint}?startday=${desde}&size=2000`,
        { tentativas: 1 },
      )
      const lista = Array.isArray(r) ? r : r.content
      const chave = campo ?? Object.keys(lista[0] ?? {}).find((k) => k !== 'd' && k !== 'unixTs' && typeof lista[0][k] === 'number') ?? ''
      return lista
        .map((d) => [Number(d.unixTs) || Math.floor(new Date(String(d.d)).getTime() / 1000), Number(d[chave])] as [number, number])
        .filter((p) => Number.isFinite(p[1]))
        .sort((a, b) => a[0] - b[0]) as Serie
    },
    staleTime: 20 * HORA,
    gcTime: 7 * DIA,
    retry: false,
  })

// ---------------------------------------------------------------------------
// derivativos (Binance Futures, público)
// ---------------------------------------------------------------------------

const FAPI = 'https://fapi.binance.com'
export type Derivativos = {
  par: string
  mark: number
  index: number
  funding: number
  proximoFunding: number
  fundingHist: Serie
  oi: Serie
  oiValor: Serie
  longShort: Serie
  topTraders: Serie
  taker: Serie
}

async function derivativos(par: string): Promise<Derivativos> {
  type Prem = { markPrice: string; indexPrice: string; lastFundingRate: string; nextFundingTime: number }
  type Fr = { fundingTime: number; fundingRate: string }
  type Oi = { timestamp: number; sumOpenInterest: string; sumOpenInterestValue: string }
  type Ls = { timestamp: number; longShortRatio: string }
  type Tk = { timestamp: number; buySellRatio: string }
  const [p, fr, oi, ls, top, tk] = await Promise.all([
    pedirJson<Prem>(`${FAPI}/fapi/v1/premiumIndex?symbol=${par}`),
    pedirJson<Fr[]>(`${FAPI}/fapi/v1/fundingRate?symbol=${par}&limit=270`),
    pedirJson<Oi[]>(`${FAPI}/futures/data/openInterestHist?symbol=${par}&period=1d&limit=30`),
    pedirJson<Ls[]>(`${FAPI}/futures/data/globalLongShortAccountRatio?symbol=${par}&period=1d&limit=30`),
    pedirJson<Ls[]>(`${FAPI}/futures/data/topLongShortPositionRatio?symbol=${par}&period=1d&limit=30`),
    pedirJson<Tk[]>(`${FAPI}/futures/data/takerlongshortRatio?symbol=${par}&period=1d&limit=30`),
  ])
  const s = (t: number) => Math.floor(t / 1000)
  return {
    par,
    mark: Number(p.markPrice),
    index: Number(p.indexPrice),
    funding: Number(p.lastFundingRate),
    proximoFunding: p.nextFundingTime,
    fundingHist: fr.map((f) => [s(f.fundingTime), Number(f.fundingRate) * 100] as [number, number]),
    oi: oi.map((o) => [s(o.timestamp), Number(o.sumOpenInterest)] as [number, number]),
    oiValor: oi.map((o) => [s(o.timestamp), Number(o.sumOpenInterestValue)] as [number, number]),
    longShort: ls.map((o) => [s(o.timestamp), Number(o.longShortRatio)] as [number, number]),
    topTraders: top.map((o) => [s(o.timestamp), Number(o.longShortRatio)] as [number, number]),
    taker: tk.map((o) => [s(o.timestamp), Number(o.buySellRatio)] as [number, number]),
  }
}

export const useDerivativos = (par: string) =>
  useQuery({ queryKey: ['ind', 'deriv', par], queryFn: () => derivativos(par), staleTime: 5 * MIN, refetchInterval: 5 * MIN })

/** Velas diárias de qualquer par (indicadores técnicos de ETH/SOL e razões). */
export const useVelasDiarias = (par: string, dias = 400) =>
  useQuery({
    queryKey: ['ind', 'velas', par, dias],
    queryFn: async () => {
      const v = await velas(par, '1d', Date.now() - dias * 86400_000)
      return v.map((k) => [Math.floor(k[0] / 1000), Number(k[4])] as [number, number]) as Serie
    },
    staleTime: HORA,
  })

/** Funding e prêmio de todos os perpétuos numa chamada só (resumo da visão geral). */
export const useFundingAgora = () =>
  useQuery({
    queryKey: ['ind', 'funding-agora'],
    queryFn: async () => {
      const r = await pedirJson<{ symbol: string; markPrice: string; indexPrice: string; lastFundingRate: string }[]>(
        `${FAPI}/fapi/v1/premiumIndex`,
      )
      const m = new Map(r.map((x) => [x.symbol, x]))
      const pega = (s: string) => {
        const x = m.get(s)
        return x ? { funding: Number(x.lastFundingRate), premio: (Number(x.markPrice) / Number(x.indexPrice) - 1) * 100 } : null
      }
      return { BTC: pega('BTCUSDT'), ETH: pega('ETHUSDT'), SOL: pega('SOLUSDT') }
    },
    staleTime: 5 * MIN,
    refetchInterval: 5 * MIN,
  })

/** MVRV e preço realizado do BTC desde 2011 (Coin Metrics Community, grátis e sem a cota do bitcoin-data). */
export const useMvrvCoinMetrics = () =>
  useQuery({
    queryKey: ['ind', 'cm-mvrv'],
    queryFn: async () => {
      type R = { data: { time: string; CapMVRVCur: string | null; PriceUSD: string | null }[]; next_page_url?: string }
      const mvrv: Serie = []
      const realizado: Serie = []
      let url: string | undefined =
        'https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=CapMVRVCur,PriceUSD&frequency=1d&page_size=10000&start_time=2011-01-01'
      for (let i = 0; url && i < 3; i++) {
        const r: R = await pedirJson<R>(url, { timeoutMs: 40_000 })
        for (const d of r.data) {
          const m = Number(d.CapMVRVCur)
          const p = Number(d.PriceUSD)
          if (!d.CapMVRVCur || !d.PriceUSD || !m) continue
          const t = Math.floor(new Date(d.time).getTime() / 1000)
          mvrv.push([t, m])
          realizado.push([t, p / m])
        }
        url = r.next_page_url
      }
      return { mvrv, realizado }
    },
    staleTime: 12 * HORA,
  })

/** Funding atual do mesmo perpétuo em Binance, Bybit e OKX (uma divergência grande é sinal). */
export const useFundingCorretoras = (base: 'BTC' | 'ETH' | 'SOL') =>
  useQuery({
    queryKey: ['ind', 'funding-3', base],
    queryFn: async () => {
      const [bn, bb, ok] = await Promise.all([
        pedirJson<{ lastFundingRate: string }>(`${FAPI}/fapi/v1/premiumIndex?symbol=${base}USDT`).then((r) => Number(r.lastFundingRate)).catch(() => null),
        pedirJson<{ result: { list: { fundingRate: string }[] } }>(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${base}USDT`)
          .then((r) => Number(r.result.list[0]?.fundingRate))
          .catch(() => null),
        pedirJson<{ data: { fundingRate: string }[] }>(`https://www.okx.com/api/v5/public/funding-rate?instId=${base}-USDT-SWAP`)
          .then((r) => Number(r.data[0]?.fundingRate))
          .catch(() => null),
      ])
      return { Binance: bn, Bybit: bb, OKX: ok }
    },
    staleTime: 5 * MIN,
    refetchInterval: 5 * MIN,
  })
