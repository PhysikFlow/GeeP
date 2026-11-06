import { useQuery } from '@tanstack/react-query'
import { pedirJson } from '../http'
import { DIA, HORA } from '../query'
import type { Serie } from '../precos'
import { haDias, sma, ultimo } from './calc'
import { useGlobal, useMedoGanancia, useStablecoins } from './fontes'
import { useHistorico } from '../precos'

// MACRO, só com fontes oficiais que respondem direto ao navegador. O FRED não
// manda cabeçalho CORS (nem com chave), então cada série dele vem da fonte
// primária equivalente:
//   Fed funds efetiva (DFF)        -> NY Fed, EFFR
//   Treasury 2/10 anos (DGS2/10)   -> Tesouro americano, curva diária
//   Juro real 10 anos (DFII10)     -> Tesouro americano, curva real (TIPS)
//   Balanço do Fed (WALCL)         -> NY Fed, carteira SOMA (títulos do Fed)
//   Reverse repo (RRPONTSYD)       -> NY Fed, operações de reverse repo
//   CPI e desemprego               -> BLS (sem chave: 25 consultas/dia)
//   Dólar amplo (DTWEXBGS)         -> DXY calculado com o câmbio do BCE
// O spread de crédito high yield (BAMLH0A0HYM2) só existe no FRED: fica de fora.

const NYFED = 'https://markets.newyorkfed.org/api'

const isoHa = (dias: number) => new Date(Date.now() - dias * 86400_000).toISOString().slice(0, 10)
const diaDe = (iso: string) => Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 1000)
const ordenar = (s: Serie) => s.sort((a, b) => a[0] - b[0])

// ---------------------------------------------------------------------------
// juros
// ---------------------------------------------------------------------------

export type Juros = { effr: Serie; alvoMin: number | null; alvoMax: number | null }

export const useJurosFed = () =>
  useQuery({
    queryKey: ['macro', 'effr'],
    queryFn: async (): Promise<Juros> => {
      type R = { refRates: { effectiveDate: string; percentRate: number; targetRateFrom: number; targetRateTo: number }[] }
      const r = await pedirJson<R>(`${NYFED}/rates/unsecured/effr/search.json?startDate=${isoHa(3 * 365)}&endDate=${isoHa(0)}`)
      const s = ordenar(r.refRates.map((x) => [diaDe(x.effectiveDate), x.percentRate] as [number, number]))
      const ult = r.refRates[0]
      return { effr: s, alvoMin: ult?.targetRateFrom ?? null, alvoMax: ult?.targetRateTo ?? null }
    },
    staleTime: 6 * HORA,
  })

function lerCsv(csv: string) {
  const linhas = csv.trim().split(/\r?\n/)
  const cab = linhas[0].split(',').map((c) => c.replace(/"/g, '').trim())
  return linhas.slice(1).map((l) => {
    const c = l.split(',')
    const [m, d, a] = c[0].split('/')
    const t = Date.UTC(+a, +m - 1, +d) / 1000
    const v: Record<string, number> = {}
    cab.forEach((h, i) => {
      if (i > 0 && c[i] !== '' && c[i] != null) v[h] = Number(c[i])
    })
    return { t, v }
  })
}

async function curvaTesouro(tipo: 'daily_treasury_yield_curve' | 'daily_treasury_real_yield_curve', anos: number[]) {
  const partes = await Promise.all(
    anos.map((a) =>
      pedirJson<string>(
        `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${a}/all?type=${tipo}&field_tdr_date_value=${a}&page&_format=csv`,
        { texto: true },
      ).catch(() => ''),
    ),
  )
  return partes.filter(Boolean).flatMap(lerCsv)
}

export type Tesouro = { t3m: Serie; t2: Serie; t10: Serie; inclinacao: Serie; real10: Serie }

export const useTesouro = () =>
  useQuery({
    queryKey: ['macro', 'tesouro'],
    queryFn: async (): Promise<Tesouro> => {
      const ano = new Date().getUTCFullYear()
      const anos = [ano - 2, ano - 1, ano]
      const [nom, real] = await Promise.all([
        curvaTesouro('daily_treasury_yield_curve', anos),
        curvaTesouro('daily_treasury_real_yield_curve', anos),
      ])
      const col = (rows: typeof nom, k: string) => ordenar(rows.filter((r) => r.v[k] != null).map((r) => [r.t, r.v[k]] as [number, number]))
      const t2 = col(nom, '2 Yr')
      const t10 = col(nom, '10 Yr')
      const m2 = new Map(t2)
      return {
        t3m: col(nom, '3 Mo'),
        t2,
        t10,
        inclinacao: t10.filter(([t]) => m2.has(t)).map(([t, v]) => [t, v - m2.get(t)!] as [number, number]),
        real10: col(real, '10 YR'),
      }
    },
    staleTime: 6 * HORA,
  })

// ---------------------------------------------------------------------------
// liquidez do Fed
// ---------------------------------------------------------------------------

export const useBalancoFed = () =>
  useQuery({
    queryKey: ['macro', 'soma'],
    queryFn: async () => {
      const r = await pedirJson<{ soma: { summary: { asOfDate: string; total: string }[] } }>(`${NYFED}/soma/summary.json`)
      return ordenar(r.soma.summary.map((x) => [diaDe(x.asOfDate), Number(x.total)] as [number, number]))
    },
    staleTime: 12 * HORA,
  })

export const useReverseRepo = () =>
  useQuery({
    queryKey: ['macro', 'rrp'],
    queryFn: async () => {
      type R = { repo: { operations: { operationDate: string; operationType: string; totalAmtAccepted: number }[] } }
      const r = await pedirJson<R>(`${NYFED}/rp/reverserepo/propositions/search.json?startDate=${isoHa(2 * 365)}`)
      // pode haver mais de uma operação no dia: soma
      const porDia = new Map<number, number>()
      for (const o of r.repo.operations) {
        const t = diaDe(o.operationDate)
        porDia.set(t, (porDia.get(t) ?? 0) + o.totalAmtAccepted)
      }
      return ordenar([...porDia.entries()])
    },
    staleTime: 6 * HORA,
  })

// ---------------------------------------------------------------------------
// inflação e emprego (BLS)
// ---------------------------------------------------------------------------

async function serieBls(id: string): Promise<Serie> {
  type R = { status: string; Results?: { series: { data: { year: string; period: string; value: string }[] }[] } }
  const r = await pedirJson<R>(`https://api.bls.gov/publicAPI/v2/timeseries/data/${id}`)
  const d = r.Results?.series[0]?.data ?? []
  return ordenar(
    d.filter((x) => /^M(0[1-9]|1[0-2])$/.test(x.period)).map((x) => [Date.UTC(+x.year, +x.period.slice(1) - 1, 1) / 1000, Number(x.value)] as [number, number]),
  )
}

export const useInflacaoEmprego = () =>
  useQuery({
    queryKey: ['macro', 'bls'],
    queryFn: async () => {
      const [cpi, desemprego] = await Promise.all([serieBls('CUUR0000SA0'), serieBls('LNS14000000')])
      // CPI ano a ano: índice do mês ÷ mesmo mês do ano anterior
      const m = new Map(cpi)
      const cpiAa: Serie = cpi
        .map(([t, v]) => {
          const d = new Date(t * 1000)
          const antes = m.get(Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), 1) / 1000)
          return antes ? ([t, (v / antes - 1) * 100] as [number, number]) : null
        })
        .filter((x): x is [number, number] => x != null)
      return { cpiAa, desemprego }
    },
    // dado mensal, e o BLS sem chave aceita 25 consultas por dia
    staleTime: DIA,
  })

// ---------------------------------------------------------------------------
// dólar
// ---------------------------------------------------------------------------

/** DXY pela fórmula oficial (ICE), com o câmbio de referência do BCE. */
export const useDolar = () =>
  useQuery({
    queryKey: ['macro', 'dxy'],
    queryFn: async () => {
      type R = { rates: Record<string, Record<string, number>> }
      const r = await pedirJson<R>(`https://api.frankfurter.dev/v1/${isoHa(3 * 365)}..?base=USD&symbols=EUR,JPY,GBP,CAD,SEK,CHF`)
      const s: Serie = Object.entries(r.rates).map(([d, x]) => [
        diaDe(d),
        50.14348112 * x.EUR ** 0.576 * x.JPY ** 0.136 * x.GBP ** 0.119 * x.CAD ** 0.091 * x.SEK ** 0.042 * x.CHF ** 0.036,
      ])
      return ordenar(s)
    },
    staleTime: 6 * HORA,
  })

// ---------------------------------------------------------------------------
// corretoras e segurança (DefiLlama)
// ---------------------------------------------------------------------------

export type Cex = { name: string; currentTvl: number | null; inflows_24h: number | null; inflows_1w: number | null; inflows_1m: number | null; cleanAssetsTvl?: number | null }

export const useCorretoras = () =>
  useQuery({
    queryKey: ['macro', 'cexs'],
    queryFn: async () => {
      const r = await pedirJson<{ cexs: Cex[] }>('https://api.llama.fi/cexs')
      return r.cexs.filter((c) => (c.currentTvl ?? 0) > 0).sort((a, b) => (b.currentTvl ?? 0) - (a.currentTvl ?? 0))
    },
    staleTime: 3 * HORA,
  })

export type Hack = {
  date: number
  name: string
  classification: string | null
  technique: string | null
  amount: number | null
  chain: string[] | null
  returnedFunds: number | null
  defillamaId: string | null
  targetType: string | null
}

export const useHacks = () =>
  useQuery({
    queryKey: ['macro', 'hacks'],
    queryFn: async () => (await pedirJson<Hack[]>('https://api.llama.fi/hacks')).sort((a, b) => b.date - a.date),
    staleTime: 6 * HORA,
  })

// ---------------------------------------------------------------------------
// regime de mercado: nível 1 (expansão), 2 (seletivo), 3 (deterioração)
// ---------------------------------------------------------------------------

export type Voto = {
  id: string
  nome: string
  /** +1 favorece risco, 0 neutro, -1 desfavorece; null = sem dado. */
  voto: 1 | 0 | -1 | null
  valor: string
  porque: string
}

const sinal = (v: number | null, bom: number, ruim: number, inverso = false): 1 | 0 | -1 | null => {
  if (v == null || !Number.isFinite(v)) return null
  const x = inverso ? -v : v
  const b = inverso ? -bom : bom
  const r = inverso ? -ruim : ruim
  return x >= b ? 1 : x <= r ? -1 : 0
}
const fmt = (v: number | null, c = 2, suf = '') => (v == null ? '—' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })}${suf}`)

export function useRegime() {
  const juros = useJurosFed()
  const tesouro = useTesouro()
  const balanco = useBalancoFed()
  const rrp = useReverseRepo()
  const bls = useInflacaoEmprego()
  const dolar = useDolar()
  const stables = useStablecoins()
  const global = useGlobal()
  const fng = useMedoGanancia()
  const btc = useHistorico('BTC')

  const votos: Voto[] = []

  // juros: o Fed está cortando ou subindo?
  const effr = juros.data?.effr
  const effrAgora = ultimo(effr)
  const effr90 = haDias(effr, 90)
  const dEffr = effrAgora != null && effr90 != null ? effrAgora - effr90 : null
  votos.push({
    id: 'effr',
    nome: 'Fed funds (90 dias)',
    voto: sinal(dEffr, -0.1, 0.1, true),
    valor: effrAgora != null ? `${fmt(effrAgora)}% (${dEffr != null && dEffr !== 0 ? `${dEffr > 0 ? '+' : ''}${fmt(dEffr)} p.p.` : 'estável'})` : '—',
    porque: 'Cortando juros solta dinheiro para ativos de risco; subindo, o caixa volta a competir.',
  })

  // expectativa: T-bill de 3 meses contra a efetiva
  const t3 = ultimo(tesouro.data?.t3m)
  const exp = t3 != null && effrAgora != null ? t3 - effrAgora : null
  votos.push({
    id: 'exp',
    nome: 'Expectativa (T-bill 3m − Fed funds)',
    voto: sinal(exp, -0.15, 0.15, true),
    valor: exp != null ? `${exp > 0 ? '+' : ''}${fmt(exp)} p.p.` : '—',
    porque: 'T-bill abaixo da taxa efetiva = mercado precificando cortes nos próximos meses; acima = altas.',
  })

  // juro real de 10 anos: o custo de oportunidade
  const real = tesouro.data?.real10
  const realAgora = ultimo(real)
  const real30 = haDias(real, 30)
  const dReal = realAgora != null && real30 != null ? realAgora - real30 : null
  votos.push({
    id: 'real',
    nome: 'Juro real 10 anos (30 dias)',
    voto: sinal(dReal, -0.15, 0.15, true),
    valor: realAgora != null ? `${fmt(realAgora)}% (${dReal != null ? `${dReal > 0 ? '+' : ''}${fmt(dReal)}` : '—'})` : '—',
    porque: 'É o custo de oportunidade verdadeiro. Subindo, altcoins sofrem; caindo, alivia.',
  })

  // dólar
  const dxy = dolar.data
  const dxyAgora = ultimo(dxy)
  const dxy30 = haDias(dxy, 30)
  const dDxy = dxyAgora != null && dxy30 != null ? (dxyAgora / dxy30 - 1) * 100 : null
  votos.push({
    id: 'dxy',
    nome: 'Dólar (DXY, 30 dias)',
    voto: sinal(dDxy, -1, 1.5, true),
    valor: dxyAgora != null ? `${fmt(dxyAgora, 1)} (${dDxy != null ? `${dDxy > 0 ? '+' : ''}${fmt(dDxy, 1)}%` : '—'})` : '—',
    porque: 'Dólar forte aperta a liquidez global; dólar fraco costuma favorecer cripto.',
  })

  // balanço do Fed
  const soma = balanco.data
  const somaAgora = ultimo(soma)
  const soma90 = haDias(soma, 90)
  const dSoma = somaAgora != null && soma90 != null ? (somaAgora / soma90 - 1) * 100 : null
  votos.push({
    id: 'soma',
    nome: 'Balanço do Fed (títulos, 90 dias)',
    voto: sinal(dSoma, 0.5, -1.5),
    valor: somaAgora != null ? `US$ ${fmt(somaAgora / 1e12, 2)} tri (${dSoma != null ? `${dSoma > 0 ? '+' : ''}${fmt(dSoma, 1)}%` : '—'})` : '—',
    porque: 'Balanço crescendo = Fed injetando liquidez; encolhendo (QT) = retirando.',
  })

  // reverse repo: dinheiro estacionado no Fed
  const r = rrp.data
  const rrpAgora = ultimo(r)
  const rrp90 = haDias(r, 90)
  const dRrp = rrpAgora != null && rrp90 != null ? rrpAgora - rrp90 : null
  votos.push({
    id: 'rrp',
    nome: 'Reverse repo (90 dias)',
    // RRP já perto de zero não tem mais o que soltar: neutro
    voto: rrpAgora != null && rrpAgora < 50e9 ? 0 : sinal(dRrp == null ? null : -dRrp / 1e9, 50, -50),
    valor: rrpAgora != null ? `US$ ${fmt(rrpAgora / 1e9, 1)} bi` : '—',
    porque: 'Caindo, o dinheiro parado no Fed volta para o sistema. Perto de zero, esse colchão acabou.',
  })

  // inflação
  const cpi = bls.data?.cpiAa
  const cpiAgora = ultimo(cpi)
  const cpi3 = haDias(cpi, 92)
  const dCpi = cpiAgora != null && cpi3 != null ? cpiAgora - cpi3 : null
  votos.push({
    id: 'cpi',
    nome: 'Inflação CPI (ano a ano, 3 meses)',
    voto: cpiAgora == null ? null : cpiAgora > 3.5 && (dCpi ?? 0) >= 0 ? -1 : (dCpi ?? 0) < -0.2 ? 1 : 0,
    valor: cpiAgora != null ? `${fmt(cpiAgora, 1)}% (${dCpi != null ? `${dCpi > 0 ? '+' : ''}${fmt(dCpi, 1)} p.p.` : '—'})` : '—',
    porque: 'Inflação caindo abre espaço para cortes; alta e subindo prende o Fed.',
  })

  // desemprego
  const des = bls.data?.desemprego
  const desAgora = ultimo(des)
  const des6 = haDias(des, 183)
  const dDes = desAgora != null && des6 != null ? desAgora - des6 : null
  votos.push({
    id: 'des',
    nome: 'Desemprego (6 meses)',
    // subida rápida = risco de recessão (regra de Sahm ~0,5 p.p.)
    voto: dDes == null ? null : dDes >= 0.5 ? -1 : 0,
    valor: desAgora != null ? `${fmt(desAgora, 1)}% (${dDes != null ? `${dDes > 0 ? '+' : ''}${fmt(dDes, 1)} p.p.` : '—'})` : '—',
    porque: 'Subida de 0,5 p.p. ou mais costuma marcar recessão — ruim para risco no curto prazo.',
  })

  // stablecoins: dinheiro novo dentro do cripto
  const st = stables.data
  const stAgora = ultimo(st)
  const st30 = haDias(st, 30)
  const dSt = stAgora != null && st30 != null ? (stAgora / st30 - 1) * 100 : null
  votos.push({
    id: 'stables',
    nome: 'Stablecoins (30 dias)',
    voto: sinal(dSt, 1, -1),
    valor: stAgora != null ? `US$ ${fmt(stAgora / 1e9, 0)} bi (${dSt != null ? `${dSt > 0 ? '+' : ''}${fmt(dSt, 1)}%` : '—'})` : '—',
    porque: 'É o dinheiro novo dentro do cripto: crescendo é bom sinal, encolhendo é ruim.',
  })

  // dominância do BTC
  const dom = global.data?.market_cap_percentage?.btc ?? null
  votos.push({
    id: 'dom',
    nome: 'Dominância do BTC',
    voto: dom == null ? null : dom > 58 ? -1 : dom < 50 ? 1 : 0,
    valor: dom != null ? `${fmt(dom, 1)}%` : '—',
    porque: 'Acima de ~58% o dinheiro está fugindo de altcoins para o BTC.',
  })

  // tendência do BTC (proxy do mercado cripto)
  const p = btc.data
  const m200 = p?.length ? ultimo(sma(p, 200)) : null
  const pAgora = ultimo(p)
  const rel = pAgora != null && m200 ? (pAgora / m200 - 1) * 100 : null
  votos.push({
    id: 'tend',
    nome: 'BTC contra a média de 200 dias',
    voto: sinal(rel, 3, -3),
    valor: rel != null ? `${rel > 0 ? '+' : ''}${fmt(rel, 1)}%` : '—',
    porque: 'Acima da média longa, a tendência do mercado cripto é de alta; abaixo, de baixa.',
  })

  const validos = votos.filter((v) => v.voto != null)
  const soma2 = validos.reduce((s, v) => s + (v.voto ?? 0), 0)
  const nivel: 1 | 2 | 3 | null = validos.length < 5 ? null : soma2 >= 3 ? 1 : soma2 <= -2 ? 3 : 2

  return {
    votos,
    pontos: soma2,
    validos: validos.length,
    nivel,
    fng: ultimo(fng.data?.serie),
    carregando: [juros, tesouro, dolar, stables].some((q) => q.isLoading),
    dados: { juros, tesouro, balanco, rrp, bls, dolar, stables },
  }
}

export const NIVEIS = {
  1: { nome: 'Nível 1 — Expansão', tom: 'ok' as const, ritmo: 'Ambiente favorece risco: dá para seguir o ritmo normal de compras.' },
  2: { nome: 'Nível 2 — Seletivo', tom: 'aviso' as const, ritmo: 'Sinais mistos: comprar devagar e só o que passou em todos os filtros.' },
  3: { nome: 'Nível 3 — Deterioração', tom: 'perigo' as const, ritmo: 'Ambiente hostil a risco: reduzir o ritmo ou esperar. Não fazer nada também é decisão.' },
}
