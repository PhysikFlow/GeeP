import { useMemo } from 'react'
import { escala } from './indicators/calc'
import { useCicloBtc } from './indicators/ciclo'
import { valorEm, type Serie } from './precos'

// BACKTEST das regras de preço do veredito, de 2018 até hoje, só com BTC.
//
// O que dá para reconstruir dia a dia com dados grátis: o termômetro do ciclo
// (Mayer, 200 semanas, lei de potência, Pi Cycle, RSI semanal, Puell, MVRV e
// NUPL da Coin Metrics, Medo & Ganância desde 2018) e a régua de capitulação
// (menos funding, sem histórico grátis antes de 2019). O REGIME MACRO NÃO:
// as séries de juros, DXY e BLS grátis só cobrem poucos anos. Por isso o
// teste roda as regras em cada regime fixo — "e se o ambiente fosse sempre
// expansão / seletivo / deterioração" — e não o veredito completo.
//
// Regras simplificadas, decisão semanal, US$ 10 mil iniciais, 0,1% de taxa
// e 0,1% de slippage, caixa sem render (em dólar). Parcela = 5% do capital
// inicial por semana de compra; venda = 10% da posição por semana de venda.

const TAXA = 0.002 // taxa + slippage
const INICIAL = 10_000
const PARCELA = INICIAL * 0.05
const SEMANA = 7 * 86400

export type Ponto = { t: number; termometro: number; capitulacao: number; preco: number }

export type Estrategia = {
  id: string
  nome: string
  desc: string
  final: number
  retorno: number
  maxQueda: number
  caixaFinal: number
  compras: number
  vendas: number
  curva: Serie
}

function simular(
  pontos: Ponto[],
  decide: (p: Ponto, i: number) => 'comprar' | 'seguro' | 'metade' | 'vender' | null,
  nome: string,
  id: string,
  desc: string,
): Estrategia {
  let caixa = INICIAL
  let btc = 0
  let pico = INICIAL
  let maxQueda = 0
  let compras = 0
  let vendas = 0
  const curva: Serie = []
  pontos.forEach((p, i) => {
    const d = decide(p, i)
    if (d === 'vender' && btc > 0) {
      const q = btc * 0.1
      btc -= q
      caixa += q * p.preco * (1 - TAXA)
      vendas++
    } else if (d && d !== 'vender') {
      const usd = Math.min(caixa, d === 'comprar' ? PARCELA : d === 'metade' ? PARCELA / 2 : PARCELA * 0.15)
      if (usd >= 1) {
        caixa -= usd
        btc += (usd * (1 - TAXA)) / p.preco
        compras++
      }
    }
    const v = caixa + btc * p.preco
    pico = Math.max(pico, v)
    maxQueda = Math.min(maxQueda, (v / pico - 1) * 100)
    curva.push([p.t, v])
  })
  const final = curva[curva.length - 1]?.[1] ?? INICIAL
  return { id, nome, desc, final, retorno: (final / INICIAL - 1) * 100, maxQueda, caixaFinal: caixa, compras, vendas, curva }
}

export function useBacktest(desde = Date.UTC(2018, 0, 1) / 1000) {
  const c = useCicloBtc()
  const k = c.calc
  const mvrv = c.onchain.cm.data?.mvrv
  const fng = c.fng.data?.serie

  return useMemo(() => {
    if (!k || !mvrv?.length) return null
    const at = (s: Serie | undefined, t: number) => (s?.length ? valorEm(s, t) : null)
    let ath = 0
    let ip = 0 // máxima histórica até a semana, sem olhar o futuro
    const pontos: Ponto[] = []
    for (let t = desde; t <= k.p[k.p.length - 1][0]; t += SEMANA) {
      const preco = at(k.p, t)
      if (!preco) continue
      while (ip < k.p.length && k.p[ip][0] <= t) ath = Math.max(ath, k.p[ip++][1])
      const m = at(mvrv, t)
      const w200 = at(k.s200w, t)
      const f = at(fng, t)
      const familias: Record<string, (number | null)[]> = {
        custo: [escala(m, 0.9, 3.7), m ? escala(1 - 1 / m, 0, 0.75) : null],
        tendencia: [escala(at(k.mayer, t), 0.6, 2.4), escala(w200 ? preco / w200 : null, 1, 5, true), escala(at(k.lpRazao, t), 0.42, 3, true), escala(at(k.piRazao, t), 0.35, 1)],
        mineracao: [escala(at(k.puell, t), 0.5, 4, true)],
        momento: [escala(at(k.rsiS, t), 30, 90), f],
      }
      const medias = Object.values(familias)
        .map((ns) => ns.filter((x): x is number => x != null))
        .filter((ns) => ns.length)
        .map((ns) => ns.reduce((a, b) => a + b, 0) / ns.length)
      if (medias.length < 2) continue
      const rib = k.ribbons
      const ribAgora = at(rib, t)
      const ribAntes = rib.filter(([tt]) => tt > t - 30 * 86400 && tt < t).some(([, v]) => v < 1)
      const capitulacao =
        (m != null && m < 1 ? 1 : 0) + (w200 && preco < w200 ? 1 : 0) + (preco <= ath * 0.3 ? 1 : 0) + (ribAgora != null && ribAgora >= 1 && ribAntes ? 1 : 0) + (f != null && f <= 15 ? 1 : 0)
      pontos.push({ t, preco, capitulacao, termometro: medias.reduce((a, b) => a + b, 0) / medias.length })
    }
    if (pontos.length < 52) return null
    const n = pontos.length
    const estrategias: Estrategia[] = [
      simular(pontos, () => null, 'Parado em dólar', 'caixa', 'Não compra nada: o custo de nunca agir.'),
      simular(pontos, (_, i) => (i === 0 ? 'comprar' : null), 'Tudo em BTC no início', 'hodl', 'Lump sum na primeira semana (aqui usa só a 1ª parcela… ver abaixo).'),
      simular(pontos, () => 'comprar', 'DCA cego', 'dca', `Compra ${PARCELA / INICIAL * 100}% do capital toda semana até acabar o caixa, sem olhar nada.`),
      simular(pontos, (p) => (p.termometro >= 75 ? 'vender' : p.termometro <= 35 ? 'comprar' : null), 'Método · regime 1 sempre', 'r1', 'Compra com termômetro ≤ 35, vende 10% com ≥ 75.'),
      simular(pontos, (p) => (p.termometro >= 75 ? 'vender' : p.termometro <= 30 && p.capitulacao >= 1 ? 'metade' : null), 'Método · regime 2 sempre', 'r2', 'Meia parcela com termômetro ≤ 30 e ≥ 1 sinal de capitulação; vende com ≥ 75.'),
      simular(
        pontos,
        (p) => (p.termometro >= 60 ? 'vender' : (p.termometro <= 20 && p.capitulacao >= 3) || p.capitulacao >= 5 ? 'seguro' : null),
        'Método · regime 3 sempre',
        'r3',
        'Só parcela de seguro (15% da parcela) com capitulação forte; vende com ≥ 60.',
      ),
    ]
    // O "tudo no início" de verdade: o capital inteiro na primeira semana.
    const p0 = pontos[0]
    const btc0 = (INICIAL * (1 - TAXA)) / p0.preco
    const curvaH: Serie = pontos.map((p) => [p.t, btc0 * p.preco])
    let pico = 0
    let mq = 0
    for (const [, v] of curvaH) {
      pico = Math.max(pico, v)
      mq = Math.min(mq, (v / pico - 1) * 100)
    }
    const hodl = estrategias.find((e) => e.id === 'hodl')!
    Object.assign(hodl, {
      desc: 'Todo o capital em BTC na primeira semana e nunca mexe.',
      final: curvaH[n - 1][1],
      retorno: (curvaH[n - 1][1] / INICIAL - 1) * 100,
      maxQueda: mq,
      caixaFinal: 0,
      compras: 1,
      curva: curvaH,
    })
    return { pontos, estrategias, inicio: pontos[0].t, fim: pontos[n - 1].t, semanas: n }
  }, [k, mvrv, fng, desde])
}
