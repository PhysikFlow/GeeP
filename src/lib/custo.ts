import type { Movimento } from './chains/tipos'
import { cambioEm, valorEm, type Serie } from './precos'

// PREÇO MÉDIO ESTIMADO pelo método do custo médio, a partir das movimentações
// on-chain. Cada ENTRADA na carteira conta como compra pelo preço do dia;
// cada SAÍDA tira quantidade pelo custo médio (não mexe no preço médio).
//
// É estimativa, e a tela diz isso: a blockchain sabe QUANDO a moeda chegou,
// não quanto você pagou. Moeda que veio de outra carteira sua entra pelo preço
// do dia da transferência — a não ser que as duas carteiras estejam no app:
// aí a mesma transação aparece nas duas, os deltas se anulam, e ela some.
// Quem sabe o preço real informa à mão (Ajustes por ativo), e ele vence.

export type Entrada = { t: number; qtd: number; precoUsd: number }

export type ResultadoCusto = {
  qtd: number
  custoUsd: number
  custoBrl: number
  precoMedioUsd: number | null
  precoMedioBrl: number | null
  entradas: Entrada[]
  /** Havia saldo antes da primeira movimentação baixada. */
  saldoInicialEstimado: number
  /** Entradas cujo preço não existia na série (antes do começo). */
  semPreco: number
}

/** Junta as movimentações de várias carteiras do MESMO ativo por transação. */
export function juntarPorTx(listas: Movimento[][]): Movimento[] {
  const m = new Map<string, Movimento>()
  for (const l of listas)
    for (const mv of l) {
      const ja = m.get(mv.txid)
      if (ja) m.set(mv.txid, { ...ja, delta: ja.delta + mv.delta, taxa: (ja.taxa ?? 0) + (mv.taxa ?? 0) || undefined })
      else m.set(mv.txid, { ...mv })
    }
  return [...m.values()].filter((x) => Math.abs(x.delta) > 1e-12).sort((a, b) => a.t - b.t)
}

export function custoMedio(movs: Movimento[], saldoAtual: number, precos: Serie, fx: Serie, fxAtual: number): ResultadoCusto {
  const soma = movs.reduce((s, m) => s + m.delta, 0)
  // Se o histórico baixado não chega ao começo, havia saldo antes dele.
  const inicial = Math.max(0, saldoAtual - soma)
  let q = 0
  let custoU = 0
  let custoB = 0
  let semPreco = 0
  const entradas: Entrada[] = []

  const precoEm = (t: number) => valorEm(precos, t)

  if (inicial > 1e-9 && movs.length) {
    const t0 = movs[0].t
    const p = precoEm(t0)
    if (p != null) {
      q = inicial
      custoU = inicial * p
      custoB = custoU * cambioEm(fx, t0, fxAtual)
      entradas.push({ t: t0, qtd: inicial, precoUsd: p })
    }
  }

  for (const m of movs) {
    if (m.delta > 0) {
      const p = precoEm(m.t)
      if (p == null) {
        semPreco++
        continue
      }
      q += m.delta
      custoU += m.delta * p
      custoB += m.delta * p * cambioEm(fx, m.t, fxAtual)
      entradas.push({ t: m.t, qtd: m.delta, precoUsd: p })
    } else if (q > 0) {
      const sai = Math.min(q, -m.delta)
      const frac = sai / q
      custoU -= custoU * frac
      custoB -= custoB * frac
      q -= sai
    }
  }
  return {
    qtd: q,
    custoUsd: custoU,
    custoBrl: custoB,
    precoMedioUsd: q > 1e-12 ? custoU / q : null,
    precoMedioBrl: q > 1e-12 ? custoB / q : null,
    entradas,
    saldoInicialEstimado: inicial,
    semPreco,
  }
}

const DIA = 86400

/**
 * Saldo ao fim de cada dia, reconstruído de trás para frente a partir do saldo
 * atual (assim um histórico incompleto não desloca a curva inteira).
 */
export function saldoDiario(movs: Movimento[], saldoAtual: number, desde?: number): Serie {
  const hoje = Math.floor(Date.now() / 1000 / DIA) * DIA
  if (movs.length === 0) return desde != null ? [[desde, saldoAtual], [hoje, saldoAtual]] : [[hoje, saldoAtual]]
  const inicio = Math.floor((desde ?? movs[0].t) / DIA) * DIA
  const ord = [...movs].sort((a, b) => a.t - b.t)
  const out: Serie = []
  let saldo = saldoAtual
  let i = ord.length - 1
  for (let d = hoje; d >= inicio; d -= DIA) {
    // tira as movimentações que aconteceram DEPOIS do fim do dia d
    while (i >= 0 && ord[i].t >= d + DIA) {
      saldo -= ord[i].delta
      i--
    }
    out.push([d, Math.max(0, saldo)])
  }
  return out.reverse()
}

/** Soma séries diárias alinhadas por dia (dias faltantes repetem o último valor). */
export function somarSeries(series: Serie[]): Serie {
  const dias = new Set<number>()
  for (const s of series) for (const [d] of s) dias.add(d)
  const ord = [...dias].sort((a, b) => a - b)
  return ord.map((d) => [d, series.reduce((acc, s) => acc + (valorEm(s, d) ?? 0), 0)])
}
