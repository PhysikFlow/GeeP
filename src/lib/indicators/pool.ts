import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { pedirJson, rpc } from '../http'
import { MIN } from '../query'
import type { Nativo } from '../store'
import { useVelasOhlc, type Vela } from './fontes'

// RANGE DE POOL (liquidez concentrada) — ver docs/pesquisa-range-lp.md.
//
// Duas perguntas, nesta ordem:
//  1. VALE prover liquidez neste par agora? Enquanto o preço está dentro do
//     range, as taxas e o custo da volatilidade (LVR) são os dois
//     proporcionais à liquidez da posição — apertar o range multiplica os
//     dois. Então quem decide é a razão
//        R = (taxas do dia ÷ liquidez ativa no preço) ÷ (σ²_dia × √q ÷ 4)
//     medida numa pool de referência do par. R < 1: fique de fora.
//  2. Se vale, QUAL range: pelo caminho histórico do preço (máxima e mínima
//     atingidas em cada janela do horizonte, não só o fechamento), ajustado
//     pela volatilidade de agora, em três perfis de cobertura.
//
// A pool de referência só serve para medir o par; o app não recomenda pool.

export type ParLp = 'SOL' | 'ETH' | 'BTC'

const USDC_SOL = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

export const PARES_LP: Record<ParLp, { nome: string; binance: string; ativo: Nativo; fonte: string }> = {
  SOL: { nome: 'SOL/USDC', binance: 'SOLUSDT', ativo: 'SOL', fonte: 'Orca (Solana)' },
  ETH: { nome: 'ETH/USDC', binance: 'ETHUSDT', ativo: 'ETH', fonte: 'Uniswap v3 (Ethereum)' },
  BTC: { nome: 'cbBTC/USDC', binance: 'BTCUSDT', ativo: 'BTC', fonte: 'Orca (Solana)' },
}

const MINT: Record<'SOL' | 'BTC', string> = {
  SOL: 'So11111111111111111111111111111111111111112',
  BTC: 'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij',
}

/** Pool de referência, já reduzida ao que a conta precisa. */
export type PoolRef = {
  protocolo: string
  endereco: string
  link: string
  taxaPct: number
  tvl: number | null
  volumeDia: number
  /** Taxas por dia que ficam com os provedores (média de 7 dias quando há). */
  taxasDiaLp: number
  janelaTaxas: string
  /** Liquidez ativa no preço atual (unidade bruta do contrato). */
  liquidez: number
  /** Preço do ativo em USDC, nas unidades brutas (USDC base ÷ menor unidade do ativo). */
  qBruto: number
  decUsdc: number
  preco: number
}

type OrcaPool = {
  address: string
  feeRate: number
  protocolFeeRate: number
  liquidity: string
  price: string
  tvlUsdc: string
  tokenMintA: string
  tokenMintB: string
  tokenA: { decimals: number; symbol: string }
  tokenB: { decimals: number; symbol: string }
  stats: Record<string, { volume: string | null; fees: string | null }>
}

async function poolOrca(par: 'SOL' | 'BTC'): Promise<PoolRef> {
  const r = await pedirJson<{ data: OrcaPool[] }>(
    `https://api.orca.so/v2/solana/pools?token=${MINT[par]}&sortBy=volume24h&sortDirection=desc&size=20`,
  )
  const p = r.data.find((x) => (x.tokenMintA === MINT[par] && x.tokenMintB === USDC_SOL) || (x.tokenMintB === MINT[par] && x.tokenMintA === USDC_SOL))
  if (!p) throw new Error(`Sem pool ${PARES_LP[par].nome} na Orca agora.`)
  const usdcEhB = p.tokenMintB === USDC_SOL
  const decRisco = usdcEhB ? p.tokenA.decimals : p.tokenB.decimals
  const decUsdc = usdcEhB ? p.tokenB.decimals : p.tokenA.decimals
  const precoAB = Number(p.price) // token B por token A
  const preco = usdcEhB ? precoAB : 1 / precoAB
  const parteLp = 1 - p.protocolFeeRate / 10_000
  const f7 = Number(p.stats['7d']?.fees ?? NaN)
  const f24 = Number(p.stats['24h']?.fees ?? 0)
  const usa7 = Number.isFinite(f7) && f7 > 0
  return {
    protocolo: 'Orca Whirlpool',
    endereco: p.address,
    link: `https://www.orca.so/pools/${p.address}`,
    taxaPct: p.feeRate / 10_000,
    tvl: Number(p.tvlUsdc),
    volumeDia: Number(p.stats['24h']?.volume ?? 0),
    taxasDiaLp: (usa7 ? f7 / 7 : f24) * parteLp,
    janelaTaxas: usa7 ? 'média de 7 dias' : '24 h',
    liquidez: Number(p.liquidity),
    qBruto: preco * 10 ** (decUsdc - decRisco),
    decUsdc,
    preco,
  }
}

// Uniswap v3 USDC/WETH 0,05% na Ethereum: token0 = USDC (6), token1 = WETH (18).
const UNI_ETH = '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640'
const RPC_ETH = 'https://ethereum-rpc.publicnode.com'

async function poolUniswapEth(): Promise<PoolRef> {
  const chamar = (data: string) => rpc<string>(RPC_ETH, 'eth_call', [{ to: UNI_ETH, data }, 'latest'])
  type Gecko = { data: { attributes: { reserve_in_usd: string; volume_usd: { h24: string }; base_token_price_usd: string } } }
  const [liq, slot0, g] = await Promise.all([
    chamar('0x1a686502'), // liquidity()
    chamar('0x3850c7bd'), // slot0()
    pedirJson<Gecko>(`https://api.geckoterminal.com/api/v2/networks/eth/pools/${UNI_ETH}`),
  ])
  const liquidez = Number(BigInt(liq))
  const sqrtX96 = Number(BigInt('0x' + slot0.slice(2, 66)))
  const p01 = (sqrtX96 / 2 ** 96) ** 2 // WETH bruto por USDC bruto
  const qBruto = 1 / p01 // USDC bruto por WETH bruto
  const preco = qBruto * 10 ** (18 - 6)
  const volume = Number(g.data.attributes.volume_usd.h24)
  // Conservador: supõe que o "fee switch" do Uniswap leva 1/4 das taxas
  // desta faixa de pool para o protocolo.
  return {
    protocolo: 'Uniswap v3 · 0,05%',
    endereco: UNI_ETH,
    link: `https://app.uniswap.org/explore/pools/ethereum/${UNI_ETH}`,
    taxaPct: 0.05,
    tvl: Number(g.data.attributes.reserve_in_usd),
    volumeDia: volume,
    taxasDiaLp: volume * 0.0005 * 0.75,
    janelaTaxas: '24 h (sem média de 7 dias na fonte grátis)',
    liquidez,
    qBruto,
    decUsdc: 6,
    preco,
  }
}

export const usePoolReferencia = (par: ParLp) =>
  useQuery({
    queryKey: ['lp', 'pool', par],
    queryFn: () => (par === 'ETH' ? poolUniswapEth() : poolOrca(par)),
    staleTime: 10 * MIN,
    refetchInterval: 15 * MIN,
  })

// ---------------------------------------------------------------------------
// matemática da posição (Uniswap v3 / Whirlpool / CLMM — a mesma)
// ---------------------------------------------------------------------------

/** Valor da posição ÷ valor de só segurar as moedas, no preço p, para range [a, b] aberto em P. */
export function contraHodl(P: number, a: number, b: number, p: number) {
  const x0 = 1 / Math.sqrt(P) - 1 / Math.sqrt(b)
  const y0 = Math.sqrt(P) - Math.sqrt(a)
  let x: number
  let y: number
  if (p <= a) {
    x = 1 / Math.sqrt(a) - 1 / Math.sqrt(b)
    y = 0
  } else if (p >= b) {
    x = 0
    y = Math.sqrt(b) - Math.sqrt(a)
  } else {
    x = 1 / Math.sqrt(p) - 1 / Math.sqrt(b)
    y = Math.sqrt(p) - Math.sqrt(a)
  }
  return (x * p + y) / (x0 * p + y0) - 1
}

/** Quantas vezes mais taxas por dólar que o range cheio (eficiência de capital). */
export const multiplicador = (a: number, b: number) => 1 / (1 - (a / b) ** 0.25)

function desvio(xs: number[]) {
  const m = xs.reduce((s, x) => s + x, 0) / xs.length
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length - 1))
}

function quantil(xs: number[], q: number) {
  const o = [...xs].sort((a, b) => a - b)
  const i = Math.min(o.length - 1, Math.max(0, (o.length - 1) * q))
  const lo = Math.floor(i)
  return o[lo] + (o[Math.ceil(i)] - o[lo]) * (i - lo)
}

export type Perfil = 'conservador' | 'equilibrado' | 'agressivo'
export const COBERTURA: Record<Perfil, number> = { conservador: 0.9, equilibrado: 0.75, agressivo: 0.5 }

export type Range = {
  perfil: Perfil
  min: number
  max: number
  /** % das janelas históricas que ficaram o horizonte inteiro dentro. */
  cobertura: number
  /** Fração média dos dias dentro do range (quando gera taxa). */
  tempoDentro: number
  reposicoesMes: number
  mult: number
  ilMin: number
  ilMax: number
  taxasAno: number | null
  lvrAno: number | null
  /** (taxas − LVR) × tempo dentro − custo de reposicionar, em % ao ano. */
  saldoAno: number | null
}

export type AnaliseLp = {
  par: ParLp
  preco: number
  sigmaDia: number
  janelas: number
  horizonte: number
  R: number | null
  viabilidade: 'fora' | 'fina' | 'considerar' | null
  ranges: Range[]
  lateral: { min: number; max: number } | null
  faixa30: { min: number; max: number }
}

/**
 * Excursões do caminho: para cada dia de partida, a máxima e a mínima
 * atingidas nos H dias seguintes, em desvios-padrão da volatilidade da época
 * (vol dos 30 dias anteriores). Assim um período calmo e um agitado entram na
 * mesma régua, e a régua é reescalada pela volatilidade de agora.
 */
export function analisarRange(par: ParLp, v: Vela[], H: number, pool: PoolRef | undefined, custoRepos: number): AnaliseLp | null {
  if (v.length < 200) return null
  const ret = v.map((x, i) => (i ? Math.log(x.c / v[i - 1].c) : 0))
  const sigmaDia = desvio(ret.slice(-30))
  const preco = pool?.preco && Math.abs(pool.preco / v[v.length - 1].c - 1) < 0.05 ? pool.preco : v[v.length - 1].c

  const cima: number[] = []
  const baixo: number[] = []
  const caminhos: number[][] = []
  for (let i = 31; i + H < v.length; i++) {
    const s = desvio(ret.slice(i - 30, i + 1))
    if (!s) continue
    const c0 = v[i].c
    let mx = 0
    let mn = 0
    const fech: number[] = []
    for (let j = i + 1; j <= i + H; j++) {
      mx = Math.max(mx, Math.log(v[j].h / c0) / s)
      mn = Math.min(mn, Math.log(v[j].l / c0) / s)
      fech.push(Math.log(v[j].c / c0) / s)
    }
    cima.push(mx)
    baixo.push(mn)
    caminhos.push(fech)
  }
  const n = cima.length
  if (n < 60) return null

  const cobre = (lb: number, ub: number) => {
    let k = 0
    for (let i = 0; i < n; i++) if (cima[i] <= ub && baixo[i] >= lb) k++
    return k / n
  }

  // Liquidez da pool por unidade (para taxas e LVR de US$ 1 no range)
  const q = pool?.qBruto
  const fatorPreco = q ? q / preco : null // converte preço humano em bruto
  const taxaPorL = pool && pool.liquidez > 0 ? pool.taxasDiaLp / pool.liquidez : null // US$ por L por dia
  const lvrPorL = q && pool ? (sigmaDia ** 2 * Math.sqrt(q)) / 4 / 10 ** pool.decUsdc : null // US$ por L por dia
  const R = taxaPorL != null && lvrPorL ? taxaPorL / lvrPorL : null

  const ranges: Range[] = (Object.keys(COBERTURA) as Perfil[]).map((perfil) => {
    const alvo = COBERTURA[perfil]
    let lo = 0.0005
    let hi = 0.9999
    for (let it = 0; it < 40; it++) {
      const a = (lo + hi) / 2
      if (cobre(quantil(baixo, a / 2), quantil(cima, 1 - a / 2)) > alvo) lo = a
      else hi = a
    }
    const a = lo
    const lb = quantil(baixo, a / 2)
    const ub = quantil(cima, 1 - a / 2)
    const min = preco * Math.exp(lb * sigmaDia)
    const max = preco * Math.exp(ub * sigmaDia)
    let dentro = 0
    for (const c of caminhos) dentro += c.filter((x) => x >= lb && x <= ub).length / c.length
    const tempoDentro = dentro / n
    const cobertura = cobre(lb, ub)
    const reposicoesMes = (30 / H) * (1 - cobertura)

    let taxasAno: number | null = null
    let lvrAno: number | null = null
    let saldoAno: number | null = null
    if (pool && fatorPreco && taxaPorL != null && lvrPorL != null && q) {
      const qa = min * fatorPreco
      const qb = max * fatorPreco
      const L1 = 10 ** pool.decUsdc / (2 * Math.sqrt(q) - q / Math.sqrt(qb) - Math.sqrt(qa)) // liquidez de US$ 1
      taxasAno = taxaPorL * L1 * 365 * 100
      lvrAno = lvrPorL * L1 * 365 * 100
      saldoAno = (taxasAno - lvrAno) * tempoDentro - custoRepos * reposicoesMes * 12
    }
    return {
      perfil,
      min,
      max,
      cobertura,
      tempoDentro,
      reposicoesMes,
      mult: multiplicador(min, max),
      ilMin: contraHodl(preco, min, max, min) * 100,
      ilMax: contraHodl(preco, min, max, max) * 100,
      taxasAno,
      lvrAno,
      saldoAno,
    }
  })

  // Lateralidade: faixa dos últimos 30 dias estreita para a volatilidade e
  // sem tendência (fechamento perto do meio da faixa de 60 dias atrás).
  const u30 = v.slice(-30)
  const f30 = { min: Math.min(...u30.map((x) => x.l)), max: Math.max(...u30.map((x) => x.h)) }
  const largura = Math.log(f30.max / f30.min)
  const deriva = Math.abs(Math.log(v[v.length - 1].c / v[v.length - 31].c))
  const lateral = largura < sigmaDia * Math.sqrt(30) * 1.6 && deriva < largura * 0.35 ? f30 : null

  return {
    par,
    preco,
    sigmaDia,
    janelas: n,
    horizonte: H,
    R,
    viabilidade: R == null ? null : R < 1 ? 'fora' : R < 1.5 ? 'fina' : 'considerar',
    ranges,
    lateral,
    faixa30: f30,
  }
}

export function useRange(par: ParLp, H: number, custoRepos: number) {
  const velas = useVelasOhlc(PARES_LP[par].binance, 1150)
  const pool = usePoolReferencia(par)
  const analise = useMemo(
    () => (velas.data ? analisarRange(par, velas.data, H, pool.data, custoRepos) : null),
    [par, velas.data, H, pool.data, custoRepos],
  )
  return { analise, pool, velas }
}
