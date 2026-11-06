import { HDKey } from '@scure/bip32'
import { bech32, createBase58check } from '@scure/base'
import { sha256 } from '@noble/hashes/sha2.js'
import { ripemd160 } from '@noble/hashes/legacy.js'
import { emLotes, pedirJson } from '../http'
import { data, numero, qtd } from '../format'
import type { Carteira } from '../store'
import type { DadosCarteira, EnderecoDerivado, Movimento } from './tipos'

// Bitcoin via API Esplora: mempool.space, com o Blockstream de reserva (mesma
// API, grátis, sem chave, CORS aberto). Endereço avulso ou chave estendida
// (xpub/ypub/zpub): a chave é derivada AQUI no navegador (BIP32), endereço por
// endereço, até 20 seguidos sem uso — o mesmo "gap limit" das carteiras. Nada
// sai do aparelho além dos endereços públicos.

const API = 'https://mempool.space/api'
const ESPLORAS = [API, 'https://blockstream.info/api']
let preferida = 0

/** GET numa API Esplora; se a preferida falhar (limite de taxa), passa para a
 *  outra e continua nela pelo resto da sessão. */
async function esplora<T>(caminho: string): Promise<T> {
  let erro: unknown
  // ordem fixada antes do laço: trocar a preferida no meio dele fazia a
  // segunda tentativa voltar para a mesma API que acabou de falhar
  const ordem = ESPLORAS.map((_, k) => (preferida + k) % ESPLORAS.length)
  for (let k = 0; k < ordem.length; k++) {
    const i = ordem[k]
    try {
      // A primeira opção tem prazo curto: o mempool.space limitado costuma
      // ficar pendurado em vez de recusar, e o Blockstream responde na hora.
      const ultima = k === ESPLORAS.length - 1
      return await pedirJson<T>(`${ESPLORAS[i]}${caminho}`, { tentativas: ultima ? 3 : 1, timeoutMs: ultima ? 25_000 : 8_000 })
    } catch (e) {
      erro = e
      if (k < ESPLORAS.length - 1) preferida = (i + 1) % ESPLORAS.length
    }
  }
  throw erro
}
const SAT = 1e8
const MAX_PAGINAS = 24 // 25 tx por página: até 600 transações por endereço
const GAP = 20
const MAX_ENDERECOS_POR_RAMO = 400

type Stats = { funded_txo_count: number; funded_txo_sum: number; spent_txo_count: number; spent_txo_sum: number; tx_count: number }
type InfoEndereco = { address: string; chain_stats: Stats; mempool_stats: Stats }
type Vout = { scriptpubkey_address?: string; value: number }
type Vin = { prevout: Vout | null }
type Tx = { txid: string; vin: Vin[]; vout: Vout[]; fee: number; status: { confirmed: boolean; block_time?: number } }
type Utxo = { value: number; status: { confirmed: boolean } }

export const infoEndereco = (a: string) => esplora<InfoEndereco>(`/address/${a}`)

async function txsDoEndereco(a: string, totalConfirmadas: number) {
  // A primeira página traz as da mempool + 25 confirmadas; as seguintes,
  // 25 confirmadas a partir da última vista.
  const todas: Tx[] = await esplora<Tx[]>(`/address/${a}/txs`)
  let confirmadas = todas.filter((t) => t.status.confirmed)
  let paginas = 1
  while (confirmadas.length < totalConfirmadas && paginas < MAX_PAGINAS) {
    const ultima = confirmadas[confirmadas.length - 1]
    if (!ultima) break
    // Página que falha (o mempool.space limita a taxa por IP, e o 429 dele vem
    // sem CORS, então chega aqui como erro de rede) encerra a busca: fica o
    // que já veio, marcado como parcial, em vez de perder a carteira inteira.
    const mais = await esplora<Tx[]>(`/address/${a}/txs/chain/${ultima.txid}`).catch(() => null)
    if (!mais || mais.length === 0) break
    todas.push(...mais)
    confirmadas = confirmadas.concat(mais)
    paginas++
  }
  return { txs: todas, parcial: confirmadas.length < totalConfirmadas }
}

/** Variação líquida de uma transação para um conjunto de endereços (os seus). */
function movimentoDe(tx: Tx, meus: Set<string>): Movimento {
  let entrou = 0
  let saiu = 0
  for (const o of tx.vout) if (o.scriptpubkey_address && meus.has(o.scriptpubkey_address)) entrou += o.value
  for (const i of tx.vin) if (i.prevout?.scriptpubkey_address && meus.has(i.prevout.scriptpubkey_address)) saiu += i.prevout.value
  return {
    txid: tx.txid,
    t: tx.status.block_time ?? Math.floor(Date.now() / 1000),
    delta: (entrou - saiu) / SAT,
    taxa: saiu > 0 ? tx.fee / SAT : undefined,
    pendente: !tx.status.confirmed,
  }
}

// ---------------------------------------------------------------------------
// chave estendida
// ---------------------------------------------------------------------------

const b58check = createBase58check(sha256)
const hash160 = (b: Uint8Array) => ripemd160(sha256(b))

type Formato = 'p2pkh' | 'p2sh-p2wpkh' | 'p2wpkh'

const VERSOES: Record<string, { private: number; public: number; formato: Formato }> = {
  x: { private: 0x0488ade4, public: 0x0488b21e, formato: 'p2pkh' },
  y: { private: 0x049d7878, public: 0x049d7cb2, formato: 'p2sh-p2wpkh' },
  z: { private: 0x04b2430c, public: 0x04b24746, formato: 'p2wpkh' },
}

function enderecoDe(pub: Uint8Array, f: Formato) {
  const h = hash160(pub)
  if (f === 'p2wpkh') return bech32.encode('bc', [0, ...bech32.toWords(h)])
  if (f === 'p2pkh') return b58check.encode(Uint8Array.of(0x00, ...h))
  const redeem = Uint8Array.of(0x00, 0x14, ...h)
  return b58check.encode(Uint8Array.of(0x05, ...hash160(redeem)))
}

export function derivar(xpub: string, ramo: 0 | 1, de: number, ate: number) {
  const v = VERSOES[xpub[0]]
  const raiz = HDKey.fromExtendedKey(xpub, { private: v.private, public: v.public }).deriveChild(ramo)
  const out: { endereco: string; caminho: string }[] = []
  for (let i = de; i < ate; i++) {
    const pub = raiz.deriveChild(i).publicKey
    if (pub) out.push({ endereco: enderecoDe(pub, v.formato), caminho: `${ramo}/${i}` })
  }
  return out
}

async function varrerRamo(xpub: string, ramo: 0 | 1) {
  const usados: (EnderecoDerivado & { info: InfoEndereco })[] = []
  let semUso = 0
  let i = 0
  while (semUso < GAP && i < MAX_ENDERECOS_POR_RAMO) {
    const lote = derivar(xpub, ramo, i, i + GAP)
    const infos = await emLotes(lote, 3, (d) => infoEndereco(d.endereco))
    for (let k = 0; k < lote.length; k++) {
      const inf = infos[k]
      const ntx = inf.chain_stats.tx_count + inf.mempool_stats.tx_count
      if (ntx > 0) {
        semUso = 0
        const saldo =
          (inf.chain_stats.funded_txo_sum - inf.chain_stats.spent_txo_sum + inf.mempool_stats.funded_txo_sum - inf.mempool_stats.spent_txo_sum) / SAT
        usados.push({ ...lote[k], saldo, ntx, info: inf })
      } else {
        semUso++
        if (semUso >= GAP) break
      }
    }
    i += GAP
  }
  return usados
}

// ---------------------------------------------------------------------------
// carga da carteira
// ---------------------------------------------------------------------------

export async function carregarBtc(c: Carteira): Promise<DadosCarteira> {
  let infos: InfoEndereco[]
  let enderecos: EnderecoDerivado[] | undefined
  if (c.tipo === 'xpub') {
    const [rec, troco] = await Promise.all([varrerRamo(c.endereco, 0), varrerRamo(c.endereco, 1)])
    const usados = [...rec, ...troco]
    infos = usados.map((u) => u.info)
    enderecos = usados.map(({ info: _i, ...e }) => e)
  } else {
    infos = [await infoEndereco(c.endereco)]
  }

  const meus = new Set(infos.map((i) => i.address))
  let confirmado = 0
  let pendente = 0
  let recebido = 0
  let ntxSoma = 0
  for (const i of infos) {
    confirmado += i.chain_stats.funded_txo_sum - i.chain_stats.spent_txo_sum
    pendente += i.mempool_stats.funded_txo_sum - i.mempool_stats.spent_txo_sum
    recebido += i.chain_stats.funded_txo_sum
    ntxSoma += i.chain_stats.tx_count + i.mempool_stats.tx_count
  }

  // Transações de todos os endereços, sem repetir: numa xpub o troco volta
  // para um endereço seu, e a mesma tx aparece em dois deles.
  const porTx = new Map<string, Tx>()
  let parcial = false
  const listas = await emLotes(infos, 2, (i) => txsDoEndereco(i.address, i.chain_stats.tx_count))
  for (const l of listas) {
    parcial ||= l.parcial
    for (const tx of l.txs) porTx.set(tx.txid, tx)
  }
  const movimentos = [...porTx.values()].map((tx) => movimentoDe(tx, meus)).sort((a, b) => a.t - b.t)

  const taxas = movimentos.reduce((s, m) => s + (m.taxa ?? 0), 0)
  const primeira = movimentos.find((m) => !m.pendente)?.t
  const ultima = movimentos[movimentos.length - 1]?.t

  // UTXOs: quantas "moedas" a carteira tem. Muitas pequenas = taxa alta para
  // gastar depois (só vale olhar endereço avulso; numa xpub seriam N chamadas).
  let utxoTexto: string | null = null
  if (c.tipo === 'endereco') {
    try {
      const utxos = await esplora<Utxo[]>(`/address/${c.endereco}/utxo`)
      const poeira = utxos.filter((u) => u.value < 10_000).length
      utxoTexto = `${utxos.length}${poeira ? ` (${poeira} abaixo de 10 mil sats)` : ''}`
    } catch {
      utxoTexto = null
    }
  }

  const detalhes = [
    { rotulo: 'Transações', valor: numero(ntxSoma, 0) },
    { rotulo: 'Total recebido', valor: `${qtd(recebido / SAT)} BTC` },
    { rotulo: 'Taxas pagas', valor: `${qtd(taxas)} BTC`, dica: parcial ? 'Só no período baixado' : undefined },
    { rotulo: 'Primeira transação', valor: data(primeira) },
    { rotulo: 'Última transação', valor: data(ultima) },
  ]
  if (utxoTexto) detalhes.push({ rotulo: 'UTXOs', valor: utxoTexto, dica: 'Moedas separadas no endereço' })
  if (enderecos) detalhes.push({ rotulo: 'Endereços usados', valor: numero(enderecos.length, 0) })

  return {
    rede: 'btc',
    nativo: 'BTC',
    saldo: confirmado / SAT,
    pendente: pendente / SAT,
    tokens: [],
    movimentos,
    historicoParcial: parcial,
    totalTransacoes: ntxSoma,
    detalhes,
    enderecos,
    avisos: parcial
      ? [
          `Histórico parcial: vieram ${movimentos.length} transações (limite de 600 por endereço ou de chamadas da API). O preço médio considera o saldo anterior pelo preço da primeira delas.`,
        ]
      : [],
    atualizadoEm: Date.now(),
  }
}

// ---------------------------------------------------------------------------
// rede (usado nos indicadores)
// ---------------------------------------------------------------------------

export type Taxas = { fastestFee: number; halfHourFee: number; hourFee: number; economyFee: number; minimumFee: number }
export type Ajuste = {
  progressPercent: number
  difficultyChange: number
  estimatedRetargetDate: number
  remainingBlocks: number
  remainingTime: number
  previousRetarget: number
  nextRetargetHeight: number
}

export const taxasBtc = () => pedirJson<Taxas>(`${API}/v1/fees/recommended`)
export const ajusteDificuldade = () => pedirJson<Ajuste>(`${API}/v1/difficulty-adjustment`)
export async function alturaAtual() {
  for (const base of ESPLORAS) {
    try {
      const r = await fetch(`${base}/blocks/tip/height`)
      if (r.ok) return Number(await r.text())
    } catch {
      // tenta a próxima
    }
  }
  throw new Error('Sem altura de bloco agora.')
}
export const hashrate1a = () =>
  pedirJson<{ hashrates: { timestamp: number; avgHashrate: number }[]; currentHashrate: number; currentDifficulty: number }>(
    `${API}/v1/mining/hashrate/1y`,
  )
/** Recompensa média por bloco (sats, com taxas) e preço em USD, ~diário desde 2009. */
export const recompensasHistoricas = () =>
  pedirJson<{ timestamp: number; avgRewards: number; USD: number }[]>(`${API}/v1/mining/blocks/rewards/all`, { timeoutMs: 25_000, tentativas: 2 })
export const hashrateHistorico = () =>
  pedirJson<{ hashrates: { timestamp: number; avgHashrate: number }[] }>(`${API}/v1/mining/hashrate/all`, { timeoutMs: 25_000, tentativas: 2 })
export const mempoolInfo = () => pedirJson<{ count: number; vsize: number; total_fee: number }>(`${API}/mempool`)
