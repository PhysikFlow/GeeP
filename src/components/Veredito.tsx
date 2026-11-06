import { useState } from 'react'
import { ChevronDown, Hand, Loader2, ShoppingCart, PauseCircle, TrendingDown } from 'lucide-react'
import { useVeredito, type Acao } from '../lib/indicators/veredito'

const OPCOES: { acao: Acao; texto: string; Icone: typeof ShoppingCart }[] = [
  { acao: 'comprar', texto: 'É hora de comprar', Icone: ShoppingCart },
  { acao: 'nada', texto: 'É hora de não fazer nada', Icone: PauseCircle },
  { acao: 'vender', texto: 'É hora de vender', Icone: TrendingDown },
]

/** Cabeçalho da análise: o veredito em uma linha, com o porquê logo abaixo. */
export function Veredito() {
  const v = useVeredito()
  const [aberto, setAberto] = useState(false)

  return (
    <section className={`veredito acao-${v.acao}`} aria-live="polite">
      <div className="veredito-topo">
        <span className="veredito-base">Baseado exclusivamente nos dados disponíveis</span>
        {!v.pronto && (
          <span className="muted-2" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <Loader2 size={13} className="gira" /> juntando os dados…
          </span>
        )}
      </div>
      <div className="veredito-opcoes" role="list">
        {OPCOES.map(({ acao, texto, Icone }) => (
          <div key={acao} role="listitem" className={`veredito-opcao ${acao}${v.acao === acao && v.pronto ? ' ativa' : ''}`} aria-current={v.acao === acao && v.pronto}>
            <Icone size={18} />
            <span>{texto}</span>
          </div>
        ))}
      </div>
      {v.quieto.length > 0 && (
        <div className="veredito-quieto">
          <Hand size={16} />
          <div>
            <b>{v.acao === 'nada' ? 'E é melhor ficar quieto.' : 'Mas é melhor ficar quieto por enquanto.'}</b>
            <ul>
              {v.quieto.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <ul className="veredito-porques">
        {v.porques.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <button className="btn quiet sm" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}>
        Como é decidido <ChevronDown size={13} style={{ transform: aberto ? 'rotate(180deg)' : undefined }} />
      </button>
      {aberto && (
        <div className="explica veredito-regra">
          <p>
            Dois eixos do método: o <b>preço</b> (termômetro do ciclo, média de 9 indicadores de valuation do BTC) e o <b>ambiente</b> (regime
            de mercado pela soma de 11 sinais macro e de liquidez).
          </p>
          <p>
            <b>Comprar</b>: termômetro ≤ 35 com regime 1 ou 2, ou ≤ 20 em qualquer regime. <b>Vender</b>: termômetro ≥ 75, ou ≥ 60 com regime 3.{' '}
            <b>Não fazer nada</b>: o resto.
          </p>
          <p>
            <b>Ficar quieto</b> é um aviso à parte, que pode vir junto de qualquer veredito: dados faltando, preço e ambiente apontando para lados
            opostos, volatilidade acima de 75% ao ano ou movimento de 7% em 24 h, funding acima de 40% ou abaixo de −20% ao ano, hack acima de US$
            100 mi na semana, ou Medo &amp; Ganância em 10 ou menos, ou 90 ou mais. Nessas horas, esperar costuma custar menos do que errar.
          </p>
          <p>
            Comprar aqui significa o ritmo da carteira (BTC/ETH e o que passou na triagem e no dossiê), nunca "qualquer coisa". Não é
            recomendação de investimento.
          </p>
        </div>
      )}
    </section>
  )
}
