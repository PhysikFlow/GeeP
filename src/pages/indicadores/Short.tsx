import { useState } from 'react'
import { Ban, CircleCheck, CircleHelp, CircleX, HelpCircle, TrendingDown } from 'lucide-react'
import { COR, COR_NATIVO } from '../../lib/cores'
import { dinheiro, fixo } from '../../lib/format'
import { sma } from '../../lib/indicators/calc'
import { useVelasOhlc } from '../../lib/indicators/fontes'
import { ALAVANCAGEM, useShort, type AnaliseShort, type Checagem, type VereditoShort } from '../../lib/indicators/short'
import type { Serie } from '../../lib/precos'
import type { Nativo } from '../../lib/store'
import { Grafico } from '../../components/Grafico'
import { Aviso, Esqueleto, Painel, Segmentado } from '../../components/ui'

const ATIVOS: Nativo[] = ['BTC', 'ETH', 'SOL']

const VER: Record<VereditoShort, { texto: string; classe: string; Icone: typeof Ban }> = {
  shortar: { texto: 'Dá para shortar (2x)', classe: 'perigo', Icone: TrendingDown },
  indefinido: { texto: 'Não dá para dizer', classe: 'neutro', Icone: CircleHelp },
  longe: { texto: 'Fique longe dessa ideia', classe: 'ok', Icone: Ban },
}

export default function Short() {
  const [ativo, setAtivo] = useState<Nativo>('BTC')
  return (
    <>
      <Aviso>
        Short considera sempre <b>{ALAVANCAGEM}x de alavancagem</b> (perpétuo com margem isolada): uma alta de ~50% liquida a posição, o
        prejuízo não tem teto e o funding pode virar custo. Por isso o padrão aqui é <b>"fique longe"</b> — "dá para shortar" só aparece
        quando tendência, ponto de entrada e derivativos concordam ao mesmo tempo, e o alvo paga pelo menos 2× o risco.
      </Aviso>

      <div className="grid g3" style={{ marginTop: 14 }}>
        {ATIVOS.map((a) => (
          <CartaoShort key={a} ativo={a} selecionado={ativo === a} onClick={() => setAtivo(a)} />
        ))}
      </div>

      <div className="section-title">
        <h2>Detalhe</h2>
        <Segmentado rotulo="Ativo" valor={ativo} opcoes={ATIVOS.map((a) => ({ valor: a, rotulo: a }))} onChange={setAtivo} />
      </div>
      <Detalhe ativo={ativo} />

      <p className="muted-2" style={{ fontSize: 11.5, marginTop: 12 }}>
        Pesos e limites são pontos de partida, <b>sem backtest</b>: as notas mostram quantos critérios passaram, não probabilidade de lucro.
        Dados: velas diárias e derivativos da Binance, contexto de ciclo e regime das outras abas. Liquidações agregadas (CoinGlass) ficam de
        fora. Não é recomendação de investimento.
      </p>
    </>
  )
}

function CartaoShort({ ativo, selecionado, onClick }: { ativo: Nativo; selecionado: boolean; onClick: () => void }) {
  const { analise: a, carregando } = useShort(ativo)
  const ver = a ? VER[a.veredito] : null
  return (
    <button className={`panel short-cartao${selecionado ? ' sel' : ''}`} onClick={onClick}>
      <div className="short-topo">
        <span className="chip-rede" style={{ ['--cor' as string]: COR_NATIVO[ativo] }}>
          {ativo}
        </span>
        {a && <b className="num">{dinheiro(a.preco)}</b>}
      </div>
      {carregando || !a || !ver ? (
        <Esqueleto h={70} />
      ) : (
        <>
          <div className={`short-veredito ${ver.classe}`}>
            <ver.Icone size={16} /> {ver.texto}
          </div>
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
            {a.porque}
          </p>
          <div className="short-notas">
            <Nota rotulo="Viés de baixa" v={a.nota.vies} />
            <Nota rotulo="Entrada" v={a.nota.entrada} />
            <Nota rotulo="Risco ok" v={a.nota.risco} />
          </div>
        </>
      )}
    </button>
  )
}

function Nota({ rotulo, v }: { rotulo: string; v: number }) {
  return (
    <div className="short-nota">
      <span>{rotulo}</span>
      <div className="barra">
        <i style={{ width: `${v}%`, ['--cor' as string]: COR.eth }} />
      </div>
      <b className="num">{v}</b>
    </div>
  )
}

function Lista({ titulo, itens }: { titulo: string; itens: Checagem[] }) {
  return (
    <Painel titulo={titulo} sub={`${itens.filter((c) => c.ok).length} de ${itens.length}`}>
      <div className="leitura">
        {itens.map((c) => (
          <div key={c.id} className={`leitura-item ${c.ok ? 'ok' : c.ok === false ? 'perigo' : ''}`}>
            {c.ok ? <CircleCheck size={15} /> : c.ok === false ? <CircleX size={15} /> : <HelpCircle size={15} />}
            <div>
              {c.nome}
              <div className="muted-2" style={{ fontSize: 11.5 }}>
                {c.valor}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Painel>
  )
}

function Detalhe({ ativo }: { ativo: Nativo }) {
  const { analise: a, carregando, erro } = useShort(ativo)
  const velas = useVelasOhlc(ativo === 'BTC' ? 'BTCUSDT' : ativo === 'ETH' ? 'ETHUSDT' : 'SOLUSDT')
  if (erro && !a) return <Aviso tom="erro">Não consegui os dados da Binance agora: {erro.message}</Aviso>
  if (carregando || !a) return <Esqueleto h={300} />
  const p = a.plano!
  const closes: Serie = (velas.data ?? []).map((x) => [x.t, x.c])
  const desde = Math.floor(Date.now() / 1000) - 180 * 86400
  const ver = VER[a.veredito]

  return (
    <>
      <div className={`short-faixa ${ver.classe}`}>
        <ver.Icone size={18} />
        <div>
          <b>
            {ativo}: {ver.texto}
          </b>
          <div>{a.porque}</div>
        </div>
      </div>

      {a.vetos.length > 0 && (
        <Painel titulo="Por que ficar longe" sub="Qualquer um destes basta">
          <div className="leitura">
            {a.vetos.map((v) => (
              <div key={v} className="leitura-item perigo">
                <Ban size={15} />
                <div>{v}</div>
              </div>
            ))}
          </div>
        </Painel>
      )}

      <div className="grid g3">
        <Lista titulo="Viés: a tendência é de baixa?" itens={a.vies} />
        <Lista titulo="Entrada: é um bom ponto agora?" itens={a.entrada} />
        <Lista titulo="Risco: há sinal de squeeze?" itens={a.risco} />
      </div>

      <div className="grid g-1-2">
        <Painel
          titulo={`Se fosse abrir agora (${ALAVANCAGEM}x)`}
          pe="Stop na máxima dos últimos 20 dias + ¼ de ATR (no máximo 15%); alvo no suporte mais próximo pelo menos 3% abaixo. Resultados sobre a margem, sem taxas de corretora."
        >
          <div className="detalhes">
            <div>
              <span>Entrada</span>
              <b>{dinheiro(p.entrada)}</b>
            </div>
            <div>
              <span>Stop (invalidação)</span>
              <b className="desce">
                {dinheiro(p.stop)} (+{fixo(p.stopPct, 1)}%)
              </b>
            </div>
            <div>
              <span>Alvo</span>
              <b className="sobe">{p.alvo ? `${dinheiro(p.alvo)} (−${fixo(p.alvoPct, 1)}%)` : 'sem suporte abaixo'}</b>
            </div>
            <div>
              <span>Retorno ÷ risco</span>
              <b className={p.rr != null && p.rr >= 2 ? 'sobe' : 'desce'}>{p.rr != null ? `${fixo(p.rr, 1)}×` : '—'}</b>
            </div>
            <div>
              <span>Perda na margem se bater o stop</span>
              <b className="desce">−{fixo(p.perdaMargem, 1)}%</b>
            </div>
            <div>
              <span>Ganho na margem se bater o alvo</span>
              <b className="sobe">{p.ganhoMargem != null ? `+${fixo(p.ganhoMargem, 1)}%` : '—'}</b>
            </div>
            <div>
              <span>Liquidação ({ALAVANCAGEM}x isolada)</span>
              <b>
                {dinheiro(p.liquidacao)} (+{fixo((p.liquidacao / p.entrada - 1) * 100, 0)}%)
              </b>
            </div>
            <div>
              <span>Funding por dia, na margem</span>
              <b className={p.fundingDia == null ? '' : p.fundingDia >= 0 ? 'sobe' : 'desce'}>
                {p.fundingDia == null ? '—' : `${p.fundingDia >= 0 ? 'recebe' : 'paga'} ${fixo(Math.abs(p.fundingDia), 3)}%`}
              </b>
            </div>
          </div>
        </Painel>
        <Painel titulo="Preço, médias e níveis do plano" sub="180 dias">
          <div style={{ padding: '4px 6px 0' }}>
            <Grafico
              altura={260}
              desde={desde}
              formato={(x) => dinheiro(x)}
              linhas={[
                { valor: p.stop, cor: COR.critico, rotulo: 'stop' },
                ...(p.alvo ? [{ valor: p.alvo, cor: COR.bom, rotulo: 'alvo' }] : []),
              ]}
              series={[
                { nome: ativo, dados: closes, cor: COR.texto, largura: 2 },
                { nome: 'Média 20', dados: sma(closes, 20), cor: COR.stable, largura: 1 },
                { nome: 'Média 50', dados: sma(closes, 50), cor: COR.eth, largura: 1 },
                { nome: 'Média 200', dados: sma(closes, 200), cor: COR.btc, largura: 1 },
              ]}
            />
          </div>
        </Painel>
      </div>
      <ExplicaRegra a={a} />
    </>
  )
}

function ExplicaRegra({ a }: { a: AnaliseShort }) {
  return (
    <details className="panel short-regra">
      <summary>Como o veredito de short é decidido</summary>
      <div className="explica">
        <p>
          <b>Fique longe</b> se qualquer veto aparecer: ambiente em expansão (regime 1); menos de 4 critérios de viés; BTC na zona de fundo do
          ciclo (termômetro ≤ 25) ou com 2+ sinais de capitulação — vale para ETH e SOL também, que acompanham o BTC; funding muito negativo
          (shorts lotados); queda já esticada (2,5 ATR abaixo da média de 20) ou RSI abaixo de 30; stop técnico a mais de 15%.
        </p>
        <p>
          <b>Dá para shortar</b> só com viés ≥ 70 (e regime 3, ou viés ≥ 85), entrada ≥ 66, risco ≥ 75 e alvo de pelo menos 2× o risco.{' '}
          <b>Não dá para dizer</b> é todo o resto: a direção pode até ser de queda, mas falta um ponto de entrada ou a conta não fecha.
        </p>
        <p>
          Para {a.ativo === 'BTC' ? 'o BTC, o critério extra é o preço não estar barato no ciclo' : `${a.ativo}, o critério extra é estar mais fraco que o BTC (${a.ativo}/BTC abaixo da média de 50 dias)`}.
        </p>
      </div>
    </details>
  )
}
