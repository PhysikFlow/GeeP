import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { carregarBtc } from './chains/btc'
import { carregarEth } from './chains/eth'
import { carregarSol } from './chains/sol'
import type { DadosCarteira, Movimento } from './chains/tipos'
import { custoMedio, juntarPorTx, saldoDiario, somarSeries, type ResultadoCusto } from './custo'
import { cambioEm, useCambio, useHistorico, useMercado, valorEm, type Serie } from './precos'
import { MIN } from './query'
import { NATIVO_DA_REDE, useAjustes, useCarteiras, type Carteira, type Nativo, type Rede } from './store'

export function carregar(c: Carteira, heliusKey: string): Promise<DadosCarteira> {
  if (c.rede === 'btc') return carregarBtc(c)
  if (c.rede === 'eth') return carregarEth(c)
  return carregarSol(c, heliusKey)
}

function opcoes(c: Carteira, heliusKey: string) {
  return {
    queryKey: ['carteira', c.id, c.endereco, c.rede === 'sol' && heliusKey ? 'helius' : '-'],
    queryFn: () => carregar(c, heliusKey),
    staleTime: 3 * MIN,
    refetchInterval: 6 * MIN,
  }
}

export function useDadosCarteira(c: Carteira | null) {
  const { heliusKey } = useAjustes()
  return useQuery({ ...opcoes(c ?? ({} as Carteira), heliusKey), enabled: !!c })
}

export type CustoDaPosicao = Partial<ResultadoCusto> & {
  precoMedioUsd: number | null
  precoMedioBrl: number | null
  manual: boolean
  /** Carteiras com histórico / total de carteiras do ativo. */
  cobertura: [number, number]
  parcial: boolean
}

export type Posicao = {
  chave: string
  simbolo: string
  nome: string
  rede: Rede
  nativo?: Nativo
  icone?: string
  qtd: number
  pendente: number
  precoUsd: number | null
  valorUsd: number | null
  var24h: number | null
  confiavel: boolean
  carteiras: string[]
  custo?: CustoDaPosicao
}

export const COR_DO_ATIVO: Record<string, string> = {
  BTC: 'var(--c-btc)',
  ETH: 'var(--c-eth)',
  SOL: 'var(--c-sol)',
  Stables: 'var(--c-stable)',
  Outros: 'var(--c-outros)',
}

const STABLES = new Set(['USDC', 'USDT', 'DAI', 'USDS', 'PYUSD', 'FDUSD', 'USDE', 'TUSD', 'USDP', 'GHO', 'FRAX', 'LUSD', 'CRVUSD', 'USD1', 'USDG', 'BRZ', 'BRLA'])
export const ehStable = (s: string) => STABLES.has(s.toUpperCase())

/** Grupo de alocação: BTC/ETH/SOL agrupam os derivados (WBTC, stETH, JitoSOL…). */
export function grupoDe(p: Posicao): string {
  if (p.nativo) return p.nativo
  const s = p.simbolo.toUpperCase()
  if (ehStable(s)) return 'Stables'
  if (/BTC/.test(s)) return 'BTC'
  if (/ETH/.test(s)) return 'ETH'
  if (/SOL(?!V)/.test(s)) return 'SOL'
  return 'Outros'
}

export function usePortfolio() {
  const carteiras = useCarteiras()
  const { heliusKey, precoMedioManual } = useAjustes()
  const consultas = useQueries({ queries: carteiras.map((c) => opcoes(c, heliusKey)) })
  const mercado = useMercado()
  const cambio = useCambio()

  const temHist = (n: Nativo) =>
    carteiras.some((c, i) => NATIVO_DA_REDE[c.rede] === n && (consultas[i]?.data?.movimentos?.length ?? 0) > 0)
  // BTC e ETH também servem de benchmark: baixam se QUALQUER carteira tem histórico.
  const algumHist = temHist('BTC') || temHist('ETH') || temHist('SOL')
  const hBtc = useHistorico('BTC', algumHist)
  const hEth = useHistorico('ETH', algumHist)
  const hSol = useHistorico('SOL', temHist('SOL'))
  const hFx = useHistorico('USDBRL', carteiras.length > 0)

  const dados = consultas.map((q) => q.data)
  const chaveDados = consultas.map((q) => q.dataUpdatedAt).join(',')

  const calculo = useMemo(() => {
    const historicos: Record<Nativo, Serie | undefined> = { BTC: hBtc.data, ETH: hEth.data, SOL: hSol.data }
    const fx = hFx.data ?? []
    const fxAtual = cambio.data ?? 5
    const posicoes = new Map<string, Posicao>()
    const movsPorNativo: Record<Nativo, { movs: Movimento[]; saldo: number }[]> = { BTC: [], ETH: [], SOL: [] }
    const totalCarteirasPorNativo: Record<Nativo, number> = { BTC: 0, ETH: 0, SOL: 0 }

    carteiras.forEach((c, i) => {
      const d = dados[i]
      if (!d) return
      const n = d.nativo
      totalCarteirasPorNativo[n]++
      const m = mercado.data?.[n]
      const p = posicoes.get(n) ?? {
        chave: n,
        simbolo: n,
        nome: m?.nome ?? n,
        rede: c.rede,
        nativo: n,
        icone: m?.icone,
        qtd: 0,
        pendente: 0,
        precoUsd: m?.preco ?? null,
        valorUsd: null,
        var24h: m?.var24h ?? null,
        confiavel: true,
        carteiras: [],
      }
      p.qtd += d.saldo
      p.pendente += d.pendente
      p.carteiras.push(c.id)
      posicoes.set(n, p)
      if (d.movimentos) movsPorNativo[n].push({ movs: d.movimentos, saldo: d.saldo })

      for (const t of d.tokens) {
        const chave = `${c.rede}:${t.id}`
        const pt = posicoes.get(chave) ?? {
          chave,
          simbolo: t.simbolo,
          nome: t.nome,
          rede: c.rede,
          icone: t.icone,
          qtd: 0,
          pendente: 0,
          precoUsd: t.precoUsd,
          valorUsd: null,
          var24h: t.variacao24h ?? null,
          confiavel: t.confiavel,
          carteiras: [],
        }
        pt.qtd += t.qtd
        pt.carteiras.push(c.id)
        posicoes.set(chave, pt)
      }
    })

    for (const p of posicoes.values()) p.valorUsd = p.precoUsd != null ? p.qtd * p.precoUsd : null

    // preço médio dos nativos
    for (const n of ['BTC', 'ETH', 'SOL'] as Nativo[]) {
      const p = posicoes.get(n)
      if (!p) continue
      const manual = precoMedioManual[n]
      const lista = movsPorNativo[n]
      const serie = historicos[n]
      const cobertura: [number, number] = [lista.length, totalCarteirasPorNativo[n]]
      let r: ResultadoCusto | null = null
      if (lista.length && serie?.length) {
        const saldoComHist = lista.reduce((s, l) => s + l.saldo, 0)
        r = custoMedio(juntarPorTx(lista.map((l) => l.movs)), saldoComHist, serie, fx, fxAtual)
      }
      p.custo = {
        ...(r ?? {}),
        precoMedioUsd: manual ?? r?.precoMedioUsd ?? null,
        precoMedioBrl: manual != null ? manual * fxAtual : (r?.precoMedioBrl ?? null),
        manual: manual != null,
        cobertura,
        parcial: cobertura[0] < cobertura[1],
      }
    }

    // evolução do patrimônio (só nativos com histórico)
    const seriesValor: Serie[] = []
    const seriesPorAtivo: Partial<Record<Nativo, Serie>> = {}
    let inicio = Infinity
    for (const n of ['BTC', 'ETH', 'SOL'] as Nativo[]) for (const l of movsPorNativo[n]) if (l.movs[0]) inicio = Math.min(inicio, l.movs[0].t)
    if (Number.isFinite(inicio)) {
      for (const n of ['BTC', 'ETH', 'SOL'] as Nativo[]) {
        const serie = historicos[n]
        if (!serie || movsPorNativo[n].length === 0) continue
        const qtdDia = somarSeries(movsPorNativo[n].map((l) => saldoDiario(l.movs, l.saldo, inicio)))
        const valor: Serie = qtdDia.map(([d, q]) => [d, q * (valorEm(serie, d) ?? 0)])
        // o último ponto usa o preço de agora, para fechar com o total da tela
        const agora = posicoes.get(n)?.precoUsd
        if (agora && valor.length) valor[valor.length - 1] = [valor[valor.length - 1][0], qtdDia[qtdDia.length - 1][1] * agora]
        seriesPorAtivo[n] = valor
        seriesValor.push(valor)
      }
    }
    const evolucaoUsd = seriesValor.length ? somarSeries(seriesValor) : []
    const benchmarks = calcularBenchmarks(movsPorNativo, historicos, {
      BTC: mercado.data?.BTC.preco,
      ETH: mercado.data?.ETH.preco,
      SOL: mercado.data?.SOL.preco,
    })
    const paraBrl = (s: Serie): Serie => s.map(([d, v]) => [d, v * cambioEm(fx, d, fxAtual)])
    const evolucaoBrl = paraBrl(evolucaoUsd)
    const seriesPorAtivoBrl: Partial<Record<Nativo, Serie>> = {}
    for (const [n, s] of Object.entries(seriesPorAtivo) as [Nativo, Serie][]) seriesPorAtivoBrl[n] = paraBrl(s)

    const lista = [...posicoes.values()].sort((a, b) => (b.valorUsd ?? -1) - (a.valorUsd ?? -1))
    const visiveis = lista.filter((p) => p.nativo || (p.confiavel && (p.valorUsd ?? 0) >= 0.5))
    const ocultos = lista.filter((p) => !visiveis.includes(p))
    const totalUsd = visiveis.reduce((s, p) => s + (p.valorUsd ?? 0), 0)
    const delta24 = visiveis.reduce((s, p) => {
      if (p.valorUsd == null || p.var24h == null) return s
      return s + p.valorUsd - p.valorUsd / (1 + p.var24h / 100)
    }, 0)

    const alocacao = new Map<string, number>()
    for (const p of visiveis) alocacao.set(grupoDe(p), (alocacao.get(grupoDe(p)) ?? 0) + (p.valorUsd ?? 0))

    const custoTotalUsd = ['BTC', 'ETH', 'SOL']
      .map((n) => posicoes.get(n))
      .reduce((s, p) => s + (p?.custo?.precoMedioUsd != null ? p.custo.precoMedioUsd * p.qtd : 0), 0)
    const valorComCusto = ['BTC', 'ETH', 'SOL']
      .map((n) => posicoes.get(n))
      .reduce((s, p) => s + (p?.custo?.precoMedioUsd != null && p.valorUsd != null ? p.valorUsd : 0), 0)

    return {
      benchmarks,
      fx,
      fxAtual,
      historicos,
      posicoes: visiveis,
      ocultos,
      totalUsd,
      delta24Usd: delta24,
      alocacao: [...alocacao.entries()].sort((a, b) => b[1] - a[1]),
      evolucaoUsd,
      evolucaoBrl,
      seriesPorAtivo,
      seriesPorAtivoBrl,
      custoTotalUsd,
      valorComCusto,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDados, carteiras, mercado.data, cambio.data, hBtc.data, hEth.data, hSol.data, hFx.data, precoMedioManual])

  const carregando = consultas.some((q) => q.isLoading)
  const atualizando = consultas.some((q) => q.isFetching) || mercado.isFetching
  const erros = consultas.map((q, i) => (q.error ? { carteira: carteiras[i], erro: q.error as Error } : null)).filter(Boolean) as {
    carteira: Carteira
    erro: Error
  }[]
  const historicoCarregando = [hBtc, hEth, hSol].some((h) => h.isLoading && h.fetchStatus !== 'idle')

  return { ...calculo, carteiras, consultas, carregando, atualizando, erros, historicoCarregando, mercado }
}

export type Benchmarks = {
  /** Dinheiro líquido que entrou (entradas − saídas), em USD do dia de cada movimentação. */
  investido: number
  /** Valor de hoje das moedas nativas com histórico. */
  carteira: number
  soBtc: number
  metade: number
  desde: number
}

/**
 * "E se o mesmo dinheiro tivesse ido para só BTC, ou 50% BTC / 50% ETH?"
 * Cada entrada (em USD do dia) compra o benchmark naquele dia; cada saída
 * vende o equivalente. Assim a comparação respeita QUANDO o dinheiro entrou.
 */
function calcularBenchmarks(
  movsPorNativo: Record<Nativo, { movs: Movimento[]; saldo: number }[]>,
  historicos: Record<Nativo, Serie | undefined>,
  agora: Record<Nativo, number | undefined>,
): Benchmarks | null {
  const btc = historicos.BTC
  const eth = historicos.ETH
  if (!btc?.length || !eth?.length || !agora.BTC || !agora.ETH) return null
  const fluxos: { t: number; usd: number }[] = []
  let carteira = 0
  for (const n of ['BTC', 'ETH', 'SOL'] as Nativo[]) {
    const lista = movsPorNativo[n]
    const serie = historicos[n]
    if (!lista.length || !serie?.length || !agora[n]) continue
    const movs = juntarPorTx(lista.map((l) => l.movs))
    const saldo = lista.reduce((s, l) => s + l.saldo, 0)
    carteira += saldo * agora[n]!
    if (!movs.length) continue
    // saldo de antes do histórico baixado entra como aporte na primeira data vista
    const inicial = Math.max(0, saldo - movs.reduce((s, m) => s + m.delta, 0))
    const p0 = valorEm(serie, movs[0].t)
    if (inicial > 0 && p0) fluxos.push({ t: movs[0].t, usd: inicial * p0 })
    for (const m of movs) {
      const p = valorEm(serie, m.t)
      if (p) fluxos.push({ t: m.t, usd: m.delta * p })
    }
  }
  if (!fluxos.length) return null
  fluxos.sort((a, b) => a.t - b.t)
  let qBtc = 0
  let qB = 0
  let qE = 0
  let investido = 0
  for (const f of fluxos) {
    const pb = valorEm(btc, f.t)
    const pe = valorEm(eth, f.t) ?? null
    if (!pb) continue
    investido += f.usd
    qBtc = Math.max(0, qBtc + f.usd / pb)
    // ETH só existe desde 2015: antes disso a metade "ETH" fica em BTC
    if (pe) {
      qB = Math.max(0, qB + f.usd / 2 / pb)
      qE = Math.max(0, qE + f.usd / 2 / pe)
    } else {
      qB = Math.max(0, qB + f.usd / pb)
    }
  }
  return {
    investido,
    carteira,
    soBtc: qBtc * agora.BTC,
    metade: qB * agora.BTC + qE * agora.ETH,
    desde: fluxos[0].t,
  }
}
