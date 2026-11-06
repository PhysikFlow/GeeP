import { ErroHttp, pedirJson, primeiroQueResponde, rpc } from '../http'
import { compacto, data, numero } from '../format'
import type { Carteira } from '../store'
import type { DadosCarteira, Movimento, Token } from './tipos'

// Ethereum: saldo por RPC público (publicnode e reservas), tokens e histórico
// pelo Blockscout (grátis, sem chave). O Blockscout às vezes devolve 500 num
// endpoint e não no outro; por isso os tokens têm o Ethplorer (chave pública
// "freekey") como reserva, e um histórico que falha vira aviso, não erro.

const BS = 'https://eth.blockscout.com/api/v2'
const RPCS = ['https://ethereum-rpc.publicnode.com', 'https://eth.llamarpc.com', 'https://1rpc.io/eth']
const MAX_PAGINAS_HIST = 20 // 50 por página: até 1000 mudanças de saldo

const deUnidades = (v: string | number, dec: number) => Number(v) / 10 ** dec

export async function saldoEth(end: string) {
  const hex = await primeiroQueResponde(RPCS.map((u) => () => rpc<string>(u, 'eth_getBalance', [end, 'latest'])))
  return Number(BigInt(hex)) / 1e18
}

type TokenBS = {
  token: {
    address_hash: string
    decimals: string | null
    exchange_rate: string | null
    icon_url: string | null
    name: string | null
    symbol: string | null
    reputation?: string | null
    holders_count?: string | null
    volume_24h?: string | null
  }
  value: string
}
type Pagina<T> = { items: T[]; next_page_params: Record<string, string | number> | null }

function qs(p: Record<string, string | number> | null) {
  if (!p) return ''
  return Object.entries(p)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
}

async function tokensBlockscout(end: string): Promise<Token[]> {
  const itens: TokenBS[] = []
  let prox: Record<string, string | number> | null = null
  for (let i = 0; i < 4; i++) {
    const extra: string = prox ? `&${qs(prox)}` : ''
    // A primeira página falhar é erro (cai no Ethplorer); as seguintes, não:
    // fica o que já veio (os tokens vêm do mais valioso para o menos).
    // Carteira com milhares de tokens faz o Blockscout demorar dezenas de
    // segundos: 12 s e uma tentativa só, depois o Ethplorer (uma chamada só).
    const p: Pagina<TokenBS> | null = await pedirJson<Pagina<TokenBS>>(`${BS}/addresses/${end}/tokens?type=ERC-20${extra}`, {
      timeoutMs: 12_000,
      tentativas: i === 0 ? 1 : 2,
    }).catch((e) => {
      if (i === 0) throw e
      return null
    })
    if (!p) break
    itens.push(...p.items)
    prox = p.next_page_params
    if (!prox) break
  }
  return itens.map((it) => {
    const dec = Number(it.token.decimals ?? 18)
    const preco = it.token.exchange_rate != null ? Number(it.token.exchange_rate) : null
    return {
      id: it.token.address_hash.toLowerCase(),
      simbolo: it.token.symbol ?? '?',
      nome: it.token.name ?? it.token.symbol ?? 'Token',
      qtd: deUnidades(it.value, dec),
      precoUsd: preco,
      icone: it.token.icon_url ?? undefined,
      confiavel: preco != null && (it.token.reputation ?? 'ok') === 'ok' && liquido(it.token.volume_24h),
    }
  })
}

// Token com "preço" mas sem negociação de verdade (meme/spam enviado de
// presente) não entra no patrimônio: não daria para vender por aquele preço.
const VOLUME_MINIMO = 5_000
const liquido = (volume: string | number | null | undefined) => volume == null || Number(volume) >= VOLUME_MINIMO

type Ethplorer = {
  tokens?: {
    tokenInfo: {
      address: string
      name?: string
      symbol?: string
      decimals: string
      image?: string
      price: false | { rate: number; diff?: number; volume24h?: number }
    }
    rawBalance: string
  }[]
}

async function tokensEthplorer(end: string): Promise<Token[]> {
  const r = await pedirJson<Ethplorer>(`https://api.ethplorer.io/getAddressInfo/${end}?apiKey=freekey`)
  return (r.tokens ?? []).map((t) => {
    const preco = t.tokenInfo.price ? t.tokenInfo.price.rate : null
    return {
      id: t.tokenInfo.address.toLowerCase(),
      simbolo: t.tokenInfo.symbol ?? '?',
      nome: t.tokenInfo.name ?? 'Token',
      qtd: deUnidades(t.rawBalance, Number(t.tokenInfo.decimals || 18)),
      precoUsd: preco,
      variacao24h: t.tokenInfo.price ? (t.tokenInfo.price.diff ?? null) : null,
      icone: t.tokenInfo.image ? `https://ethplorer.io${t.tokenInfo.image}` : undefined,
      confiavel: preco != null && liquido(t.tokenInfo.price ? t.tokenInfo.price.volume24h : null),
    }
  })
}

type MudancaSaldo = { block_number: number; block_timestamp: string; delta: string; transaction_hash: string | null; value: string }

async function historicoSaldo(end: string) {
  const out: Movimento[] = []
  let prox: Record<string, string | number> | null = null
  let paginas = 0
  do {
    const extra: string = prox ? `?${qs(prox)}` : ''
    // Página seguinte que falha (limite de taxa do Blockscout) encerra a
    // busca com o que já veio, marcado como parcial.
    const p: Pagina<MudancaSaldo> | null = await pedirJson<Pagina<MudancaSaldo>>(`${BS}/addresses/${end}/coin-balance-history${extra}`, {
      tentativas: paginas === 0 ? 3 : 2,
      timeoutMs: 15_000,
    }).catch((e) => {
      if (paginas === 0) throw e
      return null
    })
    if (!p) return { movimentos: out.sort((a, b) => a.t - b.t), parcial: true }
    for (const m of p.items) {
      out.push({
        txid: m.transaction_hash ?? `bloco-${m.block_number}`,
        t: Math.floor(new Date(m.block_timestamp).getTime() / 1000),
        delta: deUnidades(m.delta, 18),
      })
    }
    prox = p.next_page_params
    paginas++
  } while (prox && paginas < MAX_PAGINAS_HIST)
  return { movimentos: out.sort((a, b) => a.t - b.t), parcial: !!prox }
}

type Contadores = { transactions_count: string; token_transfers_count: string; gas_usage_count: string }

export async function carregarEth(c: Carteira): Promise<DadosCarteira> {
  const end = c.endereco
  const avisos: string[] = []

  const [saldo, tokens, hist, cont] = await Promise.all([
    saldoEth(end),
    tokensBlockscout(end).catch(() => tokensEthplorer(end)).catch((e: unknown) => {
      avisos.push(`Tokens indisponíveis agora (${e instanceof ErroHttp ? e.message : 'falha de rede'}).`)
      return [] as Token[]
    }),
    historicoSaldo(end).catch(() => {
      avisos.push('O histórico do Blockscout não respondeu agora; o preço médio e o gráfico voltam na próxima atualização.')
      return null
    }),
    pedirJson<Contadores>(`${BS}/addresses/${end}/counters`, { tentativas: 2, timeoutMs: 12_000 }).catch(() => null),
  ])

  const movimentos = hist?.movimentos ?? null
  if (hist?.parcial)
    avisos.push(
      `Histórico parcial: vieram as ${hist.movimentos.length} movimentações mais recentes (limite de páginas ou de chamadas do Blockscout). O preço médio considera o saldo anterior pelo preço da primeira delas.`,
    )
  const primeira = movimentos?.[0]?.t
  const ultima = movimentos?.[movimentos.length - 1]?.t

  const detalhes = [
    { rotulo: 'Transações', valor: cont ? numero(Number(cont.transactions_count), 0) : '—' },
    { rotulo: 'Transferências de token', valor: cont ? numero(Number(cont.token_transfers_count), 0) : '—' },
    { rotulo: 'Gás usado', valor: cont ? compacto(Number(cont.gas_usage_count)) : '—' },
    { rotulo: 'Primeira movimentação', valor: data(primeira), dica: hist?.parcial ? 'Dentro do período baixado' : undefined },
    { rotulo: 'Última movimentação', valor: data(ultima) },
    { rotulo: 'Tokens com preço', valor: numero(tokens.filter((t) => t.confiavel).length, 0) },
  ]
  if (c.ens) detalhes.unshift({ rotulo: 'ENS', valor: c.ens })

  return {
    rede: 'eth',
    nativo: 'ETH',
    saldo,
    pendente: 0,
    tokens,
    movimentos,
    historicoParcial: !!hist?.parcial,
    totalTransacoes: cont ? Number(cont.transactions_count) : null,
    detalhes,
    avisos,
    atualizadoEm: Date.now(),
  }
}

/** vitalik.eth -> 0x… (pela busca do Blockscout, que resolve ENS). */
export async function resolverEns(nome: string) {
  const r = await pedirJson<{ items: { address_hash?: string; ens_info?: { name?: string }; type?: string }[] }>(
    `${BS}/search?q=${encodeURIComponent(nome)}`,
  )
  const hit = r.items.find((i) => i.ens_info?.name?.toLowerCase() === nome.toLowerCase() && i.address_hash)
  if (!hit?.address_hash) throw new Error(`Não encontrei o ENS ${nome}.`)
  return hit.address_hash
}

// ---------------------------------------------------------------------------
// rede (indicadores)
// ---------------------------------------------------------------------------

export type StatsEth = {
  gas_prices: { slow: number; average: number; fast: number } | null
  network_utilization_percentage: number
  transactions_today: string
  total_addresses: string
  average_block_time: number
}
export const statsEth = () => pedirJson<StatsEth>(`${BS}/stats`)
