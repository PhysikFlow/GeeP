import type { Acao, Parcela } from './indicators/veredito'
import type { CarteiraSim, OpSim } from './store'

// SIMULAÇÃO com dinheiro de mentirinha. Custos de verdade: taxa de corretora
// e slippage em cada operação, e o caixa parado rende Selic (o custo de
// oportunidade de "não fazer nada" é positivo no Brasil).

export type AtivoSim = 'BTC' | 'ETH' | 'SOL'
export const TAXA = 0.001 // 0,1% de corretagem
export const SLIPPAGE = 0.001 // 0,1% de escorregão no preço

/** Divisão das compras do robô: o método é guiado pelo BTC. */
export const DIVISAO_METODO: Record<AtivoSim, number> = { BTC: 0.7, ETH: 0.3, SOL: 0 }

/** Caixa com o rendimento da Selic desde caixaDesde. */
export function caixaHoje(c: CarteiraSim, selicPct: number | null, agora = Date.now()) {
  const dias = Math.max(0, (agora - c.caixaDesde) / 86_400_000)
  return c.caixaUsd * (1 + (selicPct ?? 0) / 100) ** (dias / 365)
}

function materializarCaixa(c: CarteiraSim, selic: number | null): CarteiraSim {
  return { ...c, caixaUsd: caixaHoje(c, selic), caixaDesde: Date.now() }
}

/** Compra (usd > 0) ou venda (usd < 0, em dólares) a mercado, com custos. */
export function operar(
  c: CarteiraSim,
  ativo: AtivoSim,
  usd: number,
  preco: number,
  selic: number | null,
  origem: OpSim['origem'],
  metodo: Acao,
  nota?: string,
): CarteiraSim {
  let novo = materializarCaixa(c, selic)
  if (usd > 0) {
    const gasto = Math.min(usd, novo.caixaUsd)
    if (gasto < 1) return c
    const p = preco * (1 + SLIPPAGE)
    const q = (gasto * (1 - TAXA)) / p
    novo = { ...novo, caixaUsd: novo.caixaUsd - gasto, qtd: { ...novo.qtd, [ativo]: novo.qtd[ativo] + q } }
    novo.ops = [...novo.ops, { t: Date.now(), ativo, qtd: q, preco: p, usd: gasto, origem, metodo, nota }]
  } else {
    const p = preco * (1 - SLIPPAGE)
    const q = Math.min(novo.qtd[ativo], -usd / preco)
    if (q * p < 1) return c
    const recebe = q * p * (1 - TAXA)
    novo = { ...novo, caixaUsd: novo.caixaUsd + recebe, qtd: { ...novo.qtd, [ativo]: novo.qtd[ativo] - q } }
    novo.ops = [...novo.ops, { t: Date.now(), ativo, qtd: -q, preco: p, usd: -recebe, origem, metodo, nota }]
  }
  return novo
}

const hoje = () => new Date().toISOString().slice(0, 10)
export const roboJaRodouHoje = (c: CarteiraSim) => c.ultimoRobo === hoje()

/**
 * O que o método faria hoje, executado como um humano disciplinado mas
 * imperfeito: às vezes esquece, varia o valor, e de vez em quando faz um
 * aporte mínimo mesmo quando o método manda esperar. Uma rodada por dia.
 * Parcela "normal" = 5% do capital inicial.
 */
export function rodarMetodo(
  c: CarteiraSim,
  acao: Acao,
  parcela: Parcela,
  precos: Record<AtivoSim, number>,
  selic: number | null,
  rnd: () => number = Math.random,
): { carteira: CarteiraSim; resumo: string } {
  const base = c.inicialUsd * 0.05
  let novo: CarteiraSim = { ...c, ultimoRobo: hoje() }
  const jitter = 0.6 + rnd() * 0.6 // 60% a 120% do valor
  if (rnd() < 0.2) return { carteira: novo, resumo: 'Hoje "esqueceu" de olhar o app — nada feito (acontece com humanos).' }

  if (acao === 'vender') {
    const fr = 0.1 * jitter
    let vendeu = 0
    for (const a of ['BTC', 'ETH', 'SOL'] as AtivoSim[]) {
      const usd = novo.qtd[a] * precos[a] * fr
      if (usd >= 1) {
        novo = operar(novo, a, -usd, precos[a], selic, 'metodo', acao, 'Venda parcial pelo método')
        vendeu += usd
      }
    }
    return { carteira: novo, resumo: vendeu ? `Método disse vender: realizou ~${Math.round(fr * 100)}% das posições (US$ ${vendeu.toFixed(0)}).` : 'Método disse vender, mas não há posição.' }
  }

  let valor = 0
  let motivo = ''
  if (acao === 'comprar') {
    valor = (parcela === 'metade' ? base / 2 : base) * jitter
    motivo = parcela === 'metade' ? 'Compra na metade do ritmo' : 'Compra no ritmo normal'
  } else if (parcela === 'seguro') {
    if (rnd() < 0.6) {
      valor = base * (0.1 + rnd() * 0.1)
      motivo = 'Parcela de seguro'
    } else return { carteira: novo, resumo: 'Parcela de seguro era opcional: preferiu não fazer.' }
  } else if (rnd() < 0.07) {
    valor = base * 0.05 * jitter
    motivo = 'Aporte mínimo por ansiedade, mesmo com o método mandando esperar'
  } else {
    return { carteira: novo, resumo: 'Método disse não fazer nada: nada feito.' }
  }

  for (const a of ['BTC', 'ETH', 'SOL'] as AtivoSim[]) {
    const fatia = valor * DIVISAO_METODO[a]
    if (fatia >= 1) novo = operar(novo, a, fatia, precos[a], selic, 'metodo', acao, motivo)
  }
  return { carteira: novo, resumo: `${motivo}: US$ ${valor.toFixed(0)} (70% BTC, 30% ETH).` }
}

export function valorSim(c: CarteiraSim, precos: Record<AtivoSim, number>, selic: number | null) {
  return caixaHoje(c, selic) + (['BTC', 'ETH', 'SOL'] as AtivoSim[]).reduce((s, a) => s + c.qtd[a] * precos[a], 0)
}

/**
 * Placar de cada operação manual contra o que o método dizia na hora:
 * comprou contra o método e o preço caiu -> "o método avisou";
 * comprou contra e subiu -> o método errou, admita. Igual para vendas.
 * Antes de 7 dias, ou com movimento menor que 2%, ainda não julga.
 */
export function placar(c: CarteiraSim, precos: Record<AtivoSim, number>) {
  return c.ops
    .filter((o) => o.origem === 'manual')
    .map((o) => {
      const compra = o.qtd > 0
      const seguiu = compra ? o.metodo === 'comprar' : o.metodo === 'vender'
      const variacao = (precos[o.ativo] / o.preco - 1) * 100
      const acertou = compra ? variacao > 0 : variacao < 0
      let juiz: string
      // Só julga depois de 7 dias e com movimento acima de 2%: antes disso é
      // ruído (o próprio slippage já deixa o preço "contra" no primeiro minuto).
      const dias = (Date.now() - o.t) / 86_400_000
      if (dias < 7 || Math.abs(variacao) < 2) juiz = `Cedo para julgar (${Math.floor(dias)} de 7 dias, movimento ${variacao.toFixed(1).replace('.', ',')}%).`
      else if (seguiu) juiz = acertou ? 'Seguiu o método e deu certo.' : 'Seguiu o método e deu errado — o método errou aqui.'
      else if (o.metodo === 'nada' || (!compra && o.metodo === 'comprar') || (compra && o.metodo === 'vender'))
        juiz = acertou ? 'Foi contra o método e acertou: o método errou, admita.' : 'Foi contra o método e errou: eu avisei.'
      else juiz = '—'
      return { op: o, seguiu, variacao, acertou, juiz }
    })
}
