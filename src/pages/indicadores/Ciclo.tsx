import { useState, type ReactNode } from 'react'
import { COR } from '../../lib/cores'
import { compacto, data, dinheiro, numero, fixo } from '../../lib/format'
import { ultimo } from '../../lib/indicators/calc'
import { faixaDoTermometro, useCicloBtc } from '../../lib/indicators/ciclo'
import type { Serie } from '../../lib/precos'
import { Grafico, inicioDaJanela, JANELAS, type Janela, type LinhaRef, type SerieG } from '../../components/Grafico'
import { Medidor } from '../../components/Visuais'
import { Aviso, Esqueleto, Kpi, Painel, Segmentado } from '../../components/ui'

const usd = (v: number) => dinheiro(v, 'USD', true)
const dec = (c: number) => (v: number) => numero(v, c)

export default function Ciclo() {
  const c = useCicloBtc()
  const [janela, setJanela] = useState<Janela>('4a')
  const desde = inicioDaJanela(janela)
  const faixa = faixaDoTermometro(c.termometro)
  const k = c.calc
  const oc = c.onchain
  const limitado = [oc.mvrvZ, oc.etf].some((q) => q.error)

  if (c.erro && !k) return <Aviso tom="erro">Não consegui baixar o histórico do BTC: {c.erro.message}</Aviso>

  return (
    <>
      <div className="grid g-1-2">
        <Painel titulo="Termômetro do ciclo" pe="Nenhum indicador sozinho acerta o topo ou o fundo; a média de vários erra menos.">
          <div className="panel-body">{k ? <Medidor valor={c.termometro} rotulo={faixa.rotulo} escala={['Acumulação', 'Euforia']} /> : <Esqueleto h={150} />}</div>
        </Painel>
        <Painel titulo="Componentes" sub="Posição de cada indicador entre a zona de fundo (verde) e a de topo (vermelho) dos ciclos anteriores">
          <div>
            {c.componentes.map((x) => (
              <div key={x.id} className="nota-linha">
                <div>
                  {x.nome}
                  <small>
                    fundo {x.fundo} · topo {x.topo}
                  </small>
                </div>
                <b className="num" style={{ textAlign: 'right' }}>
                  {x.texto}
                </b>
                <div className="faixa" aria-label={`nota ${x.nota == null ? 'sem dado' : Math.round(x.nota)} de 100`}>
                  {x.nota != null && <i style={{ left: `${x.nota}%` }} />}
                </div>
              </div>
            ))}
            {!k && (
              <div className="panel-body">
                <Esqueleto h={200} />
              </div>
            )}
          </div>
        </Painel>
      </div>

      {c.halving && k && (
        <Painel className="" titulo="Halving e momento do ciclo">
          <div className="kpis">
            <Kpi rotulo="Altura do bloco" valor={numero(c.halving.altura, 0)} />
            <Kpi rotulo="Próximo halving" valor={`~${numero(c.halving.faltam / 144, 0)} dias`} detalhe={`bloco ${numero(c.halving.proximo, 0)} · ~${data(c.halving.data)}`} />
            <Kpi rotulo="Dias desde o último" valor={numero(c.halving.desdeUltimo, 0)} detalhe={`${fixo((c.halving.progresso * 100), 1)}% do ciclo de 4 anos`} />
            <Kpi rotulo="Recompensa do bloco" valor={`${numero(c.halving.recompensa, 3)} BTC`} />
            <Kpi rotulo="Volatilidade 30d" valor={`${fixo(k.vol, 0)}% a.a.`} />
            <Kpi rotulo="Máxima histórica" valor={usd(k.ath)} detalhe={`${fixo((((k.atual / k.ath) - 1) * 100), 1)}% de distância`} />
          </div>
        </Painel>
      )}

      <div className="section-title">
        <h2>Gráficos</h2>
        <Segmentado rotulo="Período" valor={janela} opcoes={JANELAS} onChange={setJanela} />
      </div>
      {limitado && (
        <div style={{ marginBottom: 12 }}>
          <Aviso tom="info">
            O bitcoin-data.com grátis permite 15 consultas por dia; algumas séries on-chain (MVRV-Z, NUPL, preço realizado) voltam assim que o
            limite renovar. O restante é calculado aqui e não tem limite.
          </Aviso>
        </div>
      )}

      {!k ? (
        <Esqueleto h={320} />
      ) : (
        <>
          <PainelGrafico
            titulo="Preço do BTC e suas âncoras"
            explica="Escala log. Média de 200 semanas = piso histórico dos ciclos; preço realizado = preço médio pago por todas as moedas em circulação; lei de potência = tendência de longo prazo."
            series={[
              { nome: 'BTC', dados: k.p, cor: COR.texto, largura: 2 },
              { nome: 'MM 200 semanas', dados: k.s200w, cor: COR.eth, largura: 2 },
              { nome: 'MM 200 dias', dados: k.s200, cor: COR.btc, largura: 1 },
              { nome: 'Preço realizado', dados: oc.realizado.data?.length ? oc.realizado.data : (oc.cm.data?.realizado ?? []), cor: COR.sol, largura: 1 },
              { nome: 'Lei de potência', dados: k.lp, cor: COR.stable, largura: 1, tracejado: true },
            ]}
            log
            formato={usd}
            desde={desde}
            altura={340}
          />

          <div className="grid g2">
            <PainelGrafico
              titulo="Múltiplo de Mayer"
              explica="Preço ÷ média de 200 dias. Abaixo de 0,8 foi raro e barato; acima de 2,4 marcou euforia."
              series={[{ nome: 'Mayer', dados: k.mayer, cor: COR.eth }]}
              linhas={[
                { valor: 0.8, cor: COR.bom, rotulo: '0,8' },
                { valor: 1, cor: COR.muted2, rotulo: '1' },
                { valor: 2.4, cor: COR.critico, rotulo: '2,4' },
              ]}
              formato={dec(2)}
              desde={desde}
            />
            {oc.mvrvZ.data?.length || !oc.cm.data?.mvrv.length ? (
              <PainelGrafico
                titulo="MVRV Z-Score"
                explica="Quanto o valor de mercado está acima do valor realizado, em desvios-padrão. < 0 = fundo; > 7 = topo nos ciclos passados."
                series={[{ nome: 'MVRV-Z', dados: oc.mvrvZ.data ?? [], cor: COR.eth }]}
                linhas={[
                  { valor: 0, cor: COR.bom, rotulo: '0' },
                  { valor: 7, cor: COR.critico, rotulo: '7' },
                ]}
                formato={dec(2)}
                desde={desde}
                vazio={oc.mvrvZ.isLoading ? 'Carregando…' : 'Indisponível agora (limite diário da fonte grátis)'}
              />
            ) : (
              <PainelGrafico
                titulo="MVRV (Coin Metrics)"
                explica="Valor de mercado ÷ valor realizado (o que todos pagaram). Abaixo de 1 = mercado no prejuízo, historicamente fundo; acima de 3,7 marcou topos. Fonte grátis e sem cota."
                series={[{ nome: 'MVRV', dados: oc.cm.data.mvrv, cor: COR.eth }]}
                linhas={[
                  { valor: 1, cor: COR.bom, rotulo: '1' },
                  { valor: 3.7, cor: COR.critico, rotulo: '3,7' },
                ]}
                formato={dec(2)}
                desde={desde}
                log
              />
            )}
            <PainelGrafico
              titulo="NUPL (lucro/prejuízo não realizado)"
              explica="Fração do valor de mercado que é lucro no papel. < 0 capitulação · 0–0,25 esperança · 0,25–0,5 otimismo · 0,5–0,75 crença · > 0,75 euforia."
              series={[{ nome: 'NUPL', dados: oc.nupl.data?.length ? oc.nupl.data : (oc.cm.data?.mvrv ?? []).map(([t, m]) => [t, 1 - 1 / m] as [number, number]), cor: COR.eth }]}
              linhas={[
                { valor: 0, cor: COR.bom, rotulo: 'capitulação' },
                { valor: 0.5, cor: COR.muted2, rotulo: 'crença' },
                { valor: 0.75, cor: COR.critico, rotulo: 'euforia' },
              ]}
              formato={dec(2)}
              desde={desde}
              vazio={oc.nupl.isLoading ? 'Carregando…' : 'Indisponível agora (limite diário da fonte grátis)'}
            />
            <PainelGrafico
              titulo="Múltiplo de Puell"
              explica="Receita diária dos mineradores ÷ média de 365 dias. < 0,5: mineradores espremidos (fundos); > 4: receita explodindo (topos)."
              series={[{ nome: 'Puell', dados: k.puell, cor: COR.eth }]}
              linhas={[
                { valor: 0.5, cor: COR.bom, rotulo: '0,5' },
                { valor: 4, cor: COR.critico, rotulo: '4' },
              ]}
              formato={dec(2)}
              desde={desde}
              log
            />
            <PainelGrafico
              titulo="Pi Cycle Top"
              explica="Média de 111 dias ÷ (2 × média de 350 dias). Quando chega a 1 (as médias cruzam), marcou topos de ciclo com dias de precisão."
              series={[{ nome: 'Razão Pi', dados: k.piRazao, cor: COR.eth }]}
              linhas={[{ valor: 1, cor: COR.critico, rotulo: 'cruzamento' }]}
              formato={dec(2)}
              desde={desde}
            />
            <PainelGrafico
              titulo="RSI semanal e diário"
              explica="Força relativa (14 períodos). Semanal acima de 85 aconteceu só em topos; abaixo de 35, em fundos."
              series={[
                { nome: 'RSI semanal', dados: k.rsiS, cor: COR.eth },
                { nome: 'RSI diário', dados: k.rsiD, cor: COR.muted2, largura: 1 },
              ]}
              linhas={[
                { valor: 30, cor: COR.bom, rotulo: '30' },
                { valor: 70, cor: COR.critico, rotulo: '70' },
              ]}
              formato={dec(0)}
              desde={desde}
            />
            <PainelGrafico
              titulo="Hash Ribbons"
              explica="Médias de 30 e 60 dias do hashrate. 30 abaixo de 60 = mineradores desligando máquinas (capitulação); o cruzamento de volta para cima foi sinal de compra."
              series={[
                { nome: 'Hashrate 30d', dados: k.h30, cor: COR.eth },
                { nome: 'Hashrate 60d', dados: k.h60, cor: COR.btc },
              ]}
              formato={(v) => `${numero(v, v < 10 ? 3 : 0)} EH/s`}
              desde={desde}
            />
            <PainelGrafico
              titulo="Queda desde a máxima"
              explica="Distância do preço para a máxima histórica até aquele dia. Os fundos dos ciclos passados ficaram entre −75% e −85%."
              series={[{ nome: 'Drawdown', dados: k.dd, cor: COR.critico, tipo: 'area' }]}
              formato={(v) => `${fixo(v, 0)}%`}
              desde={desde}
            />
            <PainelGrafico
              titulo="Fluxo dos ETFs de BTC (EUA)"
              explica="Entrada (+) ou saída (−) líquida diária nos ETFs à vista, em BTC. Fluxo consistente de entrada = demanda institucional."
              series={[{ nome: 'Fluxo', dados: oc.etf.data ?? [], cor: COR.bom, tipo: 'barras', corNegativa: COR.critico }]}
              formato={(v) => `${compacto(v)} BTC`}
              desde={desde && desde > Date.now() / 1000 - 3 * 365 * 86400 ? desde : undefined}
              vazio={oc.etf.isLoading ? 'Carregando…' : 'Indisponível agora (limite diário da fonte grátis)'}
            />
            <PainelGrafico
              titulo="Preço realizado de curto prazo"
              explica="Preço médio pago por quem comprou nos últimos ~155 dias. BTC acima dele = recém-chegados no lucro (tendência de alta); abaixo = no prejuízo."
              series={[
                { nome: 'BTC', dados: k.p, cor: COR.texto, largura: 1 },
                { nome: 'Realizado (curto prazo)', dados: oc.realizadoSth.data ?? [], cor: COR.btc },
              ]}
              formato={usd}
              desde={desde ?? Date.now() / 1000 - 4 * 365 * 86400}
              vazio="Indisponível agora"
            />
          </div>
        </>
      )}
    </>
  )
}

function PainelGrafico({
  titulo,
  explica,
  series,
  linhas,
  formato,
  desde,
  log,
  altura = 230,
  vazio,
}: {
  titulo: string
  explica: ReactNode
  series: SerieG[]
  linhas?: LinhaRef[]
  formato: (v: number) => string
  desde?: number
  log?: boolean
  altura?: number
  vazio?: string
}) {
  const principal = series[0]?.dados as Serie | undefined
  const atual = ultimo(principal)
  return (
    <Painel titulo={titulo} acoes={atual != null ? <span className="pill">{formato(atual)}</span> : undefined} pe={explica}>
      <div style={{ padding: '4px 6px 0' }}>
        <Grafico series={series} linhas={linhas} formato={formato} desde={desde} log={log} altura={altura} vazio={vazio} />
      </div>
    </Painel>
  )
}
