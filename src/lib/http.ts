// Cliente HTTP único do app. Todas as APIs são públicas e gratuitas, e quase
// todas têm limite de chamadas por minuto (CoinGecko, Jupiter, mempool). Por
// isso cada host tem sua fila: no máximo N pedidos ao mesmo tempo e um
// intervalo mínimo entre eles. Um 429 espera o Retry-After e tenta de novo,
// em vez de virar erro na tela.

type Regra = { simultaneos: number; intervaloMs: number }

const REGRAS: Record<string, Regra> = {
  'api.coingecko.com': { simultaneos: 1, intervaloMs: 2500 },
  'lite-api.jup.ag': { simultaneos: 1, intervaloMs: 1100 },
  'mempool.space': { simultaneos: 2, intervaloMs: 350 },
  'blockstream.info': { simultaneos: 2, intervaloMs: 350 },
  'eth.blockscout.com': { simultaneos: 2, intervaloMs: 400 },
  'api.ethplorer.io': { simultaneos: 1, intervaloMs: 2100 },
  'api.bitcoin-data.com': { simultaneos: 1, intervaloMs: 1500 },
  'bitcoin-data.com': { simultaneos: 1, intervaloMs: 1500 },
  'yields.llama.fi': { simultaneos: 3, intervaloMs: 120 },
  'mainnet.helius-rpc.com': { simultaneos: 3, intervaloMs: 120 },
  'api.bls.gov': { simultaneos: 1, intervaloMs: 600 },
  'api.bybit.com': { simultaneos: 2, intervaloMs: 200 },
  'community-api.coinmetrics.io': { simultaneos: 1, intervaloMs: 700 },
  'api.helius.xyz': { simultaneos: 2, intervaloMs: 250 },
}
const PADRAO: Regra = { simultaneos: 4, intervaloMs: 60 }

type Fila = { ativos: number; ultimo: number; espera: (() => void)[] }
const filas = new Map<string, Fila>()

function filaDe(host: string) {
  let f = filas.get(host)
  if (!f) {
    f = { ativos: 0, ultimo: 0, espera: [] }
    filas.set(host, f)
  }
  return f
}

async function vez(host: string) {
  const regra = REGRAS[host] ?? PADRAO
  const f = filaDe(host)
  if (f.ativos >= regra.simultaneos) {
    await new Promise<void>((ok) => f.espera.push(ok))
  }
  f.ativos++
  const falta = f.ultimo + regra.intervaloMs - Date.now()
  f.ultimo = Math.max(Date.now(), f.ultimo + regra.intervaloMs)
  if (falta > 0) await dormir(falta)
}

function liberar(host: string) {
  const f = filaDe(host)
  f.ativos--
  f.espera.shift()?.()
}

export const dormir = (ms: number) => new Promise((ok) => setTimeout(ok, ms))

export class ErroHttp extends Error {
  readonly status: number
  readonly host: string
  constructor(status: number, host: string, mensagem: string) {
    super(mensagem)
    this.status = status
    this.host = host
  }
}

type Opcoes = {
  metodo?: 'GET' | 'POST'
  corpo?: unknown
  cabecalhos?: Record<string, string>
  tentativas?: number
  timeoutMs?: number
  signal?: AbortSignal
  /** Devolve o corpo como texto (CSV) em vez de JSON. */
  texto?: boolean
}

export async function pedirJson<T>(url: string, op: Opcoes = {}): Promise<T> {
  const host = new URL(url).host
  const tentativas = op.tentativas ?? 3
  let ultimoErro: unknown
  for (let i = 0; i < tentativas; i++) {
    await vez(host)
    let liberado = false
    const soltar = () => {
      if (!liberado) {
        liberado = true
        liberar(host)
      }
    }
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), op.timeoutMs ?? 25_000)
      op.signal?.addEventListener('abort', () => ctrl.abort(), { once: true })
      let res: Response
      try {
        res = await fetch(url, {
          method: op.metodo ?? 'GET',
          headers: {
            Accept: op.texto ? 'text/csv, text/plain, */*' : 'application/json',
            ...(op.corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...op.cabecalhos,
          },
          body: op.corpo !== undefined ? JSON.stringify(op.corpo) : undefined,
          signal: ctrl.signal,
        })
      } finally {
        clearTimeout(timer)
      }
      if (res.ok) {
        const json = (op.texto ? await res.text() : await res.json()) as T
        soltar()
        return json
      }
      const texto = await res.text().catch(() => '')
      ultimoErro = new ErroHttp(res.status, host, mensagemDoStatus(res.status, host, texto))
      // 4xx que não é limite nem conflito: tentar de novo não muda a resposta.
      if (res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 408) {
        soltar()
        throw ultimoErro
      }
      const retryAfter = Number(res.headers.get('retry-after'))
      soltar()
      await dormir(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 800 * 2 ** i + Math.random() * 400)
    } catch (e) {
      soltar()
      if (e instanceof ErroHttp && e.status >= 400 && e.status < 500 && e.status !== 429 && e.status !== 408) throw e
      if (op.signal?.aborted) throw e
      // Sem resposta legível: rede caída ou limite de taxa sem CORS (mempool,
      // Binance). Nos dois casos, esperar mais antes de tentar de novo ajuda.
      ultimoErro = e instanceof ErroHttp ? e : new ErroHttp(0, host, `Sem resposta de ${host} (rede ou limite de chamadas).`)
      if (i < tentativas - 1) await dormir(1500 * 2 ** i)
    }
  }
  throw ultimoErro
}

function mensagemDoStatus(status: number, host: string, texto: string) {
  if (status === 429) return `${host} pediu para esperar (limite de chamadas grátis).`
  if (status === 401 || status === 403) return `${host} recusou o acesso (${status}). ${texto.slice(0, 120)}`
  if (status >= 500) return `${host} está instável agora (${status}).`
  return `${host} respondeu ${status}. ${texto.slice(0, 160)}`
}

/** JSON-RPC 2.0 (Solana, EVM). */
export async function rpc<T>(url: string, method: string, params: unknown[] = []): Promise<T> {
  const r = await pedirJson<{ result?: T; error?: { message: string; code: number } }>(url, {
    metodo: 'POST',
    corpo: { jsonrpc: '2.0', id: 1, method, params },
  })
  if (r.error) throw new ErroHttp(400, new URL(url).host, r.error.message)
  return r.result as T
}

/** Tenta cada URL na ordem até uma responder. */
export async function primeiroQueResponde<T>(fns: (() => Promise<T>)[]): Promise<T> {
  let erro: unknown
  for (const fn of fns) {
    try {
      return await fn()
    } catch (e) {
      erro = e
    }
  }
  throw erro
}

/** Executa tarefas com no máximo `n` simultâneas, preservando a ordem do resultado. */
export async function emLotes<A, B>(itens: A[], n: number, fn: (a: A, i: number) => Promise<B>): Promise<B[]> {
  const out = new Array<B>(itens.length)
  let prox = 0
  async function trabalhador() {
    while (prox < itens.length) {
      const i = prox++
      out[i] = await fn(itens[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, trabalhador))
  return out
}
