import { useState } from 'react'
import { Bot, Plus, Trash2 } from 'lucide-react'
import { data, dinheiro, fixo, pct } from '../lib/format'
import { useSelic } from '../lib/indicators/macro'
import { useVeredito } from '../lib/indicators/veredito'
import { useMercado } from '../lib/precos'
import { caixaHoje, placar, roboJaRodouHoje, rodarMetodo, operar, SLIPPAGE, TAXA, valorSim, type AtivoSim } from '../lib/simulacao'
import { removerSim, salvarSim, useSims, type CarteiraSim } from '../lib/store'
import Backtest from './simulacao/Backtest'
import { Aviso, Delta, Esqueleto, Kpi, Painel, Pill, Segmentado } from '../components/ui'

const ATIVOS: AtivoSim[] = ['BTC', 'ETH', 'SOL']
const ACAO_PT = { comprar: 'comprar', nada: 'não fazer nada', vender: 'vender' }

export default function SimulacaoPage() {
  const sims = useSims()
  const mercado = useMercado().data
  const selic = useSelic().data?.selic ?? null
  const ver = useVeredito()
  const [nome, setNome] = useState('')
  const [valor, setValor] = useState('10000')
  const [modo, setModo] = useState<CarteiraSim['modo']>('metodo')

  const precos = mercado ? { BTC: mercado.BTC.preco, ETH: mercado.ETH.preco, SOL: mercado.SOL.preco } : null

  function criar() {
    if (!precos) return
    const v = Number(valor.replace(/\./g, '').replace(',', '.'))
    if (!(v > 0)) return
    salvarSim({
      id: crypto.randomUUID(),
      nome: nome.trim() || (modo === 'metodo' ? 'Robô do método' : modo === 'manual' ? 'Minhas decisões' : 'Misto'),
      modo,
      inicialUsd: v,
      caixaUsd: v,
      caixaDesde: Date.now(),
      qtd: { BTC: 0, ETH: 0, SOL: 0 },
      ops: [],
      btcInicial: precos.BTC,
      criadaEm: Date.now(),
    })
    setNome('')
  }

  return (
    <div className="page">
      <Aviso tom="info">
        Dinheiro de mentirinha, custos de verdade: {fixo(TAXA * 100, 1)}% de taxa e {fixo(SLIPPAGE * 100, 1)}% de slippage em cada operação, e o
        caixa parado rende a Selic ({selic != null ? `${fixo(selic, 2)}% a.a.` : '…'}). O robô segue o método como um humano: às vezes esquece,
        varia o valor e de vez em quando faz um aporte mínimo por ansiedade. Com o tempo, o placar mostra quem estava certo — o método ou você.
      </Aviso>

      <Painel titulo="Nova carteira de simulação" className="sim-nova">
        <div className="panel-body" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ marginTop: 0, minWidth: 160, flex: 1 }}>
            <label>Nome</label>
            <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Robô conservador" />
          </div>
          <div className="field" style={{ marginTop: 0, width: 140 }}>
            <label>Capital (US$)</label>
            <input className="input" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
          </div>
          <div className="field" style={{ marginTop: 0 }}>
            <label>Quem decide</label>
            <Segmentado
              rotulo="Modo"
              valor={modo}
              opcoes={[
                { valor: 'metodo', rotulo: 'Robô do método' },
                { valor: 'manual', rotulo: 'Eu (manual)' },
                { valor: 'misto', rotulo: 'Os dois' },
              ]}
              onChange={setModo}
            />
          </div>
          <button className="btn primary" onClick={criar} disabled={!precos}>
            <Plus size={14} /> Criar
          </button>
        </div>
      </Painel>

      {!precos && <Esqueleto h={120} />}
      {precos &&
        sims.map((c) => <CartaoSim key={c.id} c={c} precos={precos} selic={selic} ver={ver} />)}
      {sims.length === 0 && precos && (
        <p className="muted" style={{ marginTop: 16 }}>
          Crie uma carteira do robô e outra manual com o mesmo capital para comparar quem se sai melhor.
        </p>
      )}
      <div className="section-title">
        <h2>Como o método teria se saído no passado</h2>
      </div>
      <Backtest />

      <p className="rodape-fontes">
        As carteiras ficam só neste aparelho (e no backup dos Ajustes). O robô roda uma vez por dia, quando você abre esta página e clica — não há
        servidor rodando sozinho. Benchmark: o mesmo capital todo em BTC no dia da criação.
      </p>
    </div>
  )
}

function CartaoSim({
  c,
  precos,
  selic,
  ver,
}: {
  c: CarteiraSim
  precos: Record<AtivoSim, number>
  selic: number | null
  ver: ReturnType<typeof useVeredito>
}) {
  const [ativo, setAtivo] = useState<AtivoSim>('BTC')
  const [usd, setUsd] = useState('500')
  const [msg, setMsg] = useState<string | null>(null)
  const [apagar, setApagar] = useState(false)
  const total = valorSim(c, precos, selic)
  const ret = (total / c.inicialUsd - 1) * 100
  const soBtc = (c.inicialUsd * (1 - TAXA)) / (c.btcInicial * (1 + SLIPPAGE)) * precos.BTC
  const retBtc = (soBtc / c.inicialUsd - 1) * 100
  const dias = Math.max(0, (Date.now() - c.criadaEm) / 86_400_000)
  const pl = placar(c, precos)
  const avisei = pl.filter((p) => p.juiz.includes('eu avisei')).length
  const admita = pl.filter((p) => p.juiz.includes('admita')).length
  const robo = c.modo !== 'manual'
  const manual = c.modo !== 'metodo'

  function manualOp(sinal: 1 | -1) {
    const v = Number(usd.replace(/\./g, '').replace(',', '.'))
    if (!(v > 0)) return
    const novo = operar(c, ativo, sinal * v, precos[ativo], selic, 'manual', ver.acao)
    if (novo === c) return setMsg('Sem caixa ou posição suficiente.')
    salvarSim(novo)
    const contra = (sinal > 0 && ver.acao !== 'comprar') || (sinal < 0 && ver.acao !== 'vender')
    setMsg(contra ? `Registrado. O método dizia "${ACAO_PT[ver.acao]}" — vamos ver quem acerta.` : 'Registrado, de acordo com o método.')
  }

  return (
    <section className="panel sim">
      <div className="panel-head">
        <div>
          <h2>{c.nome}</h2>
          <span className="sub">
            {c.modo === 'metodo' ? 'Robô do método' : c.modo === 'manual' ? 'Decisões suas' : 'Robô + você'} · desde {data(c.criadaEm / 1000)} (
            {fixo(dias, 0)} dias)
          </span>
        </div>
        {apagar ? (
          <span style={{ display: 'flex', gap: 6 }}>
            <button className="btn danger sm" onClick={() => removerSim(c.id)}>
              Apagar
            </button>
            <button className="btn quiet sm" onClick={() => setApagar(false)}>
              Não
            </button>
          </span>
        ) : (
          <button className="icon-btn sem-borda" aria-label="Apagar carteira" onClick={() => setApagar(true)}>
            <Trash2 size={15} />
          </button>
        )}
      </div>
      <div className="kpis">
        <Kpi rotulo="Valor" valor={dinheiro(total)} detalhe={<Delta v={ret} sufixo="desde o início" />} />
        <Kpi rotulo="Se fosse tudo em BTC" valor={dinheiro(soBtc)} detalhe={<Delta v={retBtc} />} tom={total >= soBtc ? 'ok' : 'perigo'} />
        <Kpi rotulo="Caixa (rendendo Selic)" valor={dinheiro(caixaHoje(c, selic))} />
        <Kpi rotulo="Posições" valor={ATIVOS.filter((a) => c.qtd[a] > 0).map((a) => a).join(' · ') || '—'} detalhe={ATIVOS.filter((a) => c.qtd[a] > 0).map((a) => dinheiro(c.qtd[a] * precos[a], 'USD', true)).join(' · ')} />
        {manual && <Kpi rotulo="Placar contra o método" valor={`${avisei} × ${admita}`} detalhe='"eu avisei" × "admita"' />}
      </div>
      <div className="panel-body" style={{ display: 'grid', gap: 10 }}>
        {robo && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn secondary sm"
              disabled={!ver.pronto || roboJaRodouHoje(c)}
              onClick={() => {
                const r = rodarMetodo(c, ver.acao, ver.parcela, precos, selic)
                salvarSim(r.carteira)
                setMsg(r.resumo)
              }}
            >
              <Bot size={14} /> {roboJaRodouHoje(c) ? 'Robô já decidiu hoje' : 'Rodar o método hoje'}
            </button>
            <span className="muted-2" style={{ fontSize: 12 }}>
              Método agora: <b>{ACAO_PT[ver.acao]}</b>
              {ver.parcela ? ` (${ver.parcela})` : ''}
            </span>
          </div>
        )}
        {manual && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Segmentado rotulo="Ativo" valor={ativo} opcoes={ATIVOS.map((a) => ({ valor: a, rotulo: a }))} onChange={setAtivo} />
            <input className="input" style={{ width: 110 }} inputMode="decimal" value={usd} onChange={(e) => setUsd(e.target.value)} aria-label="Valor em US$" />
            <button className="btn primary sm" onClick={() => manualOp(1)}>
              Comprar
            </button>
            <button className="btn secondary sm" onClick={() => manualOp(-1)}>
              Vender
            </button>
            <span className="muted-2" style={{ fontSize: 12 }}>
              {ativo} a {dinheiro(precos[ativo])}
            </span>
          </div>
        )}
        {msg && <span style={{ fontSize: 12.5 }}>{msg}</span>}
      </div>
      {c.ops.length > 0 && (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Operação</th>
                <th>Quem</th>
                <th className="some-celular">Método dizia</th>
                <th>Desde então</th>
                <th className="some-celular">Veredito</th>
              </tr>
            </thead>
            <tbody>
              {[...c.ops].reverse().slice(0, 30).map((o, i) => {
                const pl1 = pl.find((p) => p.op === o)
                const variacao = (precos[o.ativo] / o.preco - 1) * 100
                return (
                  <tr key={i}>
                    <td>{data(o.t / 1000, true)}</td>
                    <td>
                      {o.qtd > 0 ? 'Compra' : 'Venda'} {o.ativo} {dinheiro(Math.abs(o.usd))}
                      <span className="sub">a {dinheiro(o.preco)}</span>
                    </td>
                    <td>{o.origem === 'metodo' ? <Pill>robô</Pill> : <Pill tom="acento">você</Pill>}</td>
                    <td className="some-celular">{ACAO_PT[o.metodo]}</td>
                    <td>
                      <span className={variacao >= 0 ? 'sobe' : 'desce'}>{pct(variacao, 1)}</span>
                    </td>
                    <td className="some-celular" style={{ whiteSpace: 'normal', maxWidth: 260 }}>
                      {pl1 ? pl1.juiz : o.nota ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
