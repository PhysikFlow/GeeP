import { useMemo } from 'react'
import type { Serie } from '../precos'
import type { Nativo } from '../store'
import { rsi, semanal, sma, ultimo } from './calc'
import { useDerivativos, useVelasDiarias, useVelasOhlc, type Derivativos, type Vela } from './fontes'
import { useRegime } from './macro'
import { useVeredito } from './veredito'

// SHORT 2x — conservador de propósito. Short é a operação mais difícil: o
// prejuízo não tem teto, o funding pode virar custo, e a 2x uma alta de ~50%
// liquida a posição. Por isso o padrão aqui é "fique longe", e "dá para
// shortar" só aparece quando TRÊS coisas batem ao mesmo tempo:
//
//   viés     a tendência é de baixa (estrutura, médias, macro)?
//   entrada  existe um ponto bom AGORA (não esticado, perto de resistência)?
//   risco    os derivativos não apontam squeeze e o stop cabe a 2x?
//
// Tendência de baixa NÃO é oportunidade de short: queda já esticada, shorts
// lotados ou preço na zona de fundo histórico do ciclo são vetos. Os pesos
// e limites são pontos de partida, sem backtest — o app mostra cada critério
// para você conferir, não uma probabilidade.

export type Checagem = { id: string; nome: string; ok: boolean | null; valor: string }

export type VereditoShort = 'shortar' | 'indefinido' | 'longe'

export type Plano = {
  entrada: number
  stop: number
  alvo: number | null
  rr: number | null
  liquidacao: number
  /** % de movimento do preço até o stop e até o alvo. */
  stopPct: number
  alvoPct: number | null
  /** Resultado sobre a margem (2x): perda no stop, ganho no alvo. */
  perdaMargem: number
  ganhoMargem: number | null
  /** Funding diário sobre a margem (positivo = o short recebe). */
  fundingDia: number | null
}

export type AnaliseShort = {
  ativo: Nativo
  preco: number
  vies: Checagem[]
  entrada: Checagem[]
  risco: Checagem[]
  vetos: string[]
  nota: { vies: number; entrada: number; risco: number }
  plano: Plano | null
  veredito: VereditoShort
  porque: string
}

export const ALAVANCAGEM = 2
const MMR = 0.005 // margem de manutenção típica dos perpétuos grandes

const pct = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

function atr(v: Vela[], n = 14) {
  const tr: number[] = []
  for (let i = 1; i < v.length; i++) tr.push(Math.max(v[i].h - v[i].l, Math.abs(v[i].h - v[i - 1].c), Math.abs(v[i].l - v[i - 1].c)))
  const ult = tr.slice(-n)
  return ult.reduce((a, b) => a + b, 0) / Math.max(1, ult.length)
}

function ema(s: Serie, n: number): Serie {
  const k = 2 / (n + 1)
  const out: Serie = []
  let e: number | null = null
  for (const [t, v] of s) {
    e = e == null ? v : v * k + e * (1 - k)
    out.push([t, e])
  }
  return out.slice(n - 1)
}

export type Contexto = {
  regime: 1 | 2 | 3 | null
  termometroBtc: number | null
  capitulacaoBtc: number
  /** Para ETH/SOL: o par contra o BTC (força relativa). */
  contraBtc?: Serie
  /** Para o BTC: suportes de ciclo (média de 200 semanas, preço realizado). */
  suportesBtc?: number[]
}

/** As regras, sem rede: recebe as velas e os derivativos e devolve a análise. */
export function analisarShort(ativo: Nativo, v: Vela[], d: Derivativos | undefined, ctx: Contexto): AnaliseShort | null {
  if (v.length < 220) return null
  const closes: Serie = v.map((x) => [x.t, x.c])
  const preco = v[v.length - 1].c
  const m20 = ultimo(sma(closes, 20))!
  const m50s = sma(closes, 50)
  const m50 = ultimo(m50s)!
  const m50antes = m50s[m50s.length - 11]?.[1] ?? m50
  const m200 = ultimo(sma(closes, 200))!
  const e21s = ultimo(ema(semanal(closes), 21))
  const fechSemanal = ultimo(semanal(closes))!
  const a = atr(v)
  const atrPct = (a / preco) * 100
  const rsiD = ultimo(rsi(closes.slice(-120), 14))
  const ult = v.slice(-20)
  const ant = v.slice(-40, -20)
  const topoUlt = Math.max(...ult.map((x) => x.h))
  const topoAnt = Math.max(...ant.map((x) => x.h))
  const fundoUlt = Math.min(...ult.map((x) => x.l))
  const fundoAnt = Math.min(...ant.map((x) => x.l))
  const esticado = (preco - m20) / a

  // ---------------- viés ----------------
  const vies: Checagem[] = [
    { id: 'm200', nome: 'Preço abaixo da média de 200 dias', ok: preco < m200, valor: `${pct((preco / m200 - 1) * 100)}% da média` },
    { id: 'cruz', nome: 'Média de 50 abaixo da de 200 (cruz da morte)', ok: m50 < m200, valor: m50 < m200 ? 'sim' : 'não' },
    { id: 'm50', nome: 'Média de 50 dias caindo', ok: m50 < m50antes, valor: `${pct((m50 / m50antes - 1) * 100)}% em 10 dias` },
    { id: 'estrutura', nome: 'Topos e fundos descendentes (20 dias)', ok: topoUlt < topoAnt && fundoUlt < fundoAnt, valor: topoUlt < topoAnt && fundoUlt < fundoAnt ? 'sim' : 'não' },
    { id: 'semanal', nome: 'Fechamento semanal abaixo da EMA de 21 semanas', ok: e21s == null ? null : fechSemanal < e21s, valor: e21s ? `${pct((fechSemanal / e21s - 1) * 100)}% da EMA` : '—' },
    { id: 'macro', nome: 'Ambiente em deterioração (regime 3)', ok: ctx.regime == null ? null : ctx.regime === 3, valor: ctx.regime ? `nível ${ctx.regime}` : '—' },
  ]
  if (ativo === 'BTC') {
    const t = ctx.termometroBtc
    vies.push({ id: 'ciclo', nome: 'Preço não está barato no ciclo (termômetro ≥ 50)', ok: t == null ? null : t >= 50, valor: t == null ? '—' : `${Math.round(t)}/100` })
  } else {
    const cb = ctx.contraBtc
    const cbM = cb?.length ? ultimo(sma(cb, 50)) : null
    const cbAgora = ultimo(cb)
    vies.push({
      id: 'rel',
      nome: `${ativo}/BTC abaixo da média de 50 dias (mais fraco que o BTC)`,
      ok: cbM == null || cbAgora == null ? null : cbAgora < cbM,
      valor: cbM && cbAgora ? `${pct((cbAgora / cbM - 1) * 100)}% da média` : '—',
    })
  }

  // ---------------- entrada ----------------
  const entrada: Checagem[] = [
    { id: 'esticado', nome: 'Queda não está esticada (até 1,5 ATR abaixo da média de 20)', ok: esticado > -1.5, valor: `${esticado.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ATR` },
    { id: 'rsi', nome: 'RSI diário entre 40 e 65 (sem sobrevenda)', ok: rsiD == null ? null : rsiD >= 40 && rsiD <= 65, valor: rsiD == null ? '—' : String(Math.round(rsiD)) },
    {
      id: 'resistencia',
      nome: 'Perto de resistência (até 1 ATR abaixo da média de 20 ou de 50)',
      ok: (preco <= m20 && m20 - preco <= a) || (preco <= m50 && m50 - preco <= a),
      valor: `${pct((preco / m20 - 1) * 100)}% da média de 20`,
    },
  ]

  // ---------------- risco ----------------
  const fh = d?.fundingHist ?? []
  const f9 = fh.slice(-9)
  const fMedio = f9.length ? f9.reduce((s, [, x]) => s + x, 0) / f9.length : null // % por 8 h
  const ls = ultimo(d?.longShort)
  const oi = d?.oiValor ?? []
  const oiAgora = ultimo(oi)
  const oi7 = oi.length > 7 ? oi[oi.length - 8][1] : null
  const preco7 = v[v.length - 8]?.c
  const shortsEntrando = oiAgora != null && oi7 != null && preco7 != null && preco < preco7 && oiAgora > oi7 * 1.1
  const risco: Checagem[] = [
    { id: 'funding', nome: 'Funding médio de 3 dias ≥ 0 (shorts não lotados; o short recebe)', ok: fMedio == null ? null : fMedio >= 0, valor: fMedio == null ? '—' : `${fMedio.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}% / 8 h` },
    { id: 'ls', nome: 'Maioria das contas comprada (long/short ≥ 1)', ok: ls == null ? null : ls >= 1, valor: ls == null ? '—' : ls.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) },
    { id: 'oi', nome: 'Sem enxurrada de shorts novos (OI +10% com preço caindo em 7 dias)', ok: oi.length ? !shortsEntrando : null, valor: oiAgora && oi7 ? `OI ${pct((oiAgora / oi7 - 1) * 100)}% em 7 dias` : '—' },
    { id: 'vol', nome: 'Volatilidade diária ≤ 5% (stop não é varrido por ruído)', ok: atrPct <= 5, valor: `ATR ${pct(atrPct)}%` },
  ]

  // ---------------- plano a 2x ----------------
  const stop = Math.min(topoUlt + 0.25 * a, preco * 1.15)
  const stopPct = (stop / preco - 1) * 100
  const suportes = [
    Math.min(...v.slice(-60).map((x) => x.l)),
    Math.min(...v.slice(-180).map((x) => x.l)),
    Math.min(...v.slice(-365).map((x) => x.l)),
    ...(ctx.suportesBtc ?? []),
  ]
    .filter((s) => s < preco * 0.97)
    .sort((x, y) => y - x)
  const alvo = suportes[0] ?? null
  const alvoPct = alvo ? (1 - alvo / preco) * 100 : null
  const rr = alvoPct != null && stopPct > 0 ? alvoPct / stopPct : null
  const plano: Plano = {
    entrada: preco,
    stop,
    alvo,
    rr,
    liquidacao: preco * (1 + 1 / ALAVANCAGEM - MMR),
    stopPct,
    alvoPct,
    perdaMargem: stopPct * ALAVANCAGEM,
    ganhoMargem: alvoPct != null ? alvoPct * ALAVANCAGEM : null,
    fundingDia: fMedio != null ? fMedio * 3 * ALAVANCAGEM : null,
  }

  // ---------------- vetos ----------------
  const vetos: string[] = []
  const nVies = vies.filter((c) => c.ok).length
  if (ctx.regime === 1) vetos.push('Ambiente em expansão (regime 1): o vento macro sopra a favor de risco.')
  if (nVies < 4) vetos.push(`A tendência não é de baixa: só ${nVies} de ${vies.length} critérios de viés.`)
  if (ctx.termometroBtc != null && ctx.termometroBtc <= 25)
    vetos.push(`BTC na zona de fundo histórico do ciclo (termômetro ${Math.round(ctx.termometroBtc)}/100): short aqui é apostar contra o que o ciclo costuma fazer.`)
  if (ctx.capitulacaoBtc >= 2) vetos.push(`${ctx.capitulacaoBtc} sinais de capitulação acesos no BTC: é perto de fundos que os shorts mais apanham.`)
  if (fMedio != null && fMedio < -0.01) vetos.push('Funding negativo forte: shorts lotados, terreno de short squeeze.')
  if (esticado <= -2.5) vetos.push('Queda já esticada (2,5 ATR ou mais abaixo da média de 20): repique costuma vir antes da continuação.')
  if (rsiD != null && rsiD < 30) vetos.push(`RSI diário em ${Math.round(rsiD)}: sobrevendido.`)
  if (stop >= preco * 1.15) vetos.push('O stop técnico fica a mais de 15% do preço: a 2x isso já é perda de 30% da margem.')

  const nota = {
    vies: Math.round((nVies / vies.length) * 100),
    entrada: Math.round((entrada.filter((c) => c.ok).length / entrada.length) * 100),
    risco: Math.round((risco.filter((c) => c.ok).length / risco.length) * 100),
  }

  let veredito: VereditoShort = 'indefinido'
  let porque = ''
  if (vetos.length) {
    veredito = 'longe'
    porque = vetos[0]
  } else if (
    nota.vies >= 70 &&
    (ctx.regime === 3 || nota.vies >= 85) &&
    nota.entrada >= 66 &&
    nota.risco >= 75 &&
    rr != null &&
    rr >= 2
  ) {
    veredito = 'shortar'
    porque = `Tendência de baixa (${nota.vies}), entrada boa (${nota.entrada}), derivativos sem sinal de squeeze (${nota.risco}) e alvo ${rr.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}× o risco.`
  } else {
    const falta = [
      nota.vies < 70 && 'viés de baixa mais forte',
      ctx.regime !== 3 && nota.vies < 85 && 'ambiente em deterioração (ou viés quase unânime)',
      nota.entrada < 66 && 'um ponto de entrada melhor (repique até a média, sem sobrevenda)',
      nota.risco < 75 && 'derivativos mais limpos',
      (rr == null || rr < 2) && 'alvo de pelo menos 2× o risco',
    ].filter(Boolean)
    porque = `A direção até pode ser de queda, mas falta: ${falta.join('; ')}.`
  }

  return { ativo, preco, vies, entrada, risco, vetos, nota, plano, veredito, porque }
}

const PARES: Record<Nativo, string> = { BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT' }

export function useShort(ativo: Nativo) {
  const velas = useVelasOhlc(PARES[ativo])
  const deriv = useDerivativos(PARES[ativo])
  const contra = useVelasDiarias(ativo === 'ETH' ? 'ETHBTC' : 'SOLBTC', 200)
  const regime = useRegime()
  const ver = useVeredito()
  const analise = useMemo(() => {
    if (!velas.data) return null
    return analisarShort(ativo, velas.data, deriv.data, {
      regime: regime.nivel,
      termometroBtc: ver.termometro,
      capitulacaoBtc: ver.sinais,
      contraBtc: ativo === 'BTC' ? undefined : contra.data,
      suportesBtc: ativo === 'BTC' ? ver.suportes : undefined,
    })
  }, [ativo, velas.data, deriv.data, contra.data, regime.nivel, ver.termometro, ver.sinais, ver.suportes])
  return { analise, carregando: velas.isLoading || deriv.isLoading, erro: (velas.error ?? deriv.error) as Error | null }
}
