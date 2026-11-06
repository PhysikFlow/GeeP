import type { Serie } from '../precos'

// Matemática de séries usada pelos indicadores. Tudo sobre Serie diária
// ([unix s, valor] crescente). Janelas que ainda não fecharam ficam de fora
// em vez de virar um valor parcial enganoso.

export function sma(s: Serie, n: number): Serie {
  const out: Serie = []
  let soma = 0
  for (let i = 0; i < s.length; i++) {
    soma += s[i][1]
    if (i >= n) soma -= s[i - n][1]
    if (i >= n - 1) out.push([s[i][0], soma / n])
  }
  return out
}

/** Divide a por b nos dias em comum. */
export function razao(a: Serie, b: Serie): Serie {
  const mb = new Map(b)
  const out: Serie = []
  for (const [t, v] of a) {
    const d = mb.get(t)
    if (d) out.push([t, v / d])
  }
  return out
}

export function rsi(s: Serie, n = 14): Serie {
  const out: Serie = []
  if (s.length <= n) return out
  let ganho = 0
  let perda = 0
  for (let i = 1; i <= n; i++) {
    const d = s[i][1] - s[i - 1][1]
    if (d >= 0) ganho += d
    else perda -= d
  }
  ganho /= n
  perda /= n
  out.push([s[n][0], perda === 0 ? 100 : 100 - 100 / (1 + ganho / perda)])
  for (let i = n + 1; i < s.length; i++) {
    const d = s[i][1] - s[i - 1][1]
    ganho = (ganho * (n - 1) + Math.max(d, 0)) / n
    perda = (perda * (n - 1) + Math.max(-d, 0)) / n
    out.push([s[i][0], perda === 0 ? 100 : 100 - 100 / (1 + ganho / perda)])
  }
  return out
}

/** Fechamento semanal (último dia de cada semana ISO, a semana corrente inclusa). */
export function semanal(s: Serie): Serie {
  const out: Serie = []
  for (const p of s) {
    const semana = Math.floor((p[0] / 86400 + 3) / 7) // semanas começando na segunda
    const ult = out[out.length - 1]
    if (ult && Math.floor((ult[0] / 86400 + 3) / 7) === semana) out[out.length - 1] = p
    else out.push(p)
  }
  return out
}

export function drawdown(s: Serie): Serie {
  let topo = 0
  return s.map(([t, v]) => {
    topo = Math.max(topo, v)
    return [t, (v / topo - 1) * 100]
  })
}

export const ultimo = (s: Serie | undefined | null) => (s && s.length ? s[s.length - 1][1] : null)

/** Valor de n dias atrás (para variações). */
export function haDias(s: Serie | undefined, dias: number) {
  if (!s?.length) return null
  const alvo = s[s.length - 1][0] - dias * 86400
  for (let i = s.length - 1; i >= 0; i--) if (s[i][0] <= alvo) return s[i][1]
  return null
}

export function percentil(vals: number[], p: number) {
  if (!vals.length) return null
  const o = [...vals].sort((a, b) => a - b)
  const i = (o.length - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return o[lo] + (o[hi] - o[lo]) * (i - lo)
}

export function desvio(vals: number[]) {
  if (vals.length < 2) return 0
  const m = vals.reduce((a, b) => a + b, 0) / vals.length
  return Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / (vals.length - 1))
}

/** Volatilidade anualizada (%) dos retornos diários dos últimos n dias. */
export function volatilidade(s: Serie, n = 30) {
  const ult = s.slice(-n - 1)
  const ret: number[] = []
  for (let i = 1; i < ult.length; i++) ret.push(Math.log(ult[i][1] / ult[i - 1][1]))
  return desvio(ret) * Math.sqrt(365) * 100
}

/** Posição de v entre fundo e topo, em 0-100 (log opcional para razões). */
export function escala(v: number | null, fundo: number, topo: number, log = false) {
  if (v == null || !Number.isFinite(v)) return null
  const f = log ? Math.log(fundo) : fundo
  const t = log ? Math.log(topo) : topo
  const x = log ? Math.log(Math.max(v, 1e-9)) : v
  return Math.max(0, Math.min(100, ((x - f) / (t - f)) * 100))
}

// Lei de potência do BTC (Santostasi): preço justo ~ dias desde o gênesis^5,82.
const GENESIS = Date.UTC(2009, 0, 3) / 1000
export function leiDePotencia(t: number) {
  const dias = (t - GENESIS) / 86400
  return 10 ** (-17.01593313 + 5.84509376 * Math.log10(dias))
}
