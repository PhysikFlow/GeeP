import type { Dossie } from '../store'

// Etapa 5 do método: nota de 0 a 100 com pesos fixos e regras de decisão.

export const CRITERIOS: { id: keyof Dossie['notas']; nome: string; max: number; guia: string }[] = [
  { id: 'adocao', nome: 'Adoção e economia', max: 30, guia: 'Uso real em 90 dias a 1 ano: usuários, taxas pagas, receita retida. Orgânico ou comprado com incentivo?' },
  { id: 'tokenomics', nome: 'Tokenomics e captura de valor', max: 25, guia: 'Circulante × total, unlocks dos próximos 12 meses, concentração em time e fundos, mecanismo exato pelo qual a receita chega ao token.' },
  { id: 'competitiva', nome: 'Posição competitiva', max: 15, guia: 'As mesmas métricas lado a lado com 2 a 4 rivais.' },
  { id: 'valuation', nome: 'Valuation', max: 15, guia: 'Cenários pessimista, base e otimista para 12–36 meses, já descontada a diluição.' },
  { id: 'narrativa', nome: 'Narrativa e catalisadores', max: 10, guia: 'Catalisadores concretos com data e caminho até o token — não manchetes.' },
  { id: 'macro', nome: 'Contexto macro', max: 5, guia: 'Sugerido pelo regime de mercado: nível 1 → 5, nível 2 → 3, nível 3 → 1.' },
]

export const TEXTOS: { id: keyof Dossie['textos']; nome: string; dica: string }[] = [
  { id: 'produto', nome: '1. Produto', dica: 'O que faz, quem usa, de quem depende.' },
  { id: 'adocao', nome: '2. Adoção real', dica: 'Usuários, taxas e receita em 90 dias a 1 ano; quanto é orgânico.' },
  { id: 'tokenomics', nome: '3. Tokenomics', dica: 'Unlocks, concentração, mecanismo de recompra/queima/staking, quem pode mudá-lo e se está ativo hoje.' },
  { id: 'concorrencia', nome: '4. Concorrência', dica: 'Métricas contra 2 a 4 rivais.' },
  { id: 'valuation', nome: '5. Valuation', dica: 'Pessimista / base / otimista com premissas explícitas (receita × múltiplo).' },
  { id: 'riscos', nome: '6. Riscos', dica: 'Hacks, governança, regulação, processos, chaves de administrador.' },
  { id: 'bear', nome: 'Bear case', dica: 'O melhor argumento contra, escrito só a partir dos fatos (idealmente por outra pessoa ou outro agente).' },
  { id: 'resposta', nome: 'Resposta ao bear case', dica: 'Item por item: refuto / aceito e já está no preço / aceito e reduzo a nota.' },
  { id: 'invalidacao', nome: 'Condições de invalidação', dica: 'O que, se acontecer, encerra a tese.' },
]

export const ALERTAS: { id: keyof Dossie['alertas']; nome: string }[] = [
  { id: 'fraude', nome: 'Fraude ou indício de fraude' },
  { id: 'seguranca', nome: 'Falha de segurança não resolvida' },
  { id: 'processo', nome: 'Processo judicial relevante' },
  { id: 'diluicao', nome: 'Diluição severa' },
  { id: 'saida', nome: 'Incapacidade de sair da posição' },
]

export const totalDe = (d: Pick<Dossie, 'notas'>) => CRITERIOS.reduce((s, c) => s + Math.min(c.max, Math.max(0, d.notas[c.id] ?? 0)), 0)

export type Decisao = { rotulo: string; tom: 'ok' | 'aviso' | 'perigo'; detalhe: string }

export function decisaoDe(d: Pick<Dossie, 'notas' | 'alertas' | 'textos'>): Decisao {
  const bloqueios = ALERTAS.filter((a) => d.alertas[a.id])
  if (bloqueios.length) return { rotulo: 'Bloqueado', tom: 'perigo', detalhe: `Alerta que bloqueia em qualquer nota: ${bloqueios.map((b) => b.nome.toLowerCase()).join(', ')}.` }
  const t = totalDe(d)
  if (t >= 75) return { rotulo: 'Pode comprar', tom: 'ok', detalhe: `Nota ${t} (≥ 75). O ritmo segue o regime de mercado.` }
  if (t >= 65)
    return d.textos.excecao?.trim()
      ? { rotulo: 'Compra com memo de exceção', tom: 'aviso', detalhe: `Nota ${t} (65–74) com memo de exceção registrado.` }
      : { rotulo: 'Precisa de memo de exceção', tom: 'aviso', detalhe: `Nota ${t} (65–74): só compra com um memo de exceção justificado.` }
  return { rotulo: 'Não compra', tom: 'perigo', detalhe: `Nota ${t} (abaixo de 65).` }
}

export const macroSugerido = (nivel: 1 | 2 | 3 | null) => (nivel === 1 ? 5 : nivel === 2 ? 3 : nivel === 3 ? 1 : 0)
