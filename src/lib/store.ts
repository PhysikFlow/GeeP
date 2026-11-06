import { useSyncExternalStore } from 'react'
import { get, set } from 'idb-keyval'
import type { Moeda } from './format'

// Estado do usuário: carteiras e ajustes. Fica no localStorage do aparelho,
// com cópia no IndexedDB — não há conta nem servidor. A cópia existe porque o
// Safari e as limpezas de espaço às vezes apagam só o localStorage; ao abrir
// sem nada nele, o app restaura da cópia. Para levar para outro aparelho
// existe exportar/importar (JSON) nos Ajustes.

export type Rede = 'btc' | 'eth' | 'sol'
export type Nativo = 'BTC' | 'ETH' | 'SOL'

export const NATIVO_DA_REDE: Record<Rede, Nativo> = { btc: 'BTC', eth: 'ETH', sol: 'SOL' }
export const NOME_DA_REDE: Record<Rede, string> = { btc: 'Bitcoin', eth: 'Ethereum', sol: 'Solana' }

export type Carteira = {
  id: string
  rede: Rede
  /** Endereço público, ou chave estendida (xpub/ypub/zpub) no Bitcoin. */
  endereco: string
  tipo: 'endereco' | 'xpub'
  nome: string
  ens?: string
  criadaEm: number
}

export type Ajustes = {
  moeda: Moeda
  /** Chave grátis da Helius: liga o histórico e o staking nativo da Solana. */
  heliusKey: string
  /** Esconde os valores (para abrir o app em público). */
  ocultarValores: boolean
  /** Preço médio informado à mão, em USD, por ativo. Vence o estimado. */
  precoMedioManual: Partial<Record<string, number>>
}

/** Etapas 3 a 5 do método para um token: dossiê, bear case e nota de 0 a 100. */
export type Dossie = {
  /** id da CoinGecko */
  id: string
  simbolo: string
  nome: string
  notas: { adocao: number; tokenomics: number; competitiva: number; valuation: number; narrativa: number; macro: number }
  textos: Partial<Record<'produto' | 'adocao' | 'tokenomics' | 'concorrencia' | 'valuation' | 'riscos' | 'bear' | 'resposta' | 'invalidacao' | 'excecao', string>>
  alertas: Partial<Record<'fraude' | 'seguranca' | 'processo' | 'diluicao' | 'saida', boolean>>
  atualizadoEm: number
}

type Estado = { carteiras: Carteira[]; ajustes: Ajustes; dossies: Record<string, Dossie> }

const CHAVE = 'geep.estado.v1'

const AJUSTES_PADRAO: Ajustes = {
  moeda: 'BRL',
  heliusKey: '',
  ocultarValores: false,
  precoMedioManual: {},
}

function ler(): Estado {
  try {
    const bruto = localStorage.getItem(CHAVE)
    if (bruto) {
      const e = JSON.parse(bruto) as Partial<Estado>
      return {
        carteiras: Array.isArray(e.carteiras) ? e.carteiras : [],
        ajustes: { ...AJUSTES_PADRAO, ...e.ajustes },
        dossies: e.dossies && typeof e.dossies === 'object' ? e.dossies : {},
      }
    }
  } catch {
    // armazenamento bloqueado ou corrompido: começa vazio
  }
  return { carteiras: [], ajustes: AJUSTES_PADRAO, dossies: {} }
}

let estado = ler()
const ouvintes = new Set<() => void>()

function gravar(novo: Estado) {
  estado = novo
  try {
    localStorage.setItem(CHAVE, JSON.stringify(novo))
  } catch {
    // sem armazenamento (aba anônima): vale só nesta sessão
  }
  void set(CHAVE, novo).catch(() => undefined)
  ouvintes.forEach((f) => f())
}

// localStorage vazio mas cópia no IndexedDB: restaura (e regrava nos dois).
if (estado.carteiras.length === 0 && Object.keys(estado.dossies).length === 0) {
  void get<Estado>(CHAVE)
    .then((copia) => {
      const tem = (copia?.carteiras?.length ?? 0) > 0 || Object.keys(copia?.dossies ?? {}).length > 0
      if (tem && estado.carteiras.length === 0 && Object.keys(estado.dossies).length === 0) {
        gravar({ carteiras: copia!.carteiras ?? [], ajustes: { ...AJUSTES_PADRAO, ...copia!.ajustes }, dossies: copia!.dossies ?? {} })
      }
    })
    .catch(() => undefined)
} else {
  // garante a cópia para quem já tinha carteiras antes dela existir
  void set(CHAVE, estado).catch(() => undefined)
}

// Outra aba do app mudou o estado: acompanha.
window.addEventListener('storage', (e) => {
  if (e.key === CHAVE) {
    estado = ler()
    ouvintes.forEach((f) => f())
  }
})

function assinar(f: () => void) {
  ouvintes.add(f)
  return () => ouvintes.delete(f)
}

export function useEstado() {
  return useSyncExternalStore(assinar, () => estado)
}
export const useCarteiras = () => useEstado().carteiras
export const useAjustes = () => useEstado().ajustes
export const useDossies = () => useEstado().dossies

export function salvarDossie(d: Dossie) {
  gravar({ ...estado, dossies: { ...estado.dossies, [d.id]: { ...d, atualizadoEm: Date.now() } } })
}

export function removerDossie(id: string) {
  const { [id]: _fora, ...resto } = estado.dossies
  gravar({ ...estado, dossies: resto })
}

export function adicionarCarteira(c: Omit<Carteira, 'id' | 'criadaEm'>) {
  const nova: Carteira = { ...c, id: crypto.randomUUID(), criadaEm: Date.now() }
  gravar({ ...estado, carteiras: [...estado.carteiras, nova] })
  return nova
}

export function editarCarteira(id: string, mudanca: Partial<Pick<Carteira, 'nome'>>) {
  gravar({ ...estado, carteiras: estado.carteiras.map((c) => (c.id === id ? { ...c, ...mudanca } : c)) })
}

export function removerCarteira(id: string) {
  gravar({ ...estado, carteiras: estado.carteiras.filter((c) => c.id !== id) })
}

export function moverCarteira(id: string, dir: -1 | 1) {
  const lista = [...estado.carteiras]
  const i = lista.findIndex((c) => c.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= lista.length) return
  ;[lista[i], lista[j]] = [lista[j], lista[i]]
  gravar({ ...estado, carteiras: lista })
}

export function mudarAjustes(m: Partial<Ajustes>) {
  gravar({ ...estado, ajustes: { ...estado.ajustes, ...m } })
}

export function definirPrecoMedio(ativo: string, usd: number | null) {
  const p = { ...estado.ajustes.precoMedioManual }
  if (usd == null || !Number.isFinite(usd) || usd <= 0) delete p[ativo]
  else p[ativo] = usd
  mudarAjustes({ precoMedioManual: p })
}

export function exportarEstado() {
  // As chaves de API não saem no arquivo: ele pode ser compartilhado.
  const { heliusKey: _h, ...resto } = estado.ajustes
  return JSON.stringify({ app: 'geep', versao: 1, carteiras: estado.carteiras, ajustes: resto, dossies: estado.dossies }, null, 2)
}

export function importarEstado(json: string) {
  const e = JSON.parse(json) as { app?: string; carteiras?: Carteira[]; ajustes?: Partial<Ajustes>; dossies?: Record<string, Dossie> }
  if (e.app !== 'geep' || !Array.isArray(e.carteiras)) throw new Error('Arquivo não é um backup do GeeP.')
  const existentes = new Set(estado.carteiras.map((c) => `${c.rede}:${c.endereco}`))
  const novas = e.carteiras
    .filter((c) => c && typeof c.endereco === 'string' && ['btc', 'eth', 'sol'].includes(c.rede))
    .filter((c) => !existentes.has(`${c.rede}:${c.endereco}`))
    .map((c) => ({ ...c, id: crypto.randomUUID() }))
  gravar({
    carteiras: [...estado.carteiras, ...novas],
    ajustes: { ...estado.ajustes, ...e.ajustes, heliusKey: estado.ajustes.heliusKey },
    // dossiês do arquivo só entram se não houver um mais novo aqui
    dossies: Object.fromEntries(
      Object.entries({ ...(e.dossies ?? {}), ...estado.dossies }).map(([id, d]) => {
        const deFora = e.dossies?.[id]
        return [id, deFora && deFora.atualizadoEm > (estado.dossies[id]?.atualizadoEm ?? 0) ? deFora : d]
      }),
    ),
  })
  return novas.length
}
