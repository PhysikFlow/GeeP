import { useQuery } from '@tanstack/react-query'
import { pedirJson, primeiroQueResponde } from './http'
import { recompensasHistoricas } from './chains/btc'
import { HORA, MIN } from './query'
import { useAjustes, type Nativo } from './store'

// Preços. Agora: CoinGecko (mercado) com a Binance de reserva. Histórico
// diário: Binance (data-api.binance.vision, espelho público sem bloqueio
// regional) desde 2017; para o BTC antes disso, Bitstamp (desde 2011), com o
// preço que o mempool.space publica junto das recompensas de reserva — a
// CoinGecko grátis só devolve os últimos 365 dias, e o blockchain.info recusa
// pedidos vindos do navegador.

/** [unix em segundos (00:00 UTC do dia), valor] em ordem crescente. */
export type Serie = [number, number][]

const BINANCE = 'https://data-api.binance.vision/api/v3'
export const PAR: Record<Nativo, string> = { BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT' }
export const GECKO_ID: Record<Nativo, string> = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana' }

type Kline = [number, string, string, string, string, string, number, string, number, string, string, string]

/** Velas diárias completas de um par, paginando de 1000 em 1000. */
export async function velas(par: string, intervalo = '1d', desde = 0, limite = Infinity): Promise<Kline[]> {
  const out: Kline[] = []
  let ini = desde
  while (out.length < limite) {
    const lote = await pedirJson<Kline[]>(`${BINANCE}/klines?symbol=${par}&interval=${intervalo}&limit=1000&startTime=${ini}`)
    out.push(...lote)
    if (lote.length < 1000) break
    ini = lote[lote.length - 1][0] + 1
  }
  return out
}

export async function historicoDiario(par: string): Promise<Serie> {
  const v = await velas(par)
  return v.map((k) => [Math.floor(k[0] / 1000), Number(k[4])])
}

const dia = (t: number) => Math.floor(t / 86400) * 86400

async function btcAntigoMempool(ate: number): Promise<Serie> {
  const r = await recompensasHistoricas()
  return r.filter((p) => p.USD > 0.01 && p.timestamp < ate).map((p) => [dia(p.timestamp), p.USD] as [number, number])
}

async function btcAntigoBitstamp(ate: number): Promise<Serie> {
  type R = { data: { ohlc: { timestamp: string; close: string }[] } }
  const out: Serie = []
  let ini = Date.UTC(2011, 7, 18) / 1000
  while (ini < ate) {
    const r = await pedirJson<R>(`https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=86400&limit=1000&start=${ini}`, { timeoutMs: 15_000, tentativas: 2 })
    const v = r.data.ohlc.map((o) => [Number(o.timestamp), Number(o.close)] as [number, number]).filter(([t]) => t < ate)
    if (!v.length) break
    out.push(...v)
    ini = v[v.length - 1][0] + 86400
    if (r.data.ohlc.length < 1000) break
  }
  return out
}

/** BTC desde 2010: mempool.space (ou Bitstamp) até a Binance começar (ago/2017). */
export async function historicoBtcLongo(): Promise<Serie> {
  const binance = await historicoDiario('BTCUSDT')
  const inicioBinance = binance[0]?.[0] ?? Date.now() / 1000
  // Bitstamp primeiro (fonte de preço de verdade); mempool.space de reserva.
  const velho = await primeiroQueResponde([() => btcAntigoBitstamp(inicioBinance), () => btcAntigoMempool(inicioBinance)]).catch(
    () => [] as Serie,
  )
  // um ponto por dia, em ordem
  const porDia = new Map<number, number>()
  for (const [t, v] of velho) porDia.set(t, v)
  return [...[...porDia.entries()].sort((a, b) => a[0] - b[0]), ...binance]
}

/** Valor da série no instante t (último dia ≤ t). Antes do começo: null. */
export function valorEm(serie: Serie, t: number): number | null {
  if (serie.length === 0 || t < serie[0][0] - 86400) return null
  let lo = 0
  let hi = serie.length - 1
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1
    if (serie[m][0] <= t) lo = m
    else hi = m - 1
  }
  return serie[lo][1]
}

// Câmbio médio anual USD/BRL antes do par USDT/BRL existir na Binance
// (out/2020). Só serve para converter custo antigo em reais — aproximado.
const USDBRL_ANUAL: Record<number, number> = {
  2009: 2.0, 2010: 1.76, 2011: 1.67, 2012: 1.95, 2013: 2.16, 2014: 2.35, 2015: 3.33,
  2016: 3.49, 2017: 3.19, 2018: 3.65, 2019: 3.95, 2020: 5.16,
}

export function cambioEm(serie: Serie, t: number, atual: number) {
  const v = valorEm(serie, t)
  if (v != null) return v
  return USDBRL_ANUAL[new Date(t * 1000).getUTCFullYear()] ?? atual
}

// ---------------------------------------------------------------------------
// mercado agora
// ---------------------------------------------------------------------------

export type Mercado = {
  ativo: Nativo
  nome: string
  preco: number
  var24h: number | null
  var7d: number | null
  var30d: number | null
  var1a: number | null
  mcap: number | null
  volume: number | null
  ath: number | null
  athData: string | null
  athDist: number | null
  sparkline: number[]
  icone?: string
}

type Gecko = {
  id: string
  name: string
  image: string
  current_price: number
  market_cap: number
  total_volume: number
  ath: number
  ath_date: string
  ath_change_percentage: number
  price_change_percentage_24h_in_currency?: number
  price_change_percentage_7d_in_currency?: number
  price_change_percentage_30d_in_currency?: number
  price_change_percentage_1y_in_currency?: number
  sparkline_in_7d?: { price: number[] }
}

const NATIVOS: Nativo[] = ['BTC', 'ETH', 'SOL']

async function mercadoGecko(): Promise<Record<Nativo, Mercado>> {
  const ids = NATIVOS.map((n) => GECKO_ID[n]).join(',')
  const r = await pedirJson<Gecko[]>(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&sparkline=true&price_change_percentage=24h,7d,30d,1y`,
  )
  const out = {} as Record<Nativo, Mercado>
  for (const n of NATIVOS) {
    const g = r.find((x) => x.id === GECKO_ID[n])
    if (!g) throw new Error('CoinGecko sem ' + n)
    out[n] = {
      ativo: n,
      nome: g.name,
      preco: g.current_price,
      var24h: g.price_change_percentage_24h_in_currency ?? null,
      var7d: g.price_change_percentage_7d_in_currency ?? null,
      var30d: g.price_change_percentage_30d_in_currency ?? null,
      var1a: g.price_change_percentage_1y_in_currency ?? null,
      mcap: g.market_cap,
      volume: g.total_volume,
      ath: g.ath,
      athData: g.ath_date,
      athDist: g.ath_change_percentage,
      sparkline: g.sparkline_in_7d?.price ?? [],
      icone: g.image,
    }
  }
  return out
}

async function mercadoBinance(): Promise<Record<Nativo, Mercado>> {
  const simbolos = encodeURIComponent(JSON.stringify(NATIVOS.map((n) => PAR[n])))
  const r = await pedirJson<{ symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string }[]>(
    `${BINANCE}/ticker/24hr?symbols=${simbolos}`,
  )
  const out = {} as Record<Nativo, Mercado>
  for (const n of NATIVOS) {
    const t = r.find((x) => x.symbol === PAR[n])!
    out[n] = {
      ativo: n,
      nome: n,
      preco: Number(t.lastPrice),
      var24h: Number(t.priceChangePercent),
      var7d: null,
      var30d: null,
      var1a: null,
      mcap: null,
      volume: Number(t.quoteVolume),
      ath: null,
      athData: null,
      athDist: null,
      sparkline: [],
    }
  }
  return out
}

export function useMercado() {
  return useQuery({
    queryKey: ['mercado', 'nativos'],
    queryFn: () => primeiroQueResponde([mercadoGecko, mercadoBinance]),
    staleTime: 2 * MIN,
    refetchInterval: 3 * MIN,
  })
}

async function cambioAtual(): Promise<number> {
  return primeiroQueResponde([
    () =>
      pedirJson<{ USDBRL: { bid: string } }>('https://economia.awesomeapi.com.br/json/last/USD-BRL').then((r) => Number(r.USDBRL.bid)),
    () => pedirJson<{ price: string }>(`${BINANCE}/ticker/price?symbol=USDTBRL`).then((r) => Number(r.price)),
  ])
}

export function useCambio() {
  return useQuery({ queryKey: ['cambio', 'USDBRL'], queryFn: cambioAtual, staleTime: 10 * MIN, refetchInterval: 15 * MIN })
}

export function useHistorico(ativo: Nativo | 'USDBRL', ligado = true) {
  return useQuery({
    queryKey: ['historico', ativo],
    queryFn: () => (ativo === 'BTC' ? historicoBtcLongo() : historicoDiario(ativo === 'USDBRL' ? 'USDTBRL' : PAR[ativo])),
    staleTime: 6 * HORA,
    enabled: ligado,
  })
}

/** Converte USD para a moeda de exibição. Sem câmbio ainda, mostra em USD. */
export function useConversao() {
  const { moeda } = useAjustes()
  const cambio = useCambio().data
  const fator = moeda === 'BRL' ? cambio : 1
  return {
    moeda: moeda === 'BRL' && !cambio ? ('USD' as const) : moeda,
    cambio: cambio ?? null,
    conv: (usd: number | null | undefined) => (usd == null || fator == null ? usd ?? null : usd * fator),
  }
}
