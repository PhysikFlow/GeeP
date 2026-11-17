import { useState } from 'react'
import { ChevronDown, ExternalLink, Hand, Landmark, Loader2, ShieldCheck, ShoppingCart, PauseCircle, TrendingDown } from 'lucide-react'
import { dinheiro, fixo } from '../lib/format'
import { useConversao } from '../lib/precos'
import { useVeredito, type Acao, type Parcela, type Veredito as V } from '../lib/indicators/veredito'

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
export function Veredito({ compacto }: { compacto?: boolean }) {
  const v = useVeredito()
  const [aberto, setAberto] = useState(false)
  const [fora, setFora] = useState(false)

  if (compacto) {
    const ativa = OPCOES.find((o) => o.acao === v.acao)!
    return (
      <a className={`veredito veredito-compacto acao-${v.acao}`} href="#/indicadores/geral" aria-live="polite">
        <span className="veredito-base">Veredito</span>
        {v.pronto ? (
          <span className={`veredito-opcao ${v.acao} ativa`}>
            <ativa.Icone size={15} /> {ativa.texto}
          </span>
        ) : (
          <Loader2 size={13} className="gira" />
        )}
        {v.parcela === 'seguro' && <span className="muted">· parcela de seguro opcional</span>}
        {v.quieto.length > 0 && (
          <span className="veredito-quieto-mini">
            <Hand size={13} /> melhor ficar quieto
          </span>
        )}
        <span className="muted-2" style={{ marginLeft: 'auto' }}>
          detalhes e zonas de preço →
        </span>
      </a>
    )
  }

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
      {v.zonas.length > 0 && v.preco && <Zonas v={v} />}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button className="btn quiet sm" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}>
          Como é decidido <ChevronDown size={13} style={{ transform: aberto ? 'rotate(180deg)' : undefined }} />
        </button>
        <button className="btn quiet sm" onClick={() => setFora((a) => !a)} aria-expanded={fora}>
          O que fica fora do cálculo <ChevronDown size={13} style={{ transform: fora ? 'rotate(180deg)' : undefined }} />
        </button>
      </div>
      {fora && <ForaDoCalculo />}
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

function Zonas({ v }: { v: V }) {
  const { moeda, conv } = useConversao()
  const p0 = v.preco!
  const preco = (p: number | null, vazio: string) =>
    p == null ? (
      <span className="muted-2">{vazio}</span>
    ) : (
      <>
        <b>{dinheiro(conv(p), moeda)}</b>
        <span className="sub">{Math.abs(p / p0 - 1) < 0.001 ? 'já está aqui' : `${p > p0 ? '+' : ''}${fixo((p / p0 - 1) * 100, 0)}% do preço atual`}</span>
      </>
    )
  const NOMES = { 1: 'Nível 1 · expansão', 2: 'Nível 2 · seletivo', 3: 'Nível 3 · deterioração' }
  return (
    <div className="zonas">
      <div className="zonas-topo">
        <b>Em que preço do BTC o veredito mudaria</b>
        <span className="muted-2">BTC hoje: {dinheiro(conv(p0), moeda)}</span>
      </div>
      <div className="tabela-wrap">
        <table className="tabela">
          <thead>
            <tr>
              <th>Regime</th>
              <th>Comprar abaixo de</th>
              <th>Parcela de seguro abaixo de</th>
              <th>Vender acima de</th>
            </tr>
          </thead>
          <tbody>
            {v.zonas.map((z) => (
              <tr key={z.nivel} className={z.nivel === v.nivel ? 'zona-atual' : undefined}>
                <td>
                  {NOMES[z.nivel]}
                  {z.nivel === v.nivel && <span className="sub">← o de agora</span>}
                </td>
                <td>{preco(z.comprar, z.nivel === 3 ? 'nunca: regime 3 não compra' : 'não chega nem a −75%')}</td>
                <td>{preco(z.seguro, z.nivel === 3 ? 'não chega nem a −75%' : '— (só no regime 3)')}</td>
                <td>{preco(z.vender, 'acima de 5×')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted-2 zonas-aviso">
        Guia, não bola de cristal. É o preço em que as regras de hoje virariam se <b>só o preço</b> mexesse: médias, preço realizado, regime e
        sinais andam todo dia, e quando o preço chegar lá o resto pode estar pior (e o gatilho, mais baixo). RSI e Medo &amp; Ganância ficam
        parados no cálculo; na prática caem junto com o preço. Não deixe ordem parada nesses valores — use como alerta para olhar de novo.
      </p>
    </div>
  )
}

const FORA: { nome: string; porque: string; uso: string; link: string; fonte: string }[] = [
  {
    nome: 'Probabilidade da próxima decisão do Fed',
    porque: 'Antecipa cortes ou altas de juros antes do Fed funds mudar.',
    uso: 'O app usa o T-bill de 3 meses como aproximação. Perto de reunião do Fed, confira se o mercado mudou de ideia.',
    link: 'https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html',
    fonte: 'CME FedWatch',
  },
  {
    nome: 'Spread de crédito high yield',
    porque: 'Termômetro de medo no mercado tradicional; costuma abrir antes de quedas fortes de risco.',
    uso: 'Se estiver subindo rápido ou acima de ~5%, trate o regime como um nível pior do que o app mostra.',
    link: 'https://fred.stlouisfed.org/series/BAMLH0A0HYM2',
    fonte: 'FRED (sem acesso pelo navegador)',
  },
  {
    nome: 'Fluxo dos ETFs por emissor',
    porque: 'Demanda institucional dia a dia.',
    uso: 'O app mostra o total quando a cota grátis do bitcoin-data permite. Saídas grandes por vários dias seguidos pesam contra comprar.',
    link: 'https://farside.co.uk/btc/',
    fonte: 'Farside',
  },
  {
    nome: 'Liquidações em 24 h',
    porque: 'Explica quedas e altas bruscas (cascatas de alavancagem).',
    uso: 'O app já pede para ficar quieto em movimento de 7% em 24 h; aqui você vê se foi cascata.',
    link: 'https://www.coinglass.com/LiquidationData',
    fonte: 'CoinGlass',
  },
  {
    nome: 'Notícias que mudam fatos',
    porque: 'Hack em custódia, ação regulatória, decisão do Fed, CPI e emprego.',
    uso: 'Pista para checar na fonte primária, nunca motivo sozinho para comprar ou vender.',
    link: 'https://www.federalreserve.gov/newsevents.htm',
    fonte: 'Fed e fontes primárias',
  },
]

function ForaDoCalculo() {
  return (
    <div className="explica veredito-regra">
      <p>
        O veredito usa só o que chega por API grátis. Estes itens <b>não entram no cálculo</b> e são os que mais valem uma olhada à mão — de
        propósito, não acrescentei mais nada: dado demais de pouca importância só dilui os sinais que contam.
      </p>
      <div className="fora-lista">
        {FORA.map((f) => (
          <div key={f.nome} className="fora-item">
            <b>{f.nome}</b>
            <span>{f.porque}</span>
            <span className="muted-2">{f.uso}</span>
            <a href={f.link} target="_blank" rel="noreferrer">
              {f.fonte} <ExternalLink size={11} />
            </a>
          </div>
        ))}
      </div>
      <p>Unlocks de tokens (Tokenomist) ficam no dossiê de cada token, na Triagem.</p>
    </div>
  )
}
