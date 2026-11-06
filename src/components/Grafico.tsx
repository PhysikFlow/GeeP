import { useEffect, useRef, useState } from 'react'
import {
  AreaSeries,
  BaselineSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type UTCTimestamp,
} from 'lightweight-charts'
import { COR } from '../lib/cores'
import { compacto } from '../lib/format'
import type { Serie } from '../lib/precos'
import { Protecao } from './Protecao'

// Um gráfico de série temporal só, para o app inteiro (lightweight-charts).
// Regras: um eixo por painel (unidades diferentes vão em painéis separados,
// nunca em dois eixos), legenda sempre visível no canto com o valor sob o
// cursor, roda do mouse NÃO dá zoom (senão sequestra a rolagem da página) e
// arrastar na vertical no celular rola a página.

export type SerieG = {
  nome: string
  dados: Serie
  cor: string
  tipo?: 'linha' | 'area' | 'barras' | 'base'
  largura?: 1 | 2 | 3
  tracejado?: boolean
  painel?: number
  /** Linha de base: para 'base' (acima/abaixo) e cor das barras negativas. */
  base?: number
  corNegativa?: string
  formato?: (v: number) => string
}

export type LinhaRef = { valor: number; cor: string; rotulo: string; painel?: number }

type Props = {
  series: SerieG[]
  altura?: number
  log?: boolean
  linhas?: LinhaRef[]
  /** Altura de cada painel além do primeiro. */
  paineis?: number[]
  /** Começo da janela visível (unix s). Sem isso, mostra tudo. */
  desde?: number
  formato?: (v: number) => string
  formatoData?: (t: number) => string
  vazio?: string
}

// O lightweight-charts recusa (com exceção) valores acima de ~9e13.
const LIMITE = 9e13

function limpar(s: Serie) {
  const out: { time: UTCTimestamp; value: number }[] = []
  let ult = -Infinity
  for (const [t, v] of s) {
    if (!Number.isFinite(v) || !Number.isFinite(t) || Math.abs(v) > LIMITE) continue
    if (t <= ult) {
      if (t === ult) out[out.length - 1] = { time: t as UTCTimestamp, value: v }
      continue
    }
    out.push({ time: t as UTCTimestamp, value: v })
    ult = t
  }
  return out
}

const dataPadrao = (t: number) => new Date(t * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })

export function Grafico(props: Props) {
  return (
    <Protecao compacto>
      <GraficoInterno {...props} />
    </Protecao>
  )
}

function GraficoInterno({ series, altura = 260, log, linhas, paineis, desde, formato = compacto, formatoData = dataPadrao, vazio }: Props) {
  const caixa = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ t: number | null; valores: (number | null)[] } | null>(null)
  const temDados = series.some((s) => s.dados.length > 0)
  const chaveDados = series.map((s) => `${s.nome}:${s.dados.length}:${s.dados[s.dados.length - 1]?.[1] ?? ''}`).join('|')

  useEffect(() => {
    const el = caixa.current
    if (!el || !temDados) return
    const alturaTotal = altura + (paineis ?? []).reduce((a, b) => a + b, 0)
    const chart: IChartApi = createChart(el, {
      autoSize: true,
      height: alturaTotal,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: COR.muted2,
        fontSize: 11,
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        panes: { separatorColor: COR.eixo, separatorHoverColor: COR.eixo },
      },
      grid: { vertLines: { visible: false }, horzLines: { color: COR.grade } },
      rightPriceScale: { borderColor: COR.eixo, scaleMargins: { top: 0.18, bottom: 0.06 } },
      timeScale: { borderColor: COR.eixo, timeVisible: false, rightOffset: 2, minBarSpacing: 0.05 },
      crosshair: {
        vertLine: { color: COR.muted2, width: 1, style: LineStyle.Solid, labelBackgroundColor: '#232833' },
        horzLine: { color: COR.muted2, width: 1, style: LineStyle.Dotted, labelBackgroundColor: '#232833' },
      },
      // Sem priceFormatter global: ele venceria o formato de cada série, e o
      // painel de TVL sairia com o "%" do painel de APY.
      localization: { locale: 'pt-BR', timeFormatter: (t: number) => formatoData(t) },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true },
    })

    const apis: ISeriesApi<SeriesType>[] = []
    const primeiraDoPainel = new Map<number, ISeriesApi<SeriesType>>()
    for (const s of series) {
      const painel = s.painel ?? 0
      const fmt = { type: 'custom' as const, formatter: s.formato ?? formato, minMove: 1e-8 }
      const comum = { priceFormat: fmt, lastValueVisible: true, priceLineVisible: false, title: '' }
      const dados = limpar(s.dados)
      let api: ISeriesApi<SeriesType>
      if (s.tipo === 'area') {
        api = chart.addSeries(
          AreaSeries,
          { ...comum, lineColor: s.cor, lineWidth: s.largura ?? 2, topColor: `${s.cor}55`, bottomColor: `${s.cor}05` },
          painel,
        )
        api.setData(dados)
      } else if (s.tipo === 'barras') {
        const neg = s.corNegativa ?? COR.critico
        const base = s.base ?? 0
        api = chart.addSeries(HistogramSeries, { ...comum, color: s.cor, base }, painel)
        api.setData(dados.map((d) => ({ ...d, color: d.value >= base ? s.cor : neg })))
      } else if (s.tipo === 'base') {
        const base = s.base ?? 0
        api = chart.addSeries(
          BaselineSeries,
          {
            ...comum,
            baseValue: { type: 'price', price: base },
            topLineColor: s.cor,
            topFillColor1: `${s.cor}40`,
            topFillColor2: `${s.cor}05`,
            bottomLineColor: s.corNegativa ?? COR.critico,
            bottomFillColor1: `${s.corNegativa ?? COR.critico}05`,
            bottomFillColor2: `${s.corNegativa ?? COR.critico}40`,
            lineWidth: s.largura ?? 2,
          },
          painel,
        )
        api.setData(dados)
      } else {
        api = chart.addSeries(
          LineSeries,
          { ...comum, color: s.cor, lineWidth: s.largura ?? 2, lineStyle: s.tracejado ? LineStyle.Dashed : LineStyle.Solid, crosshairMarkerRadius: 4 },
          painel,
        )
        api.setData(dados)
      }
      apis.push(api)
      if (!primeiraDoPainel.has(painel)) primeiraDoPainel.set(painel, api)
    }

    if (log) primeiraDoPainel.get(0)?.priceScale().applyOptions({ mode: PriceScaleMode.Logarithmic })
    for (const l of linhas ?? []) {
      primeiraDoPainel.get(l.painel ?? 0)?.createPriceLine({
        price: l.valor,
        color: l.cor,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: l.rotulo,
      })
    }
    const ps = chart.panes()
    if (ps.length > 1) {
      ps[0].setHeight(altura)
      paineis?.forEach((h, i) => ps[i + 1]?.setHeight(h))
    }

    if (desde) {
      const ultimoT = Math.max(...series.map((s) => s.dados[s.dados.length - 1]?.[0] ?? 0))
      chart.timeScale().setVisibleRange({ from: desde as UTCTimestamp, to: ultimoT as UTCTimestamp })
    } else {
      chart.timeScale().fitContent()
    }

    chart.subscribeCrosshairMove((p) => {
      if (!p.time || !p.seriesData.size) {
        setHover(null)
        return
      }
      setHover({
        t: p.time as number,
        valores: apis.map((a) => {
          const d = p.seriesData.get(a) as { value?: number } | undefined
          return d?.value ?? null
        }),
      })
    })

    return () => chart.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDados, altura, log, desde, temDados, JSON.stringify(linhas), JSON.stringify(paineis)])

  if (!temDados) {
    return (
      <div className="grafico-vazio" style={{ height: altura }}>
        {vazio ?? 'Sem dados'}
      </div>
    )
  }

  const valores = hover?.valores ?? series.map((s) => s.dados[s.dados.length - 1]?.[1] ?? null)
  return (
    <div className="grafico">
      <div className="grafico-legenda" aria-live="off">
        {hover?.t ? <span className="data">{formatoData(hover.t)}</span> : null}
        {series.map((s, i) => (
          <span key={s.nome} style={{ ['--cor' as string]: s.cor }}>
            <i />
            {s.nome} <b>{valores[i] != null ? (s.formato ?? formato)(valores[i]!) : '—'}</b>
          </span>
        ))}
      </div>
      <div ref={caixa} style={{ height: altura + (paineis ?? []).reduce((a, b) => a + b, 0) }} />
    </div>
  )
}

/** Janela de tempo dos gráficos. */
export type Janela = '30d' | '90d' | '1a' | '4a' | 'tudo'
export const JANELAS: { valor: Janela; rotulo: string }[] = [
  { valor: '30d', rotulo: '30d' },
  { valor: '90d', rotulo: '90d' },
  { valor: '1a', rotulo: '1a' },
  { valor: '4a', rotulo: '4a' },
  { valor: 'tudo', rotulo: 'Tudo' },
]
export function inicioDaJanela(j: Janela) {
  const dias = { '30d': 30, '90d': 90, '1a': 365, '4a': 4 * 365, tudo: 0 }[j]
  return dias ? Math.floor(Date.now() / 1000) - dias * 86400 : undefined
}
