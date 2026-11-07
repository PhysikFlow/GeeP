import { useState } from 'react'
import { ChevronDown, Hand, Landmark, Loader2, ShieldCheck, ShoppingCart, PauseCircle, TrendingDown } from 'lucide-react'
import { useVeredito, type Acao, type Parcela } from '../lib/indicators/veredito'

const PARCELA: Record<Exclude<Parcela, null>, string> = {
  normal: 'Em parcelas, no ritmo normal',
  metade: 'Em parcelas, na metade do ritmo',
  seguro: 'Opcional: só uma parcela de seguro (10–20% de uma parcela normal)',
}

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
      {v.parcela && v.realidade && (
        <div className={`veredito-parcela ${v.parcela}`}>
          <ShieldCheck size={16} />
          <div>
            <b>{PARCELA[v.parcela]}.</b> {v.realidade}
          </div>
        </div>
      )}
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
      <div className="regua" aria-label={`Régua de capitulação: ${v.sinais} de 6`}>
        <span className="regua-titulo">
          Régua de capitulação <b>{v.sinais}/6</b>
        </span>
        {v.regua.map((r) => (
          <span key={r.id} className={`regua-sinal${r.ativo ? ' on' : ''}${r.ativo == null ? ' sem' : ''}`} title={`${r.nome}: ${r.valor}`}>
            <i />
            {r.nome.split(' (')[0]}
          </span>
        ))}
      </div>
      {v.esperar && (
        <p className="veredito-esperar">
          <Landmark size={13} /> Custo de esperar: parado na renda fixa rende a Selic de{' '}
          <b>{v.esperar.selic.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% a.a.</b>, cerca de{' '}
          <b>{v.esperar.real.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</b> acima da inflação. Comprar só faz sentido com folga sobre isso.
        </p>
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
            Conservador de propósito: <b>na dúvida, não fazer nada</b>. Três eixos: o <b>preço</b> (termômetro do ciclo, média de 9 indicadores
            de valuation do BTC), o <b>ambiente</b> (regime de mercado, soma de 11 sinais macro e de liquidez) e a <b>régua de capitulação</b> (6
            sinais que, no passado, só apareceram perto de fundos).
          </p>
          <p>
            <b>Comprar</b>: regime 1 com termômetro ≤ 35 (ritmo normal), ou regime 2 com termômetro ≤ 30 e pelo menos 1 sinal de capitulação
            (metade do ritmo). <b>Com regime 3, nunca é "comprar"</b>: barato costuma ficar mais barato. <b>Vender</b>: termômetro ≥ 75, ou ≥ 60
            com regime 3. <b>Não fazer nada</b>: o resto.
          </p>
          <p>
            <b>Parcela de seguro</b>: só com regime 3 e capitulação forte (termômetro ≤ 20 e 3 sinais, ou 5 sinais). O mais provável continua
            sendo aparecer preço melhor; a parcela existe para o cenário menos provável de o fundo ser agora — pelo menos você terá comprado
            um pouco. 10 a 20% de uma parcela normal, no máximo uma por semana.
          </p>
          <p>
            <b>Ficar quieto</b> é um aviso à parte: dados faltando, preço e ambiente em lados opostos, volatilidade acima de 75% ao ano ou
            movimento de 7% em 24 h, funding acima de 40% ou abaixo de −20% ao ano, hack acima de US$ 100 mi na semana, ou Medo &amp; Ganância
            em 10 ou menos, ou 90 ou mais.
          </p>
          <p>Comprar aqui é o ritmo da carteira (BTC/ETH e o que passou na triagem e no dossiê), nunca "qualquer coisa". Não é recomendação de investimento.</p>
        </div>
      )}
    </section>
  )
}
