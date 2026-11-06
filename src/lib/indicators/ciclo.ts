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

export type Componente = {
  id: string
  nome: string
  valor: number | null
  texto: string
  /** 0 = zona de fundo histórico, 100 = zona de topo histórico. */
  nota: number | null
  fundo: string
  topo: string
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
    return [
      // MVRV-Z do bitcoin-data (cota de 15/dia); sem ele, o MVRV puro da Coin Metrics
      z != null || mvrv == null
        ? { id: 'mvrvz', nome: 'MVRV Z-Score', valor: z, texto: fmt(z), nota: escala(z, 0, 7), fundo: '< 0', topo: '> 7' }
        : { id: 'mvrvz', nome: 'MVRV (Coin Metrics)', valor: mvrv, texto: fmt(mvrv), nota: escala(mvrv, 0.9, 3.7), fundo: '< 1', topo: '> 3,7' },
      { id: 'nupl', nome: 'NUPL', valor: n, texto: fmt(n), nota: escala(n, 0, 0.75), fundo: '< 0', topo: '> 0,75' },
      { id: 'mayer', nome: 'Múltiplo de Mayer', valor: may, texto: fmt(may), nota: escala(may, 0.6, 2.4), fundo: '< 0,8', topo: '> 2,4' },
      { id: 'puell', nome: 'Múltiplo de Puell', valor: pu, texto: fmt(pu), nota: escala(pu, 0.5, 4, true), fundo: '< 0,5', topo: '> 4' },
      { id: 'pi', nome: 'Pi Cycle (111d ÷ 2×350d)', valor: pi, texto: fmt(pi), nota: escala(pi, 0.35, 1), fundo: '< 0,4', topo: '≥ 1 (cruzou)' },
      { id: 'w200', nome: 'Preço ÷ média de 200 semanas', valor: m200, texto: m200 ? `${fmt(m200)}×` : '—', nota: escala(m200, 1, 5, true), fundo: '< 1×', topo: '> 5×' },
      { id: 'lp', nome: 'Preço ÷ lei de potência', valor: lpr, texto: lpr ? `${fmt(lpr)}×` : '—', nota: escala(lpr, 0.42, 3, true), fundo: '< 0,5×', topo: '> 3×' },
      { id: 'rsiw', nome: 'RSI semanal (14)', valor: rw, texto: fmt(rw, 0), nota: escala(rw, 30, 90), fundo: '< 35', topo: '> 85' },
      { id: 'fng', nome: 'Medo & Ganância', valor: f, texto: fmt(f, 0), nota: f, fundo: '< 20', topo: '> 80' },
    ]
  }, [calc, mvrvZ.data, nupl.data, fng.data, snapshot.data, cm.data])

  const notas = componentes.map((c) => c.nota).filter((x): x is number => x != null)
  const termometro = notas.length >= 3 ? notas.reduce((a, b) => a + b, 0) / notas.length : null

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
