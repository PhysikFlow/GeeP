import { useCicloBtc } from './ciclo'
import { useFundingAgora } from './fontes'
import { useHacks, useRegime } from './macro'
import { useMercado } from '../precos'

// VEREDITO: uma frase só, tirada exclusivamente dos dados na tela.
//
// Dois eixos, um de cada etapa do método:
//   preço  -> termômetro do ciclo (0 = fundo histórico, 100 = topo)
//   ambiente -> regime de mercado (1 expansão, 2 seletivo, 3 deterioração)
//
//   VENDER   termômetro ≥ 75, ou ≥ 60 com regime 3
//   COMPRAR  termômetro ≤ 35 com regime 1 ou 2, ou ≤ 20 em qualquer regime
//   NADA     todo o resto
//
// "Melhor ficar quieto" é um aviso À PARTE, que pode acompanhar qualquer
// veredito: dado faltando, sinais brigando, volatilidade ou alavancagem
// extremas, hack grande recente. Nessas horas o erro mais caro é agir por
// impulso, então vale esperar a poeira baixar mesmo quando o veredito é agir.

export type Acao = 'comprar' | 'nada' | 'vender'

export type Veredito = {
  acao: Acao
  porques: string[]
  quieto: string[]
  termometro: number | null
  nivel: 1 | 2 | 3 | null
  pronto: boolean
}

export function useVeredito(): Veredito {
  const ciclo = useCicloBtc()
  const regime = useRegime()
  const funding = useFundingAgora()
  const hacks = useHacks()
  const mercado = useMercado()

  const V = ciclo.termometro
  const R = regime.nivel
  const porques: string[] = []
  const quieto: string[] = []

  let acao: Acao = 'nada'
  if (V != null && R != null) {
    const v = Math.round(V)
    if (V >= 75 || (V >= 60 && R === 3)) {
      acao = 'vender'
      porques.push(V >= 75 ? `Termômetro do ciclo em ${v}/100: zona que historicamente marcou topos.` : `Termômetro em ${v}/100 (caro) com o ambiente em deterioração (nível 3).`)
    } else if ((V <= 35 && R !== 3) || V <= 20) {
      acao = 'comprar'
      porques.push(
        V <= 20
          ? `Termômetro do ciclo em ${v}/100: zona de acumulação histórica, mesmo com o ambiente nível ${R}.`
          : `Termômetro em ${v}/100 (barato) e ambiente nível ${R}, que não é de deterioração.`,
      )
    } else {
      porques.push(
        V > 35 && V < 60
          ? `Termômetro em ${v}/100: preço no meio do ciclo, sem vantagem clara para comprar nem para vender.`
          : V <= 35
            ? `Termômetro em ${v}/100 (barato), mas o ambiente está em deterioração (nível 3): o método pede esperar.`
            : `Termômetro em ${v}/100 (aquecido), mas o ambiente ainda não deteriorou (nível ${R}).`,
      )
    }
    porques.push(`Regime nível ${R}: ${regime.pontos > 0 ? '+' : ''}${regime.pontos} pontos em ${regime.validos} sinais de juros, dólar, liquidez e cripto.`)
  } else {
    porques.push('Ainda faltam dados para os dois eixos (preço e ambiente).')
  }

  // ---- por que ficar quieto ----
  const comNota = ciclo.componentes.filter((c) => c.nota != null).length
  if (V == null || R == null || comNota < 6 || regime.validos < 8)
    quieto.push(`Dados incompletos: ${comNota} de ${ciclo.componentes.length || 9} indicadores de ciclo e ${regime.validos} de ${regime.votos.length} sinais de regime responderam.`)
  if (V != null && R != null && ((V <= 35 && R === 3) || (V >= 60 && R === 1)))
    quieto.push(V <= 35 ? 'Sinais em conflito: preço barato, ambiente ruim. Barato pode ficar mais barato.' : 'Sinais em conflito: preço caro, ambiente bom. Caro pode ficar mais caro.')
  const vol = ciclo.calc?.vol
  if (vol != null && vol > 75) quieto.push(`Volatilidade de ${Math.round(vol)}% ao ano no BTC: o preço de hoje diz pouco sobre o de amanhã.`)
  const v24 = mercado.data?.BTC.var24h
  if (v24 != null && Math.abs(v24) >= 7) quieto.push(`BTC ${v24 > 0 ? 'subiu' : 'caiu'} ${Math.abs(v24).toFixed(1).replace('.', ',')}% em 24 h: movimento brusco, espere assentar.`)
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
  const fng = regime.fng
  if (fng != null && (fng <= 10 || fng >= 90)) quieto.push(`Medo & Ganância em ${fng}: emoção no extremo, quando decisões por impulso custam mais caro.`)

  return { acao, porques, quieto, termometro: V, nivel: R, pronto: V != null && R != null }
}
