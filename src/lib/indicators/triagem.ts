import { useQuery } from '@tanstack/react-query'
import { pedirJson, primeiroQueResponde } from '../http'
import { DIA, HORA } from '../query'
import { percentil } from './calc'

// TRIAGEM QUANTITATIVA (etapa 2 do funil). Universo: top 500 da CoinGecko,
// sem BTC/ETH/BNB, stablecoins, versões embrulhadas/staked e ativos
// tokenizados (ouro, títulos, ações). Filtro mínimo: market cap ≥ US$ 100 mi
// e volume ≥ US$ 1 mi/dia. Cada token ganha as métricas de receita da
// DefiLlama (taxas, receita do protocolo, receita que chega ao detentor), via
// o mapa protocolo -> CoinGecko da própria DefiLlama.
//
// A nota aqui é SÓ a parte que dá para medir por script. Produto, adoção
// orgânica, tokenomics detalhada, concorrência e bear case continuam sendo
// trabalho de leitura — a triagem só diz quem merece esse trabalho.

export type Token = {
  id: string
  simbolo: string
  nome: string
  icone: string
  preco: number
  mc: number
  fdv: number | null
  volume: number
  circulante: number | null
  total: number | null
  var7d: number | null
  var30d: number | null
  var1a: number | null
  // DefiLlama
  categoria: string | null
  slug: string | null
  tvl: number | null
  taxas30d: number | null
  receita30d: number | null
  holders30d: number | null
  receita1a: number | null
  // derivadas
  fdvMc: number | null
  fdvReceita: number | null
  /** Receita para holders anualizada ÷ market cap, em %. O "dividend yield". */
  yieldHolders: number | null
  /** Receita dos últimos 30 dias contra a média mensal dos 11 meses anteriores, em %. */
  crescReceita: number | null
  volMc: number
  nota: number | null
  alertas: string[]
}

type Gecko = {
  id: string
  symbol: string
  name: string
  image: string
  current_price: number
  market_cap: number
  fully_diluted_valuation: number | null
  total_volume: number
  circulating_supply: number | null
  total_supply: number | null
  price_change_percentage_7d_in_currency?: number | null
  price_change_percentage_30d_in_currency?: number | null
  price_change_percentage_1y_in_currency?: number | null
}

const FORA_IDS = new Set(['bitcoin', 'ethereum', 'binancecoin'])
const STABLES = /^(usdt|usdc|dai|usds|usde|fdusd|pyusd|tusd|usdp|gho|frax|lusd|crvusd|usd1|usdg|rlusd|usdtb|usdd|susds|susde|eurc|eurt|bfusd|usdf|usd0|usdx|usyc|buidl|ousg|usdy|syrupusdc)$/i
const EMBRULHADO = /wrapped|staked|bridged|restaked|liquid staking|\bbinance-peg\b|\bwormhole\b/i
const TOKENIZADO = /gold|treasur|t-bill|fund|tokeniz|xstock|bond|money market|\bnav\b|lending|tether gold|pax gold|middle market|credit/i

function ehStable(g: Gecko) {
  if (STABLES.test(g.symbol)) return true
  const perto1 = Math.abs(g.current_price - 1) < 0.02 && Math.abs(g.price_change_percentage_30d_in_currency ?? 0) < 2
  return perto1
}

async function universo(): Promise<Gecko[]> {
  const base = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&price_change_percentage=7d,30d,1y'
  const [a, b] = await Promise.all([pedirJson<Gecko[]>(`${base}&page=1`), pedirJson<Gecko[]>(`${base}&page=2`)])
  return [...a, ...b]
}

// ---------------------------------------------------------------------------
// DefiLlama: protocolo -> CoinGecko, e as receitas
// ---------------------------------------------------------------------------

type Lite = {
  protocols: { defillamaId: string; name: string; geckoId: string | null; parentProtocol?: string; category?: string; tvl?: number | null }[]
  parentProtocols: { id: string; name: string; gecko_id?: string | null }[]
}

export type MapaLlama = {
  /** defillamaId ou parent#id -> gecko id */
  paraGecko: Record<string, string>
  /** gecko id -> dados do protocolo */
  porGecko: Record<string, { nome: string; slug: string; categoria: string | null; tvl: number; tvlCategoria: number }>
  /** gecko ids que são moeda de uma blockchain (SOL, NEAR, AVAX…) */
  redes: string[]
}

const slugDe = (nome: string) => nome.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

async function mapaLlama(): Promise<MapaLlama> {
  const r = await pedirJson<Lite>('https://api.llama.fi/lite/protocols2?b=2', { timeoutMs: 45_000 })
  const paraGecko: Record<string, string> = {}
  const porGecko: MapaLlama['porGecko'] = {}
  for (const p of r.parentProtocols) {
    if (p.gecko_id) {
      paraGecko[p.id] = p.gecko_id
      porGecko[p.gecko_id] = { nome: p.name, slug: p.id.replace('parent#', ''), categoria: null, tvl: 0, tvlCategoria: -1 }
    }
  }
  for (const p of r.protocols) {
    const g = p.geckoId ?? (p.parentProtocol ? paraGecko[p.parentProtocol] : undefined)
    if (!g) continue
    paraGecko[p.defillamaId] = g
    const atual = porGecko[g] ?? { nome: p.name, slug: slugDe(p.name), categoria: null, tvl: 0, tvlCategoria: -1 }
    atual.tvl += p.tvl ?? 0
    // o setor é o do filho com maior TVL
    if (p.category && (p.tvl ?? 0) > atual.tvlCategoria) {
      atual.categoria = p.category
      atual.tvlCategoria = p.tvl ?? 0
    }
    porGecko[g] = atual
  }
  const redes = await pedirJson<{ gecko_id: string | null }[]>('https://api.llama.fi/v2/chains')
    .then((r) => r.map((c) => c.gecko_id).filter((x): x is string => !!x))
    .catch(() => [] as string[])
  return { paraGecko, porGecko, redes }
}

type ItemFees = { defillamaId?: string; parentProtocol?: string; total30d?: number | null; total1y?: number | null; total7d?: number | null }

async function receitas(tipo: 'dailyFees' | 'dailyRevenue' | 'dailyHoldersRevenue', mapa: MapaLlama) {
  const r = await pedirJson<{ protocols: ItemFees[] }>(
    `https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=${tipo}`,
    { timeoutMs: 45_000 },
  )
  const soma: Record<string, { d30: number; a1: number; d7: number }> = {}
  for (const p of r.protocols) {
    const g = (p.parentProtocol && mapa.paraGecko[p.parentProtocol]) || (p.defillamaId && mapa.paraGecko[p.defillamaId])
    if (!g) continue
    const s = soma[g] ?? { d30: 0, a1: 0, d7: 0 }
    s.d30 += p.total30d ?? 0
    s.a1 += p.total1y ?? 0
    s.d7 += p.total7d ?? 0
    soma[g] = s
  }
  return soma
}

// ---------------------------------------------------------------------------
// montagem
// ---------------------------------------------------------------------------

const ANUAL = 365 / 30

function rank(vals: (number | null)[], maiorMelhor: boolean) {
  const ok = vals.filter((v): v is number => v != null && Number.isFinite(v)).sort((a, b) => a - b)
  return (v: number | null) => {
    if (v == null || !Number.isFinite(v) || ok.length < 2) return null
    let lo = 0
    while (lo < ok.length && ok[lo] < v) lo++
    const p = lo / (ok.length - 1)
    return maiorMelhor ? p : 1 - p
  }
}

async function montar(): Promise<{ tokens: Token[]; universo: number; excluidos: number }> {
  const [gecko, mapa] = await Promise.all([universo(), mapaLlama()])
  const [taxas, receita, holders] = await Promise.all([
    receitas('dailyFees', mapa).catch(() => ({}) as Record<string, { d30: number; a1: number; d7: number }>),
    receitas('dailyRevenue', mapa),
    receitas('dailyHoldersRevenue', mapa).catch(() => ({}) as Record<string, { d30: number; a1: number; d7: number }>),
  ])

  const candidatos = gecko.filter(
    (g) => !FORA_IDS.has(g.id) && !ehStable(g) && !EMBRULHADO.test(g.name) && !EMBRULHADO.test(g.id) && !TOKENIZADO.test(g.name),
  )
  const filtrados = candidatos.filter((g) => g.market_cap >= 100e6 && g.total_volume >= 1e6)

  const redes = new Set(mapa.redes)
  const tokens: Token[] = filtrados.map((g) => {
    // Moeda de blockchain: a receita "mapeada" seria de algum app da rede
    // (uma ponte, um LST), não da rede. Fica sem receita e com setor próprio.
    const ehRede = redes.has(g.id)
    const ll = ehRede ? undefined : mapa.porGecko[g.id]
    const rv = ehRede ? undefined : receita[g.id]
    const hd = ehRede ? undefined : holders[g.id]
    const tx = ehRede ? undefined : taxas[g.id]
    const fdv = g.fully_diluted_valuation ?? null
    const receitaAnual = rv && rv.d30 > 0 ? rv.d30 * ANUAL : null
    const mesesAntes = rv && rv.a1 > rv.d30 ? ((rv.a1 - rv.d30) * 30) / 335 : null
    return {
      id: g.id,
      simbolo: g.symbol.toUpperCase(),
      nome: g.name,
      icone: g.image,
      preco: g.current_price,
      mc: g.market_cap,
      fdv,
      volume: g.total_volume,
      circulante: g.circulating_supply,
      total: g.total_supply,
      var7d: g.price_change_percentage_7d_in_currency ?? null,
      var30d: g.price_change_percentage_30d_in_currency ?? null,
      var1a: g.price_change_percentage_1y_in_currency ?? null,
      categoria: ehRede ? 'Blockchain (L1/L2)' : (ll?.categoria ?? null),
      slug: ll?.slug ?? null,
      tvl: ll && ll.tvl > 0 ? ll.tvl : null,
      taxas30d: tx ? tx.d30 : null,
      receita30d: rv ? rv.d30 : null,
      holders30d: hd ? hd.d30 : rv ? 0 : null,
      receita1a: rv ? rv.a1 : null,
      fdvMc: fdv && g.market_cap ? fdv / g.market_cap : null,
      fdvReceita: receitaAnual ? (fdv ?? g.market_cap) / receitaAnual : null,
      yieldHolders: hd && hd.d30 > 0 ? ((hd.d30 * ANUAL) / g.market_cap) * 100 : rv ? 0 : null,
      crescReceita: rv && mesesAntes && mesesAntes > 0 ? (rv.d30 / mesesAntes - 1) * 100 : null,
      volMc: (g.total_volume / g.market_cap) * 100,
      nota: null,
      alertas: [],
    }
  })

  // nota quantitativa: percentil de cada métrica dentro do universo com receita
  const comReceita = tokens.filter((t) => t.receita30d != null && t.receita30d > 0)
  const rY = rank(comReceita.map((t) => t.yieldHolders), true)
  const rV = rank(comReceita.map((t) => t.fdvReceita), false)
  const rC = rank(comReceita.map((t) => t.crescReceita), true)
  const rD = rank(comReceita.map((t) => t.fdvMc), false)
  const rL = rank(comReceita.map((t) => Math.min(t.volMc, 30)), true)
  for (const t of tokens) {
    if (t.fdvMc != null && t.fdvMc > 3) t.alertas.push(`Diluição severa: FDV ${t.fdvMc.toFixed(1).replace('.', ',')}× o market cap`)
    else if (t.fdvMc != null && t.fdvMc > 1.6) t.alertas.push('Mais de 1/3 da oferta ainda vai entrar no mercado')
    if (t.receita30d != null && t.receita30d > 0 && (t.holders30d ?? 0) === 0) t.alertas.push('Receita para o detentor não registrada: confirme se existe recompra, queima ou staking')
    if (t.categoria === 'Blockchain (L1/L2)')
      t.alertas.push('Moeda de rede: vale mais como "prêmio monetário" do que por receita — o método mede mal')
    else if (t.receita30d == null) t.alertas.push('Sem receita mapeada na DefiLlama')
    if (t.volMc < 1) t.alertas.push('Volume abaixo de 1% do market cap: saída pode ser difícil')
    if (!(t.receita30d != null && t.receita30d > 0)) continue
    const partes: [number | null, number][] = [
      [rY(t.yieldHolders), 30],
      [rV(t.fdvReceita), 25],
      [rC(t.crescReceita), 15],
      [rD(t.fdvMc), 15],
      [rL(Math.min(t.volMc, 30)), 15],
    ]
    const validas = partes.filter(([v]) => v != null) as [number, number][]
    const peso = validas.reduce((s, [, w]) => s + w, 0)
    t.nota = peso ? Math.round((validas.reduce((s, [v, w]) => s + v * w, 0) / peso) * 100) : null
  }
  return { tokens, universo: gecko.length, excluidos: gecko.length - candidatos.length }
}

export const useTriagem = () =>
  useQuery({ queryKey: ['triagem', 'v2'], queryFn: montar, staleTime: 6 * HORA, gcTime: 3 * DIA })

export const medianaDe = (vals: (number | null)[]) => percentil(vals.filter((v): v is number => v != null && Number.isFinite(v)), 0.5)

// ---------------------------------------------------------------------------
// detalhe do token
// ---------------------------------------------------------------------------

/** Receita diária do protocolo (1 ano) para o gráfico do detalhe. */
export const useReceitaDiaria = (slug: string | null) =>
  useQuery({
    queryKey: ['triagem', 'receita', slug],
    enabled: !!slug,
    staleTime: 12 * HORA,
    queryFn: async () => {
      type R = { totalDataChart: [number, number][] }
      const pega = (tipo: string) =>
        pedirJson<R>(`https://api.llama.fi/summary/fees/${slug}?dataType=${tipo}`)
          .then((r) => r.totalDataChart.filter(([t]) => t >= Date.now() / 1000 - 400 * 86400))
          .catch(() => [] as [number, number][])
      const [taxas, receita, holders] = await Promise.all([pega('dailyFees'), pega('dailyRevenue'), pega('dailyHoldersRevenue')])
      return { taxas, receita, holders }
    },
  })

export type Liquidez = {
  corretora: 'Bybit' | 'OKX'
  par: string
  spread: number
  profCompra: number
  profVenda: number
}

type Livro = { bids: [number, number][]; asks: [number, number][] }

function medir(l: Livro, corretora: Liquidez['corretora'], par: string): Liquidez | null {
  if (!l.bids.length || !l.asks.length) return null
  const bid = l.bids[0][0]
  const ask = l.asks[0][0]
  const meio = (bid + ask) / 2
  const prof = (lado: [number, number][], lim: (p: number) => boolean) => lado.filter(([p]) => lim(p)).reduce((s, [p, q]) => s + p * q, 0)
  return {
    corretora,
    par,
    spread: ((ask - bid) / meio) * 100,
    profCompra: prof(l.bids, (p) => p >= meio * 0.98),
    profVenda: prof(l.asks, (p) => p <= meio * 1.02),
  }
}

/** Liquidez à vista: spread e profundidade a ±2% (Bybit; OKX de reserva). */
export const useLiquidez = (simbolo: string | null) =>
  useQuery({
    queryKey: ['triagem', 'liquidez', simbolo],
    enabled: !!simbolo,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: () =>
      primeiroQueResponde<Liquidez | null>([
        async () => {
          type R = { retCode: number; result: { a: [string, string][]; b: [string, string][] } }
          const r = await pedirJson<R>(`https://api.bybit.com/v5/market/orderbook?category=spot&symbol=${simbolo}USDT&limit=200`)
          if (r.retCode !== 0 || !r.result?.b?.length) throw new Error('sem par na Bybit')
          const n = (x: [string, string][]) => x.map(([p, q]) => [Number(p), Number(q)] as [number, number])
          return medir({ bids: n(r.result.b), asks: n(r.result.a) }, 'Bybit', `${simbolo}/USDT`)
        },
        async () => {
          type R = { code: string; data: { bids: string[][]; asks: string[][] }[] }
          const r = await pedirJson<R>(`https://www.okx.com/api/v5/market/books?instId=${simbolo}-USDT&sz=400`)
          if (r.code !== '0' || !r.data?.[0]) throw new Error('sem par na OKX')
          const n = (x: string[][]) => x.map(([p, q]) => [Number(p), Number(q)] as [number, number])
          return medir({ bids: n(r.data[0].bids), asks: n(r.data[0].asks) }, 'OKX', `${simbolo}/USDT`)
        },
      ]).catch(() => null),
  })
