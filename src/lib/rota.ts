import { useSyncExternalStore } from 'react'

// Rotas por hash (#/carteira, #/indicadores/ciclo…): funciona em qualquer
// hospedagem estática, no PWA instalado e com o botão voltar do Android.

export type Pagina = 'carteira' | 'indicadores' | 'em-breve'
export type AbaIndicadores = 'geral' | 'regime' | 'ciclo' | 'triagem' | 'derivativos' | 'rendimentos' | 'redes'

export const ABAS_INDICADORES: { id: AbaIndicadores; rotulo: string }[] = [
  { id: 'geral', rotulo: 'Visão geral' },
  { id: 'regime', rotulo: 'Regime e macro' },
  { id: 'ciclo', rotulo: 'Ciclo do BTC' },
  { id: 'triagem', rotulo: 'Triagem de tokens' },
  { id: 'derivativos', rotulo: 'Derivativos' },
  { id: 'rendimentos', rotulo: 'Rendimentos DeFi' },
  { id: 'redes', rotulo: 'Redes' },
]

export type Rota = { pagina: Pagina; aba: AbaIndicadores }

function ler(): Rota {
  const [, p, a] = window.location.hash.replace(/^#/, '').split('/')
  const pagina: Pagina = p === 'indicadores' || p === 'em-breve' ? p : 'carteira'
  const aba = (ABAS_INDICADORES.find((x) => x.id === a)?.id ?? 'geral') as AbaIndicadores
  return { pagina, aba }
}

let atual = ler()
const ouvintes = new Set<() => void>()
window.addEventListener('hashchange', () => {
  atual = ler()
  ouvintes.forEach((f) => f())
})

export function useRota() {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f)
      return () => ouvintes.delete(f)
    },
    () => atual,
  )
}

export function irPara(pagina: Pagina, aba?: AbaIndicadores) {
  window.location.hash = pagina === 'indicadores' ? `/indicadores/${aba ?? atual.aba}` : `/${pagina}`
}
