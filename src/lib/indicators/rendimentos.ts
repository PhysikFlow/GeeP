import { useQuery } from '@tanstack/react-query'
import { pedirJson } from '../http'
import { HORA, MIN } from '../query'
import { percentil } from './calc'

// Radar de rendimentos (pools DeFi) a partir do yields.llama.fi.
//
// O número que a pool anuncia (o "cartaz") é uma foto do momento. O que dá
// para levar a sério é o CHÃO: o rendimento que a pool superou em 9 de cada
// 10 dias do último mês (percentil 10 do APY diário). E a parte "base" (taxas
// de negociação, juros) se sustenta sozinha; a de "incentivo" (token do
// protocolo) só dura enquanto o protocolo pagar.

export type Pool = {
  id: string
  rede: string
  projeto: string
  simbolo: string
  meta: string | null
  tvl: number
  apy: number
  apyBase: number
  apyIncentivo: number
  media30d: number | null
  var1d: number | null
  var7d: number | null
  var30d: number | null
  stable: boolean
  riscoIL: boolean
  exposicao: 'single' | 'multi'
  sigma: number | null
  outlier: boolean
  previsao: string | null
  volume1d: number | null
  grupos: Grupo[]
}

export type Grupo = 'BTC' | 'ETH' | 'SOL' | 'Stable'

type Bruto = {
  chain: string
  project: string
  symbol: string
  tvlUsd: number
  apyBase: number | null
  apyReward: number | null
  apy: number | null
  pool: string
  apyPct1D: number | null
  apyPct7D: number | null
  apyPct30D: number | null
  stablecoin: boolean
  ilRisk: string
  exposure: string
  predictions?: { predictedClass: string | null } | null
  poolMeta: string | null
  sigma: number | null
  outlier: boolean
  apyMean30d: number | null
  volumeUsd1d: number | null
}

// Derivados contam no grupo da moeda: WBTC/cbBTC no BTC, stETH/weETH no ETH,
// JitoSOL/mSOL no SOL. "SOLV" é protocolo de BTC, não Solana.
const RE: Record<Exclude<Grupo, 'Stable'>, RegExp> = {
  BTC: /BTC/i,
  ETH: /ETH/i,
  SOL: /SOL(?!V)|^INF$/i,
}

function gruposDe(simbolo: string, stable: boolean): Grupo[] {
  const g: Grupo[] = []
  for (const k of ['BTC', 'ETH', 'SOL'] as const) if (RE[k].test(simbolo)) g.push(k)
  if (stable || /USD|DAI|FRAX|GHO|PYUSD|EURC/i.test(simbolo)) g.push('Stable')
  return g
}

async function carregarPools(): Promise<Pool[]> {
  const r = await pedirJson<{ data: Bruto[] }>('https://yields.llama.fi/pools', { timeoutMs: 45_000 })
  return r.data
    // APY quase zero = só colateral (ex.: depósito na Aave que não rende): não é rendimento.
    .filter((p) => p.tvlUsd >= 250_000 && p.apy != null && p.apy >= 0.05 && p.apy < 1000)
    .map((p) => ({
      id: p.pool,
      rede: p.chain,
      projeto: p.project,
      simbolo: p.symbol,
      meta: p.poolMeta,
      tvl: p.tvlUsd,
      apy: p.apy ?? 0,
      apyBase: p.apyBase ?? 0,
      apyIncentivo: p.apyReward ?? 0,
      media30d: p.apyMean30d,
      var1d: p.apyPct1D,
      var7d: p.apyPct7D,
      var30d: p.apyPct30D,
      stable: p.stablecoin,
      riscoIL: p.ilRisk === 'yes',
      exposicao: p.exposure === 'single' ? 'single' : 'multi',
      sigma: p.sigma,
      outlier: p.outlier,
      previsao: p.predictions?.predictedClass ?? null,
      volume1d: p.volumeUsd1d,
      grupos: gruposDe(p.symbol, p.stablecoin),
    }))
}

export const usePools = () => useQuery({ queryKey: ['ind', 'pools'], queryFn: carregarPools, staleTime: 30 * MIN, refetchInterval: 60 * MIN })

export type PontoPool = { t: number; apy: number; apyBase: number; apyIncentivo: number; tvl: number }
export type HistoricoPool = {
  pontos: PontoPool[]
  /** P10 do APY diário nos últimos 30 dias. */
  chao: number | null
  /** O mesmo, só da parte base (sem incentivo). */
  chaoBase: number | null
  /** Mediana do último mês. */
  mediana30d: number | null
  /** Variação do TVL em 30 dias (%). */
  tvl30d: number | null
  dias: number
}

export async function historicoPool(id: string): Promise<HistoricoPool> {
  const r = await pedirJson<{ data: { timestamp: string; tvlUsd: number; apy: number | null; apyBase: number | null; apyReward: number | null }[] }>(
    `https://yields.llama.fi/chart/${id}`,
  )
  const pontos = r.data
    .filter((d) => d.apy != null)
    .map((d) => ({
      t: Math.floor(new Date(d.timestamp).getTime() / 1000),
      apy: d.apy ?? 0,
      apyBase: d.apyBase ?? 0,
      apyIncentivo: d.apyReward ?? 0,
      tvl: d.tvlUsd,
    }))
  const corte = Date.now() / 1000 - 30 * 86400
  const mes = pontos.filter((p) => p.t >= corte)
  const tvlAntes = pontos.find((p) => p.t >= corte)?.tvl
  const tvlAgora = pontos[pontos.length - 1]?.tvl
  return {
    pontos,
    chao: percentil(mes.map((p) => p.apy), 0.1),
    chaoBase: percentil(mes.map((p) => p.apyBase), 0.1),
    mediana30d: percentil(mes.map((p) => p.apy), 0.5),
    tvl30d: tvlAntes && tvlAgora ? (tvlAgora / tvlAntes - 1) * 100 : null,
    dias: mes.length,
  }
}

export const useHistoricoPool = (id: string | null, ligado = true) =>
  useQuery({
    queryKey: ['ind', 'pool', id],
    queryFn: () => historicoPool(id!),
    enabled: !!id && ligado,
    staleTime: 6 * HORA,
  })

/** O que mudou de um dia para o outro numa pool e merece aviso. */
export function mudancas(p: Pool): string[] {
  const out: string[] = []
  if (p.var1d != null && Math.abs(p.var1d) >= Math.max(2, p.apy * 0.3)) {
    out.push(`APY ${p.var1d > 0 ? 'subiu' : 'caiu'} ${Math.abs(p.var1d).toFixed(1)} p.p. em 24 h`)
  }
  if (p.var7d != null && Math.abs(p.var7d) >= Math.max(4, p.apy * 0.5)) {
    out.push(`APY ${p.var7d > 0 ? 'subiu' : 'caiu'} ${Math.abs(p.var7d).toFixed(1)} p.p. em 7 dias`)
  }
  if (p.outlier) out.push('Fora da curva (outlier) para a DefiLlama')
  if (p.apyIncentivo > 0 && p.apyIncentivo > p.apyBase * 2) out.push('Mais de 2/3 do rendimento é incentivo')
  return out
}

export const REDES_GRANDES = ['Ethereum', 'Solana', 'Base', 'Arbitrum', 'BSC', 'OP Mainnet', 'Polygon', 'Avalanche', 'Bitcoin', 'Hyperliquid L1', 'Sui']
