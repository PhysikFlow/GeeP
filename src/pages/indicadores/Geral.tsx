import type { ReactNode } from 'react'
import { AlertTriangle, ArrowRight, CircleCheck, Flame, Info } from 'lucide-react'
import { COR_NATIVO } from '../../lib/cores'
import { compacto, data, dinheiro, numero, pct, fixo } from '../../lib/format'
import { haDias, ultimo } from '../../lib/indicators/calc'
import { faixaDoTermometro, useCicloBtc } from '../../lib/indicators/ciclo'
import { NIVEIS, useRegime } from '../../lib/indicators/macro'
import {
  useAjusteDificuldade,
  useFundingAgora,
  useGlobal,
  useMedoGanancia,
  useStablecoins,
  useStatsEth,
  useStatsSol,
  useTaxasBtc,
} from '../../lib/indicators/fontes'
import { useCambio, useConversao, useMercado, type Mercado } from '../../lib/precos'
import { irPara } from '../../lib/rota'
import type { Nativo } from '../../lib/store'
import { Medidor, Sparkline } from '../../components/Visuais'
import { Delta, Esqueleto, IconeAtivo, Kpi, Painel } from '../../components/ui'

type Leitura = { tom: 'ok' | 'aviso' | 'perigo' | 'info'; texto: ReactNode }

export default function Geral() {
  const mercado = useMercado()
  const ciclo = useCicloBtc()
  const regime = useRegime()
  const fng = useMedoGanancia()
  const global = useGlobal()
  const stables = useStablecoins()
  const cambio = useCambio()
  const funding = useFundingAgora()
  const taxas = useTaxasBtc()
  const ajuste = useAjusteDificuldade()
  const eth = useStatsEth()
  const sol = useStatsSol()
  const { moeda, conv } = useConversao()

  const faixa = faixaDoTermometro(ciclo.termometro)
  const fngAgora = ultimo(fng.data?.serie)
  const fngSemana = haDias(fng.data?.serie, 7)
  const fngMes = haDias(fng.data?.serie, 30)
  const st = stables.data
  const stAgora = ultimo(st)
  const st30 = haDias(st, 30)
  const st30pct = stAgora && st30 ? (stAgora / st30 - 1) * 100 : null
  const dom = global.data?.market_cap_percentage

  // ---- leitura do dia: regras simples, cada uma com o porquê ----
  const leituras: Leitura[] = []
  if (regime.nivel) {
    const nv = NIVEIS[regime.nivel]
    leituras.push({
      tom: regime.nivel === 1 ? 'ok' : regime.nivel === 3 ? 'perigo' : 'aviso',
      texto: (
        <>
          <b>{nv.nome}</b> ({regime.pontos > 0 ? '+' : ''}
          {regime.pontos} em {regime.validos} sinais macro e de liquidez). {nv.ritmo}{' '}
          <a href="#/indicadores/regime">Ver sinais</a>
        </>
      ),
    })
  }
  if (ciclo.termometro != null) {
    if (ciclo.termometro < 25)
      leituras.push({ tom: 'ok', texto: <>Termômetro de ciclo em <b>{Math.round(ciclo.termometro)}/100</b>: a maioria dos indicadores de valuation do BTC está na faixa que, no passado, coincidiu com fundos de ciclo.</> })
    else if (ciclo.termometro > 75)
      leituras.push({ tom: 'perigo', texto: <>Termômetro de ciclo em <b>{Math.round(ciclo.termometro)}/100</b>: indicadores perto da zona que historicamente marcou topos. Momento de rever exposição, não de aumentar por impulso.</> })
    else leituras.push({ tom: 'info', texto: <>Termômetro de ciclo em <b>{Math.round(ciclo.termometro)}/100</b> ({faixa.rotulo.toLowerCase()}).</> })
  }
  if (fngAgora != null) {
    if (fngAgora <= 25) leituras.push({ tom: 'ok', texto: <>Medo extremo (<b>{fngAgora}</b>). Historicamente, medo extremo foi melhor momento para comprar aos poucos do que para vender.</> })
    else if (fngAgora >= 75) leituras.push({ tom: 'aviso', texto: <>Ganância extrema (<b>{fngAgora}</b>). Cuidado com compras por FOMO; correções são comuns daqui.</> })
  }
  const calc = ciclo.calc
  if (calc) {
    const may = ultimo(calc.mayer)
    if (may != null && may < 0.8) leituras.push({ tom: 'ok', texto: <>Múltiplo de Mayer em <b>{fixo(may, 2)}</b>: BTC mais de 20% abaixo da média de 200 dias — raro e historicamente barato.</> })
    if (may != null && may > 2.4) leituras.push({ tom: 'perigo', texto: <>Múltiplo de Mayer em <b>{fixo(may, 2)}</b>: muito esticado acima da média de 200 dias.</> })
    const w200 = ultimo(calc.s200w)
    if (w200 && calc.atual < w200) leituras.push({ tom: 'ok', texto: <>BTC abaixo da <b>média de 200 semanas</b> ({dinheiro(conv(w200), moeda)}). Isso só aconteceu perto dos fundos dos ciclos anteriores.</> })
    const dd = ultimo(calc.dd)
    if (dd != null && dd < -10) leituras.push({ tom: 'info', texto: <>BTC está <b>{fixo(Math.abs(dd), 0)}% abaixo</b> da máxima histórica ({dinheiro(conv(calc.ath), moeda)}).</> })
    const r = calc.ribbons
    if (r.length > 20) {
      const agora = r[r.length - 1][1]
      const recenteAbaixo = r.slice(-20, -1).some(([, v]) => v < 1)
      if (agora >= 1 && recenteAbaixo) leituras.push({ tom: 'ok', texto: <><b>Hash Ribbons:</b> a média de 30 dias do hashrate voltou para cima da de 60 — sinal clássico de fim de capitulação dos mineradores.</> })
      else if (agora < 1) leituras.push({ tom: 'aviso', texto: <><b>Hash Ribbons:</b> mineradores em capitulação (hashrate 30d abaixo do 60d). Historicamente antecede bons pontos de entrada, mas pode durar semanas.</> })
    }
  }
  for (const n of ['BTC', 'ETH', 'SOL'] as Nativo[]) {
    const f = funding.data?.[n]
    if (!f) continue
    const anual = f.funding * 3 * 365 * 100
    if (anual > 30) leituras.push({ tom: 'aviso', texto: <>Funding de {n} em <b>{fixo(anual, 0)}% a.a.</b>: muita alavancagem comprada; quedas rápidas viram liquidações em cascata.</> })
    if (anual < -5) leituras.push({ tom: 'ok', texto: <>Funding de {n} <b>negativo</b> ({fixo(anual, 0)}% a.a.): o mercado está pagando para ficar vendido — combustível para um short squeeze.</> })
  }
  if (st30pct != null) {
    if (st30pct > 2) leituras.push({ tom: 'ok', texto: <>Stablecoins cresceram <b>{fixo(st30pct, 1)}%</b> em 30 dias: dinheiro novo esperando para entrar no mercado.</> })
    if (st30pct < -1) leituras.push({ tom: 'aviso', texto: <>Stablecoins encolheram <b>{fixo(Math.abs(st30pct), 1)}%</b> em 30 dias: liquidez saindo do cripto.</> })
  }
  if (dom?.btc != null && dom.btc > 58) leituras.push({ tom: 'info', texto: <>Dominância do BTC em <b>{fixo(dom.btc, 1)}%</b>: fase de BTC liderando; altcoins costumam render menos aqui.</> })
  if (ciclo.halving) leituras.push({ tom: 'info', texto: <>Próximo halving em ~<b>{numero(ciclo.halving.faltam / 144, 0)} dias</b> (bloco {numero(ciclo.halving.proximo, 0)}, por volta de {data(ciclo.halving.data)}).</> })

  return (
    <>
      <div className="grid g3">
        {(['BTC', 'ETH', 'SOL'] as Nativo[]).map((n) => (
          <CartaoMoeda key={n} m={mercado.data?.[n]} n={n} carregando={mercado.isLoading} />
        ))}
      </div>

      <div className="grid g3">
        <Painel
          titulo="Termômetro do ciclo (BTC)"
          acoes={
            <button className="btn quiet sm" onClick={() => irPara('indicadores', 'ciclo')}>
              Detalhes <ArrowRight size={13} />
            </button>
          }
          pe={`Média de ${ciclo.componentes.filter((c) => c.nota != null).length} indicadores de valuation (0 = fundo histórico, 100 = topo).`}
        >
          <div className="panel-body">
            {ciclo.carregando ? <Esqueleto h={150} /> : <Medidor valor={ciclo.termometro} rotulo={faixa.rotulo} escala={['Acumulação', 'Euforia']} />}
          </div>
        </Painel>
        <Painel titulo="Medo & Ganância" pe={fngAgora != null ? `Há 7 dias: ${fngSemana ?? '—'} · há 30 dias: ${fngMes ?? '—'}` : undefined}>
          <div className="panel-body">
            {fng.isLoading ? <Esqueleto h={150} /> : <Medidor valor={fngAgora} rotulo={traduzFng(fng.data?.rotulo)} escala={['Medo extremo', 'Ganância extrema']} />}
          </div>
        </Painel>
        <Painel titulo="Mercado">
          <div className="kpis" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <Kpi rotulo="Capitalização total" valor={global.data ? dinheiro(conv(global.data.total_market_cap.usd), moeda, true) : '—'} detalhe={global.data ? <Delta v={global.data.market_cap_change_percentage_24h_usd} sufixo="24h" /> : undefined} />
            <Kpi rotulo="Volume 24h" valor={global.data ? dinheiro(conv(global.data.total_volume.usd), moeda, true) : '—'} />
            <Kpi rotulo="Dominância BTC" valor={dom ? `${fixo(dom.btc, 1)}%` : '—'} detalhe={dom ? `ETH ${fixo(dom.eth, 1)}% · SOL ${fixo((dom.sol ?? 0), 1)}%` : undefined} />
            <Kpi rotulo="Stablecoins" valor={stAgora ? dinheiro(conv(stAgora), moeda, true) : '—'} detalhe={st30pct != null ? <Delta v={st30pct} sufixo="em 30d" /> : undefined} />
            <Kpi rotulo="Dólar (USD/BRL)" valor={cambio.data ? `R$ ${fixo(cambio.data, 3)}` : '—'} />
            <Kpi rotulo="Altcoins ativas" valor={global.data ? numero(global.data.active_cryptocurrencies, 0) : '—'} />
          </div>
        </Painel>
      </div>

      <div className="grid g-2-1">
        <Painel titulo="Leitura do dia" sub="Regras simples sobre os dados acima — o porquê vem junto">
          <div className="leitura">
            {leituras.length === 0 && (
              <div className="panel-body">
                <Esqueleto h={80} />
              </div>
            )}
            {leituras.map((l, i) => (
              <div key={i} className={`leitura-item ${l.tom}`}>
                {l.tom === 'ok' ? <CircleCheck size={15} /> : l.tom === 'perigo' ? <Flame size={15} /> : l.tom === 'aviso' ? <AlertTriangle size={15} /> : <Info size={15} />}
                <div>{l.texto}</div>
              </div>
            ))}
          </div>
        </Painel>
        <Painel titulo="Redes agora">
          <div className="kpis" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <Kpi rotulo="Taxa BTC (rápida)" valor={taxas.data ? `${taxas.data.fastestFee} sat/vB` : '—'} detalhe={taxas.data ? `1 h: ${taxas.data.hourFee} · econ.: ${taxas.data.economyFee}` : undefined} />
            <Kpi rotulo="Próx. dificuldade" valor={ajuste.data ? pct(ajuste.data.difficultyChange) : '—'} detalhe={ajuste.data ? `em ${numero(ajuste.data.remainingBlocks, 0)} blocos` : undefined} />
            <Kpi rotulo="Gás ETH" valor={eth.data?.gas_prices ? `${numero(eth.data.gas_prices.average, 2)} gwei` : '—'} detalhe={eth.data ? `uso da rede ${numero(eth.data.network_utilization_percentage, 0)}%` : undefined} />
            <Kpi rotulo="Solana TPS" valor={sol.data ? numero(sol.data.tps, 0) : '—'} detalhe={sol.data ? `época ${sol.data.epoca} · ${fixo((sol.data.progressoEpoca * 100), 0)}%` : undefined} />
            {(['BTC', 'ETH', 'SOL'] as Nativo[]).map((n) => {
              const f = funding.data?.[n]
              const anual = f ? f.funding * 3 * 365 * 100 : null
              return (
                <Kpi
                  key={n}
                  rotulo={`Funding ${n}`}
                  valor={f ? `${fixo((f.funding * 100), 4)}%` : '—'}
                  detalhe={anual != null ? `${fixo(anual, 1)}% a.a.` : undefined}
                  tom={anual == null ? undefined : anual > 30 ? 'aviso' : anual < 0 ? 'ok' : undefined}
                />
              )
            })}
            <Kpi
              rotulo="Halving"
              valor={ciclo.halving ? `${numero(ciclo.halving.faltam / 144, 0)} dias` : '—'}
              detalhe={ciclo.halving ? `${fixo((ciclo.halving.progresso * 100), 1)}% do ciclo` : undefined}
            />
          </div>
        </Painel>
      </div>
    </>
  )
}

function traduzFng(r?: string) {
  const m: Record<string, string> = {
    'Extreme Fear': 'Medo extremo',
    Fear: 'Medo',
    Neutral: 'Neutro',
    Greed: 'Ganância',
    'Extreme Greed': 'Ganância extrema',
  }
  return r ? (m[r] ?? r) : '—'
}

function CartaoMoeda({ m, n, carregando }: { m?: Mercado; n: Nativo; carregando: boolean }) {
  const { moeda, conv } = useConversao()
  return (
    <section className="panel moeda-card">
      <div className="moeda-topo">
        <IconeAtivo src={m?.icone} simbolo={n} />
        <div>
          <strong>{m?.nome ?? n}</strong>
          <div className="muted-2" style={{ fontSize: 11.5 }}>
            {m?.mcap ? `Cap. ${dinheiro(conv(m.mcap), moeda, true)}` : n}
          </div>
        </div>
        <div className="preco">
          {carregando ? <Esqueleto h={22} w={110} /> : <b className="num">{dinheiro(conv(m?.preco), moeda)}</b>}
          <Delta v={m?.var24h} sufixo="24h" />
        </div>
      </div>
      <Sparkline dados={m?.sparkline ?? []} largura={400} altura={44} cor={COR_NATIVO[n]} cheio />
      <div className="variacoes">
        <div>
          <span>7 dias</span>
          <b>
            <Delta v={m?.var7d} casas={1} />
          </b>
        </div>
        <div>
          <span>30 dias</span>
          <b>
            <Delta v={m?.var30d} casas={1} />
          </b>
        </div>
        <div>
          <span>1 ano</span>
          <b>
            <Delta v={m?.var1a} casas={1} />
          </b>
        </div>
        <div title={m?.ath ? `Máxima: ${dinheiro(m.ath)}` : undefined}>
          <span>Da máxima</span>
          <b>
            <Delta v={m?.athDist} casas={1} />
          </b>
        </div>
      </div>
      {m?.volume != null && (
        <div className="muted-2" style={{ fontSize: 11.5 }}>
          Volume 24h {dinheiro(conv(m.volume), moeda, true)} · {compacto(m.volume / (m.preco || 1))} {n}
        </div>
      )}
    </section>
  )
}
