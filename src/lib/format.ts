// Formatação pt-BR. Moeda de exibição é USD ou BRL (Ajustes); os cálculos são
// sempre em USD e a conversão acontece só na hora de mostrar.

export type Moeda = 'USD' | 'BRL'

const cacheFmt = new Map<string, Intl.NumberFormat>()
function nf(chave: string, op: Intl.NumberFormatOptions) {
  let f = cacheFmt.get(chave)
  if (!f) {
    f = new Intl.NumberFormat('pt-BR', op)
    cacheFmt.set(chave, f)
  }
  return f
}

export function dinheiro(v: number | null | undefined, moeda: Moeda = 'USD', compacto = false) {
  if (v == null || !Number.isFinite(v)) return '—'
  const abs = Math.abs(v)
  if (compacto && abs >= 10_000) {
    return nf(`c-${moeda}`, { style: 'currency', currency: moeda, notation: 'compact', maximumFractionDigits: 2 }).format(v)
  }
  const casas = abs === 0 ? 2 : abs < 0.01 ? 6 : abs < 1 ? 4 : 2
  return nf(`m-${moeda}-${casas}`, { style: 'currency', currency: moeda, minimumFractionDigits: Math.min(2, casas), maximumFractionDigits: casas }).format(v)
}

export function numero(v: number | null | undefined, casas = 2) {
  if (v == null || !Number.isFinite(v)) return '—'
  return nf(`n-${casas}`, { maximumFractionDigits: casas, minimumFractionDigits: 0 }).format(v)
}

export function compacto(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return '—'
  return nf('cpt', { notation: 'compact', maximumFractionDigits: 2 }).format(v)
}

/** Quantidade de moeda: mais casas quanto menor o número (sats importam). */
export function qtd(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return '—'
  const abs = Math.abs(v)
  const casas = abs === 0 ? 0 : abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.0001 ? 6 : 8
  return nf(`q-${casas}`, { maximumFractionDigits: casas }).format(v)
}

export function pct(v: number | null | undefined, casas = 2, sinal = true) {
  if (v == null || !Number.isFinite(v)) return '—'
  const s = nf(`p-${casas}`, { maximumFractionDigits: casas, minimumFractionDigits: casas }).format(v)
  return `${sinal && v > 0 ? '+' : ''}${s}%`
}

export function data(seg: number | null | undefined, comHora = false) {
  if (!seg) return '—'
  return new Date(seg * 1000).toLocaleString('pt-BR', comHora
    ? { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', year: 'numeric' })
}

export function relativo(ms: number) {
  const s = Math.round((Date.now() - ms) / 1000)
  if (s < 60) return 'agora'
  if (s < 3600) return `há ${Math.round(s / 60)} min`
  if (s < 86400) return `há ${Math.round(s / 3600)} h`
  return `há ${Math.round(s / 86400)} d`
}

export function duracao(seg: number) {
  const d = Math.floor(seg / 86400)
  const h = Math.floor((seg % 86400) / 3600)
  if (d > 0) return `${d}d ${h}h`
  const m = Math.floor((seg % 3600) / 60)
  return `${h}h ${m}min`
}

export function encurtar(end: string, n = 6) {
  if (end.length <= n * 2 + 3) return end
  return `${end.slice(0, n)}…${end.slice(-n + 1)}`
}

/** Classe CSS para o sinal de uma variação. */
export function tomDe(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v) || Math.abs(v) < 1e-9) return 'neutro'
  return v > 0 ? 'sobe' : 'desce'
}

/** Número com casas fixas e vírgula decimal (o toFixed do JS usa ponto). */
export function fixo(v: number | null | undefined, casas = 2) {
  if (v == null || !Number.isFinite(v)) return '—'
  return nf(`f-${casas}`, { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(v)
}
