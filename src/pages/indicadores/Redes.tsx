import { useState } from 'react'
import { COR } from '../../lib/cores'
import { compacto, dinheiro, numero, pct, fixo } from '../../lib/format'
import { haDias, ultimo } from '../../lib/indicators/calc'
import {
  useAjusteDificuldade,
  useHashrate,
  useMempool,
  useStablecoins,
  useStatsEth,
  useStatsSol,
  useTaxasBtc,
  useTaxasRede,
  useTvlHistorico,
  useTvlRedes,
  useVolumeDex,
} from '../../lib/indicators/fontes'
import { useConversao } from '../../lib/precos'
import { Grafico, inicioDaJanela, JANELAS, type Janela } from '../../components/Grafico'
import { Delta, Esqueleto, Kpi, Painel, Segmentado } from '../../components/ui'

const REDES_FOCO = ['Ethereum', 'Solana', 'Bitcoin', 'Base', 'Arbitrum']

export default function Redes() {
  const { moeda, conv } = useConversao()
  const chains = useTvlRedes()
  const tvlEth = useTvlHistorico('Ethereum')
  const tvlSol = useTvlHistorico('Solana')
  const tvlBtc = useTvlHistorico('Bitcoin')
  const stables = useStablecoins()
  const taxas = useTaxasBtc()
  const mempool = useMempool()
  const hash = useHashrate()
  const ajuste = useAjusteDificuldade()
  const eth = useStatsEth()
  const sol = useStatsSol()
  const [janela, setJanela] = useState<Janela>('1a')
  const desde = inicioDaJanela(janela)

  const top = (chains.data ?? []).filter((c) => c.tvl > 0).sort((a, b) => b.tvl - a.tvl).slice(0, 12)
  const maxTvl = top[0]?.tvl ?? 1
  const stAgora = ultimo(stables.data)

  return (
    <>
      <div className="grid g3">
        <Painel titulo="Bitcoin">
          <div className="kpis" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
            <Kpi rotulo="Taxa rápida" valor={taxas.data ? `${taxas.data.fastestFee} sat/vB` : '—'} detalhe={taxas.data ? `30 min ${taxas.data.halfHourFee} · 1 h ${taxas.data.hourFee}` : undefined} />
            <Kpi rotulo="Mempool" valor={mempool.data ? `${numero(mempool.data.count, 0)} tx` : '—'} detalhe={mempool.data ? `${numero(mempool.data.vsize / 1e6, 1)} MvB` : undefined} />
            <Kpi rotulo="Hashrate" valor={hash.data ? `${numero(hash.data.currentHashrate / 1e18, 0)} EH/s` : '—'} />
            <Kpi rotulo="Próx. ajuste" valor={ajuste.data ? pct(ajuste.data.difficultyChange) : '—'} detalhe={ajuste.data ? `${fixo((ajuste.data.progressPercent), 0)}% da época` : undefined} />
          </div>
        </Painel>
        <Painel titulo="Ethereum">
          <div className="kpis" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
            <Kpi rotulo="Gás médio" valor={eth.data?.gas_prices ? `${numero(eth.data.gas_prices.average, 2)} gwei` : '—'} detalhe={eth.data?.gas_prices ? `lento ${numero(eth.data.gas_prices.slow, 2)} · rápido ${numero(eth.data.gas_prices.fast, 2)}` : undefined} />
            <Kpi rotulo="Uso da rede" valor={eth.data ? `${numero(eth.data.network_utilization_percentage, 0)}%` : '—'} />
            <Kpi rotulo="Transações hoje" valor={eth.data ? compacto(Number(eth.data.transactions_today)) : '—'} />
            <Kpi rotulo="Endereços" valor={eth.data ? compacto(Number(eth.data.total_addresses)) : '—'} />
          </div>
        </Painel>
        <Painel titulo="Solana">
          <div className="kpis" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
            <Kpi rotulo="TPS (sem votos)" valor={sol.data ? numero(sol.data.tps, 0) : '—'} />
            <Kpi rotulo="Época" valor={sol.data ? numero(sol.data.epoca, 0) : '—'} detalhe={sol.data ? `${fixo((sol.data.progressoEpoca * 100), 0)}% concluída` : undefined} />
            <Kpi rotulo="Inflação" valor={sol.data ? `${fixo(sol.data.inflacao, 2)}% a.a.` : '—'} detalhe="emissão para stakers" />
            <Kpi rotulo="Stablecoins (todas)" valor={stAgora ? dinheiro(conv(stAgora), moeda, true) : '—'} />
          </div>
        </Painel>
      </div>

      <div className="grid g-2-1">
        <Painel titulo="TVL em DeFi" sub="Valor depositado em protocolos de cada rede" acoes={<Segmentado rotulo="Período" valor={janela} opcoes={JANELAS} onChange={setJanela} />}>
          <div style={{ padding: '4px 6px 0' }}>
            <Grafico
              altura={280}
              desde={desde}
              formato={(v) => dinheiro(v, 'USD', true)}
              series={[
                { nome: 'Ethereum', dados: tvlEth.data ?? [], cor: COR.eth },
                { nome: 'Solana', dados: tvlSol.data ?? [], cor: COR.sol },
                { nome: 'Bitcoin', dados: tvlBtc.data ?? [], cor: COR.btc },
              ]}
              vazio="Carregando…"
            />
          </div>
        </Painel>
        <Painel titulo="Maiores redes por TVL">
          <div>
            {chains.isLoading && (
              <div className="panel-body">
                <Esqueleto h={200} />
              </div>
            )}
            {top.map((c) => (
              <div key={c.name} className="nota-linha" style={{ gridTemplateColumns: 'minmax(0,1fr) 80px' }}>
                <div>
                  {c.name}
                  <div className="barra" style={{ marginTop: 5 }}>
                    <i style={{ width: `${(c.tvl / maxTvl) * 100}%`, ['--cor' as string]: c.name === 'Ethereum' ? COR.eth : c.name === 'Solana' ? COR.sol : c.name === 'Bitcoin' ? COR.btc : COR.muted2 }} />
                  </div>
                </div>
                <b className="num" style={{ textAlign: 'right' }}>
                  {dinheiro(c.tvl, 'USD', true)}
                </b>
              </div>
            ))}
          </div>
        </Painel>
      </div>

      <div className="section-title">
        <h2>Atividade econômica (24h)</h2>
        <span>Volume em DEX e taxas pagas pelos usuários — demanda real por blockspace. O dia isolado oscila muito; olhe a tendência de 30 dias.</span>
      </div>
      <Painel>
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr>
                <th>Rede</th>
                <th>Volume DEX 24h</th>
                <th className="some-celular">Volume DEX 30d</th>
                <th title="Últimos 30 dias contra os 30 anteriores">Tendência 30d</th>
                <th>Taxas 24h</th>
                <th className="some-celular">Taxas 30d</th>
              </tr>
            </thead>
            <tbody>
              {REDES_FOCO.map((r) => (
                <LinhaAtividade key={r} rede={r} />
              ))}
            </tbody>
          </table>
        </div>
      </Painel>

      <div className="grid g2">
        <Painel titulo="Stablecoins em circulação" sub="Dólar on-chain: crescendo = liquidez entrando" pe={stAgora ? <>30 dias: <Delta v={(stAgora / (haDias(stables.data, 30) ?? stAgora) - 1) * 100} /> · 1 ano: <Delta v={(stAgora / (haDias(stables.data, 365) ?? stAgora) - 1) * 100} /></> : undefined}>
          <div style={{ padding: '4px 6px 0' }}>
            <Grafico altura={220} desde={desde} formato={(v) => dinheiro(v, 'USD', true)} series={[{ nome: 'Stablecoins', dados: stables.data ?? [], cor: COR.stable, tipo: 'area' }]} vazio="Carregando…" />
          </div>
        </Painel>
        <Painel titulo="Hashrate do Bitcoin (1 ano)" sub="Segurança da rede; quedas fortes = mineradores desligando">
          <div style={{ padding: '4px 6px 0' }}>
            <Grafico
              altura={220}
              formato={(v) => `${numero(v, 0)} EH/s`}
              series={[{ nome: 'Hashrate', dados: (hash.data?.hashrates ?? []).map((h) => [h.timestamp, h.avgHashrate / 1e18]), cor: COR.btc }]}
              vazio="Carregando…"
            />
          </div>
        </Painel>
      </div>
    </>
  )
}

function LinhaAtividade({ rede }: { rede: string }) {
  const dex = useVolumeDex(rede)
  const fees = useTaxasRede(rede)
  return (
    <tr>
      <td>
        <strong>{rede}</strong>
      </td>
      <td>{dex.isLoading ? '…' : dinheiro(dex.data?.total24h, 'USD', true)}</td>
      <td className="some-celular">{dex.isLoading ? '…' : dinheiro(dex.data?.total30d, 'USD', true)}</td>
      <td>
        <Delta v={dex.data?.change_30dover30d} casas={1} />
      </td>
      <td>{fees.isLoading ? '…' : dinheiro(fees.data?.total24h, 'USD', true)}</td>
      <td className="some-celular">{fees.isLoading ? '…' : dinheiro(fees.data?.total30d, 'USD', true)}</td>
    </tr>
  )
}
