import { pedirJson, primeiroQueResponde, rpc } from '../http'
import { data, numero, qtd } from '../format'
import type { Carteira } from '../store'
import type { DadosCarteira, Detalhe, Movimento, Token } from './tipos'

// Solana. Sem chave: saldo pelo RPC público da publicnode e tokens pela
// Jupiter (holdings + metadados + preço, tudo grátis). O RPC oficial recusa
// pedidos vindos de navegador, e os RPCs públicos não guardam histórico nem
// respondem getProgramAccounts — por isso o HISTÓRICO e o STAKING NATIVO
// dependem de uma chave grátis da Helius (Ajustes). Sem ela, a carteira
// mostra saldo e tokens, sem preço médio.

const RPCS = ['https://solana-rpc.publicnode.com']
const JUP = 'https://lite-api.jup.ag'
const LAMPORTS = 1e9
const SOL_MINT = 'So11111111111111111111111111111111111111112'
const MAX_PAGINAS_HELIUS = 10 // 100 por página

type Holdings = {
  uiAmount: number
  tokens: Record<string, { uiAmount: number; decimals: number; excludeFromNetWorth?: boolean; reclaimableLamports?: string; lamports?: string }[]>
}

type TokenJup = {
  id: string
  name: string
  symbol: string
  icon?: string
  usdPrice?: number
  isVerified?: boolean
  organicScore?: number
  liquidity?: number
  tags?: string[]
  stats24h?: { priceChange?: number }
}

export async function metadadosJup(mints: string[]) {
  const mapa = new Map<string, TokenJup>()
  const lotes: string[][] = []
  for (let i = 0; i < mints.length; i += 100) lotes.push(mints.slice(i, i + 100))
  for (const l of lotes) {
    const r = await pedirJson<TokenJup[]>(`${JUP}/tokens/v2/search?query=${l.join(',')}`)
    for (const t of r) mapa.set(t.id, t)
  }
  return mapa
}

async function stakeNativo(end: string, key: string) {
  type Conta = { pubkey: string; account: { lamports: number; data: { parsed?: { info?: { stake?: { delegation?: { voter: string; stake: string } } } } } } }
  const contas = await rpc<Conta[]>(`https://mainnet.helius-rpc.com/?api-key=${key}`, 'getProgramAccounts', [
    'Stake11111111111111111111111111111111111111',
    { encoding: 'jsonParsed', filters: [{ memcmp: { offset: 44, bytes: end } }] },
  ])
  return {
    total: contas.reduce((s, c) => s + c.account.lamports, 0) / LAMPORTS,
    contas: contas.length,
  }
}

type TxHelius = {
  signature: string
  timestamp: number
  fee: number
  feePayer: string
  accountData?: { account: string; nativeBalanceChange: number }[]
}

async function historicoHelius(end: string, key: string) {
  const out: Movimento[] = []
  let antes: string | null = null
  let pag = 0
  let parcial = false
  for (; pag < MAX_PAGINAS_HELIUS; pag++) {
    const extra: string = antes ? `&before=${antes}` : ''
    const lote: TxHelius[] = await primeiroQueResponde([
      () => pedirJson<TxHelius[]>(`https://api.helius.xyz/v0/addresses/${end}/transactions?api-key=${key}&limit=100${extra}`),
      () => pedirJson<TxHelius[]>(`https://api-mainnet.helius-rpc.com/v0/addresses/${end}/transactions?api-key=${key}&limit=100${extra}`),
    ])
    for (const tx of lote) {
      const conta = tx.accountData?.find((a) => a.account === end)
      if (!conta || conta.nativeBalanceChange === 0) continue
      out.push({
        txid: tx.signature,
        t: tx.timestamp,
        delta: conta.nativeBalanceChange / LAMPORTS,
        taxa: tx.feePayer === end ? tx.fee / LAMPORTS : undefined,
      })
    }
    if (lote.length < 100) break
    antes = lote[lote.length - 1].signature
    if (pag === MAX_PAGINAS_HELIUS - 1) parcial = true
  }
  return { movimentos: out.sort((a, b) => a.t - b.t), parcial }
}

export async function carregarSol(c: Carteira, heliusKey: string): Promise<DadosCarteira> {
  const end = c.endereco
  const avisos: string[] = []

  const holdingsP = pedirJson<Holdings>(`${JUP}/ultra/v1/holdings/${end}`).catch(() => null)
  const saldoRpcP = primeiroQueResponde(
    [...(heliusKey ? [`https://mainnet.helius-rpc.com/?api-key=${heliusKey}`] : []), ...RPCS].map(
      (u) => () => rpc<{ value: number }>(u, 'getBalance', [end]).then((r) => r.value / LAMPORTS),
    ),
  ).catch(() => null)

  const [holdings, saldoRpc] = await Promise.all([holdingsP, saldoRpcP])
  const saldo = saldoRpc ?? holdings?.uiAmount
  if (saldo == null) throw new Error('Não consegui ler o saldo desta carteira Solana agora.')

  // Tokens: soma as contas de cada mint e busca nome/ícone/preço na Jupiter.
  let tokens: Token[] = []
  let recuperavel = 0
  if (holdings) {
    const porMint = Object.entries(holdings.tokens).filter(([mint]) => mint !== SOL_MINT)
    for (const [, contas] of porMint) for (const k of contas) recuperavel += Number(k.reclaimableLamports ?? 0)
    const comSaldo = porMint
      .map(([mint, contas]) => ({ mint, qtd: contas.reduce((s, k) => s + (k.uiAmount ?? 0), 0), excluir: contas.some((k) => k.excludeFromNetWorth) }))
      .filter((t) => t.qtd > 0)
    let meta = new Map<string, TokenJup>()
    try {
      meta = await metadadosJup(comSaldo.map((t) => t.mint))
    } catch {
      avisos.push('Nomes e preços dos tokens indisponíveis agora (Jupiter).')
    }
    tokens = comSaldo.map((t) => {
      const m = meta.get(t.mint)
      const preco = m?.usdPrice ?? null
      return {
        id: t.mint,
        simbolo: m?.symbol ?? t.mint.slice(0, 4),
        nome: m?.name ?? 'Token desconhecido',
        qtd: t.qtd,
        precoUsd: t.excluir ? null : preco,
        variacao24h: m?.stats24h?.priceChange ?? null,
        icone: m?.icon,
        // verificado (ou com volume orgânico) E com liquidez para vender
        confiavel: !t.excluir && preco != null && (m?.isVerified === true || (m?.organicScore ?? 0) >= 50) && (m?.liquidity ?? 0) >= 10_000,
      }
    })
  } else {
    avisos.push('Tokens indisponíveis agora (Jupiter não respondeu).')
  }

  let movimentos: Movimento[] | null = null
  let parcial = false
  let stake: { total: number; contas: number } | null = null
  if (heliusKey) {
    const [h, s] = await Promise.all([
      historicoHelius(end, heliusKey).catch(() => {
        avisos.push('A Helius não respondeu o histórico agora.')
        return null
      }),
      stakeNativo(end, heliusKey).catch(() => null),
    ])
    if (h) {
      movimentos = h.movimentos
      parcial = h.parcial
      if (parcial) avisos.push(`Histórico parcial: vieram as ${h.movimentos.length} movimentações mais recentes.`)
    }
    stake = s
  }

  const detalhes: Detalhe[] = [
    { rotulo: 'Tokens com saldo', valor: numero(tokens.length, 0) },
    { rotulo: 'Tokens com preço', valor: numero(tokens.filter((t) => t.confiavel).length, 0) },
  ]
  if (recuperavel > 0)
    detalhes.push({ rotulo: 'SOL recuperável', valor: `${qtd(recuperavel / LAMPORTS)} SOL`, dica: 'Aluguel preso em contas de token vazias ou excedente' })
  if (stake && stake.contas > 0) detalhes.push({ rotulo: 'Stake nativo', valor: `${qtd(stake.total)} SOL em ${stake.contas} conta(s)` })
  if (movimentos?.length) {
    detalhes.push({ rotulo: 'Primeira movimentação', valor: data(movimentos[0].t), dica: parcial ? 'Dentro do período baixado' : undefined })
    detalhes.push({ rotulo: 'Última movimentação', valor: data(movimentos[movimentos.length - 1].t) })
  }

  // O stake nativo é SOL da carteira, só que travado: entra no saldo para o
  // patrimônio fechar, e aparece separado nos detalhes.
  return {
    rede: 'sol',
    nativo: 'SOL',
    saldo: saldo + (stake?.total ?? 0),
    pendente: 0,
    tokens,
    movimentos,
    historicoParcial: parcial,
    totalTransacoes: null,
    detalhes,
    avisos,
    atualizadoEm: Date.now(),
  }
}

// ---------------------------------------------------------------------------
// rede (indicadores)
// ---------------------------------------------------------------------------

export async function statsSol() {
  const u = RPCS[0]
  const [amostras, epoca, inflacao] = await Promise.all([
    rpc<{ numTransactions: number; numNonVoteTransactions: number; samplePeriodSecs: number }[]>(u, 'getRecentPerformanceSamples', [10]),
    rpc<{ epoch: number; slotIndex: number; slotsInEpoch: number }>(u, 'getEpochInfo'),
    rpc<{ total: number }>(u, 'getInflationRate'),
  ])
  const tps = amostras.reduce((s, a) => s + a.numNonVoteTransactions / a.samplePeriodSecs, 0) / Math.max(1, amostras.length)
  return { tps, epoca: epoca.epoch, progressoEpoca: epoca.slotIndex / epoca.slotsInEpoch, inflacao: inflacao.total * 100 }
}

