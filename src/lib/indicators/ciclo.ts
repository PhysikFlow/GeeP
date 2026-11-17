import { fixo } from '../format'
import { useMemo } from 'react'
import { useHistorico, type Serie } from '../precos'
import { drawdown, escala, leiDePotencia, razao, rsi, semanal, sma, ultimo, volatilidade } from './calc'
import { useAltura, useHashrateHistorico, useMedoGanancia, useMvrvCoinMetrics, useReceitaMineradores, useSerieOnchain, useSnapshotOnchain } from './fontes'

// Indicadores de ciclo do Bitcoin. Os de preço são calculados AQUI a partir da
// série diária completa (Mayer, Pi Cycle, média de 200 semanas, RSI, lei de
// potência); Puell e Hash Ribbons saem das séries de mineração do
// mempool.space; MVRV-Z,
// NUPL e preço realizado vêm prontos do bitcoin-data.com (grátis, com atraso
// de até 7 dias e 15 chamadas por dia).

/** Indicadores que medem a mesma coisa formam uma família; o termômetro faz a
 *  média DENTRO de cada família e depois ENTRE as famílias. Sem isso, os
 *  quatro "preço ÷ média longa" pesariam quase metade do resultado. */
export type Familia = 'custo' | 'tendencia' | 'mineracao' | 'momento'
export const FAMILIAS: Record<Familia, string> = {
  custo: 'Custo on-chain (o que o mercado pagou)',
  tendencia: 'Preço contra médias longas',
  mineracao: 'Mineração',
  momento: 'Momento e sentimento',
}

export type Componente = {
  id: string
  nome: string
  familia: Familia
  valor: number | null
  texto: string
  /** 0 = zona de fundo histórico, 100 = zona de topo histórico. */
  nota: number | null
  /** Nota se o BTC estivesse no preço p (o resto parado); null = não depende do preço. */
  notaEm?: (p: number) => number | null
  fundo: string
  topo: string
}

/** Média das famílias (cada família = média dos seus componentes com nota). */
export function termometroDe(cs: Componente[], p?: number) {
  const porFamilia = new Map<Familia, number[]>()
  for (const c of cs) {
    const n = p != null && c.notaEm ? c.notaEm(p) : c.nota
    if (n == null) continue
    porFamilia.set(c.familia, [...(porFamilia.get(c.familia) ?? []), n])
  }
  const medias = [...porFamilia.values()].map((ns) => ns.reduce((a, b) => a + b, 0) / ns.length)
  const total = cs.filter((c) => c.nota != null).length
  return total >= 3 && medias.length >= 2 ? medias.reduce((a, b) => a + b, 0) / medias.length : null
}

export const HALVING_BLOCOS = 210_000
const HALVING_2024 = Date.UTC(2024, 3, 20) / 1000

export function useCicloBtc() {
  const preco = useHistorico('BTC')
  const fng = useMedoGanancia()
  const miners = useReceitaMineradores()
  const hash = useHashrateHistorico()
  const mvrvZ = useSerieOnchain('mvrv-zscore', 'mvrvZscore')
  const nupl = useSerieOnchain('nupl', 'nupl')
  const realizado = useSerieOnchain('realized-price')
  const realizadoSth = useSerieOnchain('realized-price-sth')
  const etf = useSerieOnchain('etf-flow-btc')
  const snapshot = useSnapshotOnchain()
  const altura = useAltura()
  const cm = useMvrvCoinMetrics()

  const calc = useMemo(() => {
    const p = preco.data
    if (!p?.length) return null
    const s200 = sma(p, 200)
    const mayer = razao(p, s200)
    const s200w = sma(p, 1400)
    const pi111 = sma(p, 111)
    const pi350x2: Serie = sma(p, 350).map(([t, v]) => [t, v * 2])
    const piRazao = razao(pi111, pi350x2)
    const rsiD = rsi(p.slice(-800), 14)
    const rsiS = rsi(semanal(p), 14)
    const dd = drawdown(p)
    const lp: Serie = p.map(([t]) => [t, leiDePotencia(t)])
    const lpRazao = razao(p, lp)
    const m = miners.data
    const puell = m?.length ? razao(m, sma(m, 365)) : []
    const h = hash.data
    const h30 = h?.length ? sma(h, 30) : []
    const h60 = h?.length ? sma(h, 60) : []
    const ribbons = razao(h30, h60)
    const vol = volatilidade(p, 30)
    const atual = ultimo(p)!
    const ath = Math.max(...p.map((x) => x[1]))
    return { p, s200, mayer, s200w, pi111, pi350x2, piRazao, rsiD, rsiS, dd, lp, lpRazao, puell, h30, h60, ribbons, vol, atual, ath }
  }, [preco.data, miners.data, hash.data])

  const componentes = useMemo<Componente[]>(() => {
    if (!calc) return []
    const z = ultimo(mvrvZ.data) ?? snapshot.data?.mvrvZscore ?? null
    const mvrv = ultimo(cm.data?.mvrv)
    // NUPL = 1 − 1/MVRV: dá para tirar do MVRV grátis quando o bitcoin-data falta
    const n = ultimo(nupl.data) ?? (mvrv ? 1 - 1 / mvrv : null)
    const may = ultimo(calc.mayer)
    const pu = ultimo(calc.puell) ?? snapshot.data?.puellMultiple ?? null
    const pi = ultimo(calc.piRazao)
    const f = ultimo(fng.data?.serie)
    const rw = ultimo(calc.rsiS)
    const w200 = ultimo(calc.s200w)
    const m200 = w200 ? calc.atual / w200 : null
    const lpr = ultimo(calc.lpRazao)
    const fmt = (v: number | null, c = 2) => (v == null ? '—' : fixo(v, c))
    // Como cada indicador muda se SÓ o preço mudar (k = p ÷ preço de hoje).
    // RSI, Pi Cycle e Medo & Ganância ficam parados: na prática caem junto com
    // o preço, então o gatilho real tende a vir um pouco ANTES do calculado.
    const p0 = calc.atual
    const proporcional = (v: number | null, f: (x: number | null) => number | null) => (v == null ? undefined : (p: number) => f((v * p) / p0))
    // MVRV-Z no preço p: z·(k·M − 1)/(M − 1), com M = MVRV de hoje
    const zEm = z != null && mvrv != null && Math.abs(mvrv - 1) > 0.02 ? (p: number) => escala((z * ((p / p0) * mvrv - 1)) / (mvrv - 1), 0, 7) : undefined
    const nuplEm = mvrv != null ? (p: number) => escala(1 - 1 / ((mvrv * p) / p0), 0, 0.75) : undefined
    return [
      // MVRV-Z do bitcoin-data (cota de 15/dia); sem ele, o MVRV puro da Coin Metrics
      z != null || mvrv == null
        ? { id: 'mvrvz', nome: 'MVRV Z-Score', familia: 'custo', valor: z, texto: fmt(z), nota: escala(z, 0, 7), notaEm: zEm, fundo: '< 0', topo: '> 7' }
        : { id: 'mvrvz', nome: 'MVRV (Coin Metrics)', familia: 'custo', valor: mvrv, texto: fmt(mvrv), nota: escala(mvrv, 0.9, 3.7), notaEm: proporcional(mvrv, (x) => escala(x, 0.9, 3.7)), fundo: '< 1', topo: '> 3,7' },
      { id: 'nupl', nome: 'NUPL', familia: 'custo', valor: n, texto: fmt(n), nota: escala(n, 0, 0.75), notaEm: nuplEm, fundo: '< 0', topo: '> 0,75' },
      { id: 'mayer', nome: 'Múltiplo de Mayer', familia: 'tendencia', valor: may, texto: fmt(may), nota: escala(may, 0.6, 2.4), notaEm: proporcional(may, (x) => escala(x, 0.6, 2.4)), fundo: '< 0,8', topo: '> 2,4' },
      { id: 'puell', nome: 'Múltiplo de Puell', familia: 'mineracao', valor: pu, texto: fmt(pu), nota: escala(pu, 0.5, 4, true), notaEm: proporcional(pu, (x) => escala(x, 0.5, 4, true)), fundo: '< 0,5', topo: '> 4' },
      { id: 'pi', nome: 'Pi Cycle (111d ÷ 2×350d)', familia: 'tendencia', valor: pi, texto: fmt(pi), nota: escala(pi, 0.35, 1), fundo: '< 0,4', topo: '≥ 1 (cruzou)' },
      { id: 'w200', nome: 'Preço ÷ média de 200 semanas', familia: 'tendencia', valor: m200, texto: m200 ? `${fmt(m200)}×` : '—', nota: escala(m200, 1, 5, true), notaEm: proporcional(m200, (x) => escala(x, 1, 5, true)), fundo: '< 1×', topo: '> 5×' },
      { id: 'lp', nome: 'Preço ÷ lei de potência', familia: 'tendencia', valor: lpr, texto: lpr ? `${fmt(lpr)}×` : '—', nota: escala(lpr, 0.42, 3, true), notaEm: proporcional(lpr, (x) => escala(x, 0.42, 3, true)), fundo: '< 0,5×', topo: '> 3×' },
      { id: 'rsiw', nome: 'RSI semanal (14)', familia: 'momento', valor: rw, texto: fmt(rw, 0), nota: escala(rw, 30, 90), fundo: '< 35', topo: '> 85' },
      { id: 'fng', nome: 'Medo & Ganância', familia: 'momento', valor: f, texto: fmt(f, 0), nota: f, fundo: '< 20', topo: '> 80' },
    ] satisfies Componente[]
  }, [calc, mvrvZ.data, nupl.data, fng.data, snapshot.data, cm.data])

  const termometro = termometroDe(componentes)

  const halving = useMemo(() => {
    const h = altura.data
    if (!h) return null
    const proximo = Math.ceil((h + 1) / HALVING_BLOCOS) * HALVING_BLOCOS
    const faltam = proximo - h
    const agora = Date.now() / 1000
    const data = agora + faltam * 600
    const desdeUltimo = (agora - HALVING_2024) / 86400
    const progresso = 1 - faltam / HALVING_BLOCOS
    return { altura: h, proximo, faltam, data, desdeUltimo, progresso, recompensa: 50 / 2 ** Math.floor(h / HALVING_BLOCOS) }
  }, [altura.data])

  return {
    carregando: preco.isLoading,
    erro: preco.error as Error | null,
    calc,
    componentes,
    termometro,
    halving,
    onchain: { mvrvZ, nupl, realizado, realizadoSth, etf, snapshot, cm },
    fng,
  }
}

export function faixaDoTermometro(v: number | null) {
  if (v == null) return { rotulo: 'Sem dados', tom: 'neutro' as const }
  if (v < 20) return { rotulo: 'Zona de acumulação histórica', tom: 'ok' as const }
  if (v < 40) return { rotulo: 'Abaixo da média do ciclo', tom: 'ok' as const }
  if (v < 60) return { rotulo: 'Meio de ciclo', tom: 'neutro' as const }
  if (v < 80) return { rotulo: 'Aquecido', tom: 'aviso' as const }
  return { rotulo: 'Zona de euforia histórica', tom: 'perigo' as const }
}
