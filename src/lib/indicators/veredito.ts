import { ultimo } from './calc'
import { useCicloBtc } from './ciclo'
import { useDerivativos, useFundingAgora } from './fontes'
import { useHacks, useRegime, useSelic } from './macro'
import { useMercado } from '../precos'

// VEREDITO, tirado exclusivamente dos dados na tela. CONSERVADOR de propósito:
// na dúvida, "não fazer nada". Três eixos:
//   preço       -> termômetro do ciclo (0 = fundo histórico, 100 = topo)
//   ambiente    -> regime de mercado (1 expansão, 2 seletivo, 3 deterioração)
//   capitulação -> régua de 6 sinais que, no passado, só apareceram perto de
//                  fundos (MVRV < 1, abaixo da média de 200 semanas, NUPL < 0,
//                  Hash Ribbons, funding negativo por dias, medo extremo)
//
//   VENDER   termômetro ≥ 75, ou ≥ 60 com regime 3
//   COMPRAR  regime 1 e termômetro ≤ 35 -> ritmo normal
//            regime 2, termômetro ≤ 30 e ≥ 1 sinal de capitulação -> metade do ritmo
//   NADA     todo o resto — inclusive regime 3, onde nunca é "comprar".
//            Em regime 3 com capitulação forte (termômetro ≤ 20 e ≥ 3 sinais,
//            ou ≥ 5 sinais) aparece só uma PARCELA DE SEGURO: o mais provável
//            ainda é haver preço melhor; ela existe para o cenário menos
//            provável de o fundo ser agora ("pelo menos comprei um pouco").
//
// "Melhor ficar quieto" é um aviso À PARTE, que pode acompanhar qualquer
// veredito: dado faltando, sinais brigando, volatilidade ou alavancagem
// extremas, hack grande recente, emoção no extremo.

export type Acao = 'comprar' | 'nada' | 'vender'
export type Parcela = 'normal' | 'metade' | 'seguro' | null

export type SinalCapitulacao = { id: string; nome: string; ativo: boolean | null; valor: string }

export type Veredito = {
  acao: Acao
  parcela: Parcela
  porques: string[]
  /** O lembrete pé no chão que acompanha qualquer compra. */
  realidade: string | null
  quieto: string[]
  regua: SinalCapitulacao[]
  sinais: number
  esperar: { selic: number; real: number } | null
  termometro: number | null
  nivel: 1 | 2 | 3 | null
  pronto: boolean
}

const f2 = (v: number, c = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })

export function useVeredito(): Veredito {
  const ciclo = useCicloBtc()
  const regime = useRegime()
  const funding = useFundingAgora()
  const fundingBtc = useDerivativos('BTCUSDT')
  const hacks = useHacks()
  const mercado = useMercado()
  const selic = useSelic()

  const V = ciclo.termometro
  const R = regime.nivel
  const porques: string[] = []
  const quieto: string[] = []

  // ---- régua de capitulação ----
  const k = ciclo.calc
  const mvrv = ultimo(ciclo.onchain.cm.data?.mvrv) ?? ciclo.onchain.snapshot.data?.mvrv ?? null
  const nupl = ultimo(ciclo.onchain.nupl.data) ?? (mvrv ? 1 - 1 / mvrv : null)
  const w200 = ultimo(k?.s200w)
  const rib = k?.ribbons ?? []
  const ribAgora = ultimo(rib)
  const ribRecuperou = ribAgora != null && ribAgora >= 1 && rib.slice(-30, -1).some(([, v]) => v < 1)
  const fh = fundingBtc.data?.fundingHist ?? []
  const ult9 = fh.slice(-9) // 3 dias de funding (a cada 8 h)
  const fundingNeg = ult9.length === 9 ? ult9.every(([, v]) => v < 0) : null
  const fng = regime.fng
  const regua: SinalCapitulacao[] = [
    { id: 'mvrv', nome: 'BTC abaixo do preço realizado (MVRV < 1)', ativo: mvrv == null ? null : mvrv < 1, valor: mvrv == null ? '—' : `MVRV ${f2(mvrv)}` },
    { id: 'w200', nome: 'BTC abaixo da média de 200 semanas', ativo: w200 && k ? k.atual < w200 : null, valor: w200 && k ? `${f2(k.atual / w200)}× a média` : '—' },
    { id: 'nupl', nome: 'Mercado no prejuízo (NUPL < 0)', ativo: nupl == null ? null : nupl < 0, valor: nupl == null ? '—' : `NUPL ${f2(nupl)}` },
    {
      id: 'rib',
      nome: 'Hash Ribbons: mineradores saindo da capitulação',
      ativo: ribAgora == null ? null : ribRecuperou,
      valor: ribAgora == null ? '—' : ribAgora < 1 ? 'em capitulação' : ribRecuperou ? 'acabou de virar' : 'normal',
    },
    { id: 'fund', nome: 'Funding do BTC negativo há 3 dias', ativo: fundingNeg, valor: ult9.length ? `${f2(ult9[ult9.length - 1][1], 4)}% agora` : '—' },
    { id: 'fng', nome: 'Medo extremo (Medo & Ganância ≤ 15)', ativo: fng == null ? null : fng <= 15, valor: fng == null ? '—' : String(fng) },
  ]
  const C = regua.filter((s) => s.ativo).length

  // ---- decisão ----
  let acao: Acao = 'nada'
  let parcela: Parcela = null
  if (V != null && R != null) {
    const v = Math.round(V)
    if (V >= 75 || (V >= 60 && R === 3)) {
      acao = 'vender'
      porques.push(V >= 75 ? `Termômetro do ciclo em ${v}/100: zona que historicamente marcou topos.` : `Termômetro em ${v}/100 (caro) com o ambiente em deterioração (nível 3).`)
    } else if (R === 1 && V <= 35) {
      acao = 'comprar'
      parcela = 'normal'
      porques.push(`Termômetro em ${v}/100 (barato) e ambiente em expansão (nível 1).`)
    } else if (R === 2 && V <= 30 && C >= 1) {
      acao = 'comprar'
      parcela = 'metade'
      porques.push(`Termômetro em ${v}/100 (barato), ambiente seletivo (nível 2) e ${C} sinal(is) de capitulação: compra, mas na metade do ritmo.`)
    } else {
      if (R === 3 && ((V <= 20 && C >= 3) || C >= 5)) parcela = 'seguro'
      porques.push(
        V > 35 && V < 60
          ? `Termômetro em ${v}/100: preço no meio do ciclo, sem vantagem clara para comprar nem para vender.`
          : V >= 60
            ? `Termômetro em ${v}/100 (aquecido), mas o ambiente ainda não deteriorou (nível ${R}).`
            : R === 3
              ? `Termômetro em ${v}/100 (barato), mas com o ambiente em deterioração (nível 3) o método não compra: barato costuma ficar mais barato.`
              : `Termômetro em ${v}/100 (barato), mas sem confirmação: ${C} de 6 sinais de capitulação (o nível ${R} pede pelo menos 1 e termômetro ≤ 30).`,
      )
    }
    porques.push(`Regime nível ${R}: ${regime.pontos > 0 ? '+' : ''}${regime.pontos} pontos em ${regime.validos} sinais de juros, dólar, liquidez e cripto.`)
    porques.push(`Régua de capitulação: ${C} de 6 sinais de fundo acesos.`)
  } else {
    porques.push('Ainda faltam dados para os eixos de preço e ambiente.')
  }

  const realidade =
    parcela === 'seguro'
      ? 'O mais provável é ainda aparecer preço melhor. A parcela de seguro existe só para o cenário menos provável de o fundo ser agora — pelo menos você terá comprado um pouco. Tamanho: 10 a 20% de uma parcela normal, no máximo uma por semana.'
      : acao === 'comprar'
        ? 'Ninguém acerta o fundo: é bem possível comprar mais caro do que o preço que ainda vai aparecer nas próximas semanas. Por isso a compra é em parcelas espaçadas, nunca de uma vez.'
        : null

  // ---- por que ficar quieto ----
  const comNota = ciclo.componentes.filter((c) => c.nota != null).length
  if (V == null || R == null || comNota < 6 || regime.validos < 8)
    quieto.push(`Dados incompletos: ${comNota} de ${ciclo.componentes.length || 9} indicadores de ciclo e ${regime.validos} de ${regime.votos.length} sinais de regime responderam.`)
  if (V != null && R != null && ((V <= 35 && R === 3) || (V >= 60 && R === 1)))
    quieto.push(V <= 35 ? 'Sinais em conflito: preço barato, ambiente ruim. Barato pode ficar mais barato.' : 'Sinais em conflito: preço caro, ambiente bom. Caro pode ficar mais caro.')
  const vol = k?.vol
  if (vol != null && vol > 75) quieto.push(`Volatilidade de ${Math.round(vol)}% ao ano no BTC: o preço de hoje diz pouco sobre o de amanhã.`)
  const v24 = mercado.data?.BTC.var24h
  if (v24 != null && Math.abs(v24) >= 7) quieto.push(`BTC ${v24 > 0 ? 'subiu' : 'caiu'} ${f2(Math.abs(v24), 1)}% em 24 h: movimento brusco, espere assentar.`)
  for (const n of ['BTC', 'ETH', 'SOL'] as const) {
    const f = funding.data?.[n]
    if (!f) continue
    const anual = f.funding * 3 * 365 * 100
    if (anual > 40 || anual < -20)
      quieto.push(`Alavancagem extrema em ${n} (funding ${Math.round(anual)}% a.a.): risco de liquidações em cascata para os dois lados.`)
  }
  const corte = Date.now() / 1000 - 7 * 86400
  const grande = (hacks.data ?? []).find((h) => h.date >= corte && (h.amount ?? 0) >= 100e6)
  if (grande) quieto.push(`Hack de ${grande.name} (US$ ${Math.round((grande.amount ?? 0) / 1e6)} mi) nesta semana: risco de contágio ainda sendo medido.`)
  if (fng != null && (fng <= 10 || fng >= 90)) quieto.push(`Medo & Ganância em ${fng}: emoção no extremo, quando decisões por impulso custam mais caro.`)

  return {
    acao,
    parcela,
    porques,
    realidade,
    quieto,
    regua,
    sinais: C,
    esperar: selic.data ? { selic: selic.data.selic, real: selic.data.real } : null,
    termometro: V,
    nivel: R,
    pronto: V != null && R != null,
  }
}
