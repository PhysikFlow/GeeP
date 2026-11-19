import { useBacktest } from '../../lib/backtest'
import { COR } from '../../lib/cores'
import { data, dinheiro, fixo } from '../../lib/format'
import { Grafico } from '../../components/Grafico'
import { Esqueleto, Painel } from '../../components/ui'

const CORES: Record<string, string> = { caixa: COR.muted2, hodl: COR.btc, dca: COR.stable, r1: COR.sol, r2: COR.eth, r3: COR.outros }

export default function Backtest() {
  const b = useBacktest()
  if (!b)
    return (
      <Painel titulo="Backtest das regras">
        <div className="panel-body">
          <Esqueleto h={200} />
        </div>
      </Painel>
    )
  const ord = [...b.estrategias].sort((x, y) => y.final - x.final)
  return (
    <Painel
      titulo="Backtest das regras de preço"
      sub={`${data(b.inicio)} a ${data(b.fim)} · ${b.semanas} decisões semanais · US$ 10 mil · só BTC`}
      pe={
        <>
          <b>Limites:</b> o regime macro não tem histórico grátis, então cada linha "Método" supõe o mesmo regime o tempo todo — não é o veredito
          completo. Os limites do termômetro e a lei de potência foram escolhidos conhecendo os ciclos passados (viés de retrospectiva), e o funding
          fica fora da régua. Caixa parado sem render. Um backtest assim mostra se as regras fazem sentido; não garante o futuro.
        </>
      }
    >
      <div className="tabela-wrap">
        <table className="tabela">
          <thead>
            <tr>
              <th>Estratégia</th>
              <th>Valor final</th>
              <th>Retorno</th>
              <th>Pior queda</th>
              <th className="some-celular">Caixa no fim</th>
              <th className="some-celular">Compras / vendas</th>
            </tr>
          </thead>
          <tbody>
            {ord.map((e) => (
              <tr key={e.id}>
                <td style={{ whiteSpace: 'normal', minWidth: 180 }}>
                  <strong>{e.nome}</strong>
                  <span className="sub">{e.desc}</span>
                </td>
                <td>{dinheiro(e.final, 'USD', true)}</td>
                <td className={e.retorno >= 0 ? 'sobe' : 'desce'}>{fixo(e.retorno, 0)}%</td>
                <td className="desce">{fixo(e.maxQueda, 0)}%</td>
                <td className="some-celular">{dinheiro(e.caixaFinal, 'USD', true)}</td>
                <td className="some-celular">
                  {e.compras} / {e.vendas}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '4px 6px 0' }}>
        <Grafico altura={260} log formato={(v) => dinheiro(v, 'USD', true)} series={b.estrategias.map((e) => ({ nome: e.nome, dados: e.curva, cor: CORES[e.id], largura: 1 }))} />
      </div>
    </Painel>
  )
}
