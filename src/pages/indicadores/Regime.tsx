import { useState } from 'react'
import { CircleCheck, CircleMinus, CircleX, ExternalLink, HelpCircle } from 'lucide-react'
import { COR } from '../../lib/cores'
import { data, dinheiro, fixo } from '../../lib/format'
import { haDias, ultimo } from '../../lib/indicators/calc'
import { useGlobal } from '../../lib/indicators/fontes'
import { NIVEIS, useCorretoras, useHacks, useRegime } from '../../lib/indicators/macro'
import { Grafico, inicioDaJanela, type Janela } from '../../components/Grafico'
import { Delta, Esqueleto, Kpi, Painel, Pill, Segmentado } from '../../components/ui'

const pctF = (v: number) => `${fixo(v, 2)}%`
const JANELAS_MACRO: { valor: Janela; rotulo: string }[] = [
  { valor: '90d', rotulo: '90d' },
  { valor: '1a', rotulo: '1a' },
  { valor: 'tudo', rotulo: '3a' },
]

export default function Regime() {
  const rg = useRegime()
  const global = useGlobal()
  const cexs = useCorretoras()
  const hacks = useHacks()
  const [janela, setJanela] = useState<Janela>('1a')
  const desde = inicioDaJanela(janela)
  const d = rg.dados
  const n = rg.nivel ? NIVEIS[rg.nivel] : null

  const st = d.stables.data
  const stAgora = ultimo(st)
  const varSt = (dias: number) => {
    const a = haDias(st, dias)
    return stAgora != null && a ? (stAgora / a - 1) * 100 : null
  }

  const topCex = (cexs.data ?? []).slice(0, 10)
  const somaCex = (k: 'currentTvl' | 'inflows_24h' | 'inflows_1w' | 'inflows_1m') => (cexs.data ?? []).reduce((s, c) => s + (c[k] ?? 0), 0)
  const corte90 = Date.now() / 1000 - 90 * 86400
  const hacksRecentes = (hacks.data ?? []).filter((h) => h.date >= corte90)
  const perdido90 = hacksRecentes.reduce((s, h) => s + (h.amount ?? 0), 0)

  return (
    <>
      <div className="grid g-1-2">
        <Painel titulo="Regime de mercado" pe="Define o RITMO das compras, não quais ativos comprar. Fear & Greed entra só como contexto.">
          <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
            {rg.carregando && !n ? (
              <Esqueleto h={120} />
            ) : (
              <>
                <div>
                  <Pill tom={n?.tom}>{n ? n.nome : 'Dados insuficientes'}</Pill>
                </div>
                <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.02em' }}>
                  {rg.pontos > 0 ? '+' : ''}
                  {rg.pontos}
                  <span className="muted-2" style={{ fontSize: 14, fontWeight: 500 }}>
                    {' '}
                    pontos em {rg.validos} sinais
                  </span>
                </div>
                <p className="explica">{n?.ritmo ?? 'Esperando as fontes responderem.'}</p>
                <p className="muted-2" style={{ fontSize: 12 }}>
                  Regra: soma ≥ +3 → nível 1 · entre −1 e +2 → nível 2 · ≤ −2 → nível 3. Medo &amp; Ganância agora:{' '}
                  <b style={{ color: 'var(--text)' }}>{rg.fng ?? '—'}</b> (só contexto).
                </p>
              </>
            )}
          </div>
        </Painel>
        <Painel titulo="Sinais" sub="Cada um vota a favor (+1), neutro (0) ou contra (−1) o risco">
          <div className="leitura">
            {rg.votos.map((v) => (
              <div key={v.id} className={`leitura-item ${v.voto === 1 ? 'ok' : v.voto === -1 ? 'perigo' : v.voto === 0 ? 'info' : ''}`}>
                {v.voto === 1 ? <CircleCheck size={15} /> : v.voto === -1 ? <CircleX size={15} /> : v.voto === 0 ? <CircleMinus size={15} /> : <HelpCircle size={15} />}
                <div>
                  <b>{v.nome}</b>: {v.valor}
                  <div className="muted-2" style={{ fontSize: 11.5 }}>
                    {v.porque}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Painel>
      </div>

      <div className="section-title">
        <h2>Juros americanos</h2>
        <Segmentado rotulo="Período" valor={janela} opcoes={JANELAS_MACRO} onChange={setJanela} />
      </div>
      <div className="grid g2">
        <Painel
          titulo="Fed funds e Treasuries"
          pe={
            <>
              Alvo do Fed: {d.juros.data?.alvoMin != null ? `${fixo(d.juros.data.alvoMin)}–${fixo(d.juros.data.alvoMax)}%` : '—'}. Probabilidade da próxima
              reunião não tem API grátis:{' '}
              <a href="https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html" target="_blank" rel="noreferrer">
                CME FedWatch <ExternalLink size={11} />
              </a>
            </>
          }
        >
          <div style={{ padding: '4px 6px 0' }}>
            <Grafico
              altura={240}
              desde={desde}
              formato={pctF}
              series={[
                { nome: 'Fed funds', dados: d.juros.data?.effr ?? [], cor: COR.texto },
                { nome: 'T-bill 3m', dados: d.tesouro.data?.t3m ?? [], cor: COR.stable, largura: 1 },
                { nome: '2 anos', dados: d.tesouro.data?.t2 ?? [], cor: COR.btc },
                { nome: '10 anos', dados: d.tesouro.data?.t10 ?? [], cor: COR.eth },
              ]}
              vazio="Carregando…"
            />
          </div>
        </Painel>
        <Painel titulo="Juro real de 10 anos (TIPS)" pe="Juro acima da inflação esperada: o custo de oportunidade de segurar ativo sem renda.">
          <div style={{ padding: '4px 6px 0' }}>
            <Grafico altura={240} desde={desde} formato={pctF} series={[{ nome: 'Real 10a', dados: d.tesouro.data?.real10 ?? [], cor: COR.eth, tipo: 'area' }]} vazio="Carregando…" />
          </div>
        </Painel>
        <Painel titulo="Inclinação da curva (10a − 2a)" pe="Negativa (invertida) historicamente antecede recessão; a volta para positivo costuma coincidir com o início dela.">
          <div style={{ padding: '4px 6px 0' }}>
            <Grafico
              altura={200}
              desde={desde}
              formato={(v) => `${fixo(v, 2)} p.p.`}
              series={[{ nome: '10a − 2a', dados: d.tesouro.data?.inclinacao ?? [], cor: COR.bom, tipo: 'base', base: 0 }]}
              vazio="Carregando…"
            />
          </div>
        </Painel>
        <Painel titulo="Inflação e emprego (BLS)" pe="CPI cheio, ano contra ano, e taxa de desemprego (dado mensal).">
          <div style={{ padding: '4px 6px 0' }}>
            <Grafico
              altura={200}
              formato={(v) => `${fixo(v, 1)}%`}
              series={[
                { nome: 'CPI a/a', dados: d.bls.data?.cpiAa ?? [], cor: COR.btc },
                { nome: 'Desemprego', dados: d.bls.data?.desemprego ?? [], cor: COR.eth },
              ]}
              vazio={d.bls.isError ? 'BLS indisponível agora (limite de 25 consultas/dia sem chave)' : 'Carregando…'}
            />
          </div>
        </Painel>
      </div>

      <div className="section-title">
        <h2>Liquidez</h2>
      </div>
      <div className="grid g3">
        <Painel titulo="Balanço do Fed" sub="Carteira de títulos (SOMA)">
          <div style={{ padding: '4px 6px 0' }}>
            <Grafico
              altura={200}
              desde={desde}
              formato={(v) => `US$ ${fixo(v / 1e12, 2)} tri`}
              series={[{ nome: 'SOMA', dados: d.balanco.data ?? [], cor: COR.eth, tipo: 'area' }]}
              vazio="Carregando…"
            />
          </div>
        </Painel>
        <Painel titulo="Reverse repo" sub="Dinheiro estacionado no Fed">
          <div style={{ padding: '4px 6px 0' }}>
            <Grafico
              altura={200}
              desde={desde}
              formato={(v) => `US$ ${fixo(v / 1e9, 0)} bi`}
              series={[{ nome: 'RRP', dados: d.rrp.data ?? [], cor: COR.stable, tipo: 'area' }]}
              vazio="Carregando…"
            />
          </div>
        </Painel>
        <Painel titulo="Dólar (DXY)" sub="Calculado com o câmbio de referência do BCE">
          <div style={{ padding: '4px 6px 0' }}>
            <Grafico altura={200} desde={desde} formato={(v) => fixo(v, 2)} series={[{ nome: 'DXY', dados: d.dolar.data ?? [], cor: COR.btc }]} vazio="Carregando…" />
          </div>
        </Painel>
      </div>

      <div className="section-title">
        <h2>Liquidez cripto</h2>
      </div>
      <Painel>
        <div className="kpis">
          <Kpi rotulo="Stablecoins" valor={stAgora ? dinheiro(stAgora, 'USD', true) : '—'} />
          <Kpi rotulo="Variação 7 dias" valor={<Delta v={varSt(7)} />} />
          <Kpi rotulo="Variação 30 dias" valor={<Delta v={varSt(30)} />} />
          <Kpi rotulo="Variação 90 dias" valor={<Delta v={varSt(90)} />} />
          <Kpi rotulo="Market cap total" valor={global.data ? dinheiro(global.data.total_market_cap.usd, 'USD', true) : '—'} detalhe={global.data ? <Delta v={global.data.market_cap_change_percentage_24h_usd} sufixo="24h" /> : undefined} />
          <Kpi
            rotulo="Dominância do BTC"
            valor={global.data ? `${fixo(global.data.market_cap_percentage.btc, 1)}%` : '—'}
            tom={global.data && global.data.market_cap_percentage.btc > 58 ? 'aviso' : undefined}
            detalhe="> 58% = fuga de altcoins"
          />
        </div>
      </Painel>

      <div className="grid g2">
        <Painel
          titulo="Saldo e fluxo das corretoras"
          sub="Reservas comprovadas (todas as moedas), DefiLlama"
          pe="Saída líquida das corretoras = moedas indo para autocustódia (menos oferta para vender). Entrada forte costuma anteceder venda."
        >
          <div className="kpis" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
            <Kpi rotulo="Saldo total" valor={cexs.data ? dinheiro(somaCex('currentTvl'), 'USD', true) : '—'} />
            <Kpi rotulo="Fluxo 24h" valor={cexs.data ? dinheiro(somaCex('inflows_24h'), 'USD', true) : '—'} tom={somaCex('inflows_24h') < 0 ? 'ok' : undefined} />
            <Kpi rotulo="Fluxo 7d" valor={cexs.data ? dinheiro(somaCex('inflows_1w'), 'USD', true) : '—'} tom={somaCex('inflows_1w') < 0 ? 'ok' : undefined} />
            <Kpi rotulo="Fluxo 30d" valor={cexs.data ? dinheiro(somaCex('inflows_1m'), 'USD', true) : '—'} tom={somaCex('inflows_1m') < 0 ? 'ok' : undefined} />
          </div>
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Corretora</th>
                  <th>Saldo</th>
                  <th>24h</th>
                  <th className="some-celular">7d</th>
                  <th>30d</th>
                </tr>
              </thead>
              <tbody>
                {topCex.map((c) => (
                  <tr key={c.name}>
                    <td>{c.name}</td>
                    <td>{dinheiro(c.currentTvl, 'USD', true)}</td>
                    <td className={(c.inflows_24h ?? 0) >= 0 ? 'sobe' : 'desce'}>{dinheiro(c.inflows_24h, 'USD', true)}</td>
                    <td className={`some-celular ${(c.inflows_1w ?? 0) >= 0 ? 'sobe' : 'desce'}`}>{dinheiro(c.inflows_1w, 'USD', true)}</td>
                    <td className={(c.inflows_1m ?? 0) >= 0 ? 'sobe' : 'desce'}>{dinheiro(c.inflows_1m, 'USD', true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Painel>

        <Painel
          titulo="Segurança: hacks recentes"
          sub={hacks.data ? `${hacksRecentes.length} em 90 dias · ${dinheiro(perdido90, 'USD', true)} perdidos` : undefined}
          pe="Base pública da DefiLlama. Hack num protocolo ou corretora que você usa é alerta que bloqueia compra até ser resolvido."
        >
          <div className="tabela-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table className="tabela">
              <thead>
                <tr>
                  <th>Alvo</th>
                  <th>Valor</th>
                  <th className="some-celular">Técnica</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {hacks.isLoading && (
                  <tr>
                    <td colSpan={4}>
                      <Esqueleto h={60} />
                    </td>
                  </tr>
                )}
                {hacksRecentes.slice(0, 40).map((h) => (
                  <tr key={`${h.name}-${h.date}`}>
                    <td>
                      <strong>{h.name}</strong>
                      <span className="sub">{(h.chain ?? []).slice(0, 3).join(', ') || h.targetType || ''}</span>
                    </td>
                    <td>
                      {dinheiro(h.amount, 'USD', true)}
                      {h.returnedFunds ? <span className="sub sobe">devolvido {dinheiro(h.returnedFunds, 'USD', true)}</span> : null}
                    </td>
                    <td className="some-celular" style={{ whiteSpace: 'normal', maxWidth: 220 }}>
                      {h.technique ?? h.classification ?? '—'}
                    </td>
                    <td>{data(h.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Painel>
      </div>

      <p className="muted-2" style={{ fontSize: 11.5, marginTop: 12 }}>
        Fontes: NY Fed (Fed funds, reverse repo, balanço SOMA), Tesouro americano (curva nominal e real), BLS (CPI e desemprego), BCE via Frankfurter
        (câmbio do DXY), DefiLlama (stablecoins, corretoras, hacks), CoinGecko. O spread de crédito high yield só está no FRED, que não libera acesso
        pelo navegador; precisa de um backend para entrar.
      </p>
    </>
  )
}
