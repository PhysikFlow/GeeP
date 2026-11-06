import { useMemo, useState } from 'react'
import { ChevronRight, Loader2, Pencil, Plus, Wallet } from 'lucide-react'
import { COR, COR_GRUPO, COR_NATIVO, COR_REDE } from '../lib/cores'
import { data, dinheiro, encurtar, fixo, pct, qtd, tomDe } from '../lib/format'
import { usePortfolio, type Benchmarks, type Posicao } from '../lib/portfolio'
import { useConversao, useMercado } from '../lib/precos'
import { NATIVO_DA_REDE, NOME_DA_REDE, useCarteiras, type Carteira, type Nativo } from '../lib/store'
import { Grafico, inicioDaJanela, JANELAS, type Janela } from '../components/Grafico'
import { Donut } from '../components/Visuais'
import { Aviso, Delta, Esqueleto, Ficha, IconeAtivo, Kpi, Painel, Privado, Segmentado } from '../components/ui'
import AdicionarCarteira from './portfolio/AdicionarCarteira'
import AtivoModal from './portfolio/AtivoModal'
import CarteiraFicha, { TopoCarteira } from './portfolio/CarteiraFicha'

export default function PortfolioPage() {
  const carteiras = useCarteiras()
  const pf = usePortfolio()
  const { moeda, conv } = useConversao()
  const [adicionar, setAdicionar] = useState(false)
  const [aberta, setAberta] = useState<string | null>(null)
  const [ativo, setAtivo] = useState<string | null>(null)
  const [janela, setJanela] = useState<Janela>('1a')
  const [modoGrafico, setModoGrafico] = useState<'total' | 'ativos'>('total')
  const [verOcultos, setVerOcultos] = useState(false)
  const [verTodosTokens, setVerTodosTokens] = useState(false)

  const carteiraAberta = carteiras.find((c) => c.id === aberta) ?? null
  const posAtivo = [...pf.posicoes, ...pf.ocultos].find((p) => p.chave === ativo) ?? null

  const resumoCusto = useMemo(() => {
    let custo = 0
    let valor = 0
    for (const p of pf.posicoes) {
      if (!p.nativo || !p.custo) continue
      const medio = moeda === 'BRL' ? p.custo.precoMedioBrl : p.custo.precoMedioUsd
      const v = conv(p.valorUsd)
      if (medio == null || v == null) continue
      custo += medio * p.qtd
      valor += v
    }
    return custo > 0 ? { custo, resultado: valor - custo, pct: (valor / custo - 1) * 100 } : null
  }, [pf.posicoes, moeda, conv])

  if (carteiras.length === 0) {
    return (
      <div className="page">
        <Painel>
          <div className="vazio" style={{ padding: '56px 20px' }}>
            <Wallet size={36} />
            <h2 style={{ color: 'var(--text)' }}>Comece adicionando uma carteira</h2>
            <p style={{ maxWidth: 460 }}>
              Cole um endereço público de Bitcoin (inclusive xpub/zpub), Ethereum (ou nome .eth) ou Solana. O app lê saldo, tokens,
              histórico e estima seu preço médio — sem conectar carteira e sem cadastro.
            </p>
            <button className="btn primary" onClick={() => setAdicionar(true)}>
              <Plus size={15} /> Adicionar carteira
            </button>
          </div>
        </Painel>
        {adicionar && <AdicionarCarteira onFechar={() => setAdicionar(false)} />}
      </div>
    )
  }

  // Nativos sempre; dos tokens, só os maiores (uma carteira antiga tem centenas).
  const TOPO_TOKENS = 12
  const tokensComPreco = pf.posicoes.filter((p) => !p.nativo)
  const tokensForaDoTopo = Math.max(0, tokensComPreco.length - TOPO_TOKENS)
  const visiveisTokens = new Set((verTodosTokens ? tokensComPreco : tokensComPreco.slice(0, TOPO_TOKENS)).map((p) => p.chave))
  const linhasAtivos = [...pf.posicoes.filter((p) => p.nativo || visiveisTokens.has(p.chave)), ...(verOcultos ? pf.ocultos.slice(0, 200) : [])]

  const total = conv(pf.totalUsd)
  const delta24 = conv(pf.delta24Usd)
  const delta24Pct = pf.totalUsd > 0 ? (pf.delta24Usd / (pf.totalUsd - pf.delta24Usd)) * 100 : null
  const evolucao = moeda === 'BRL' ? pf.evolucaoBrl : pf.evolucaoUsd
  const porAtivo = moeda === 'BRL' ? pf.seriesPorAtivoBrl : pf.seriesPorAtivo
  const fatias = pf.alocacao.filter(([, v]) => v > 0).map(([g, v]) => ({ rotulo: g, valor: v, cor: COR_GRUPO[g] ?? COR.outros }))
  const somaAloc = fatias.reduce((s, f) => s + f.valor, 0)
  const fmtMoeda = (v: number) => dinheiro(v, moeda, true)

  return (
    <div className="page">
      {pf.erros.map(({ carteira, erro }) => (
        <div key={carteira.id} style={{ marginBottom: 10 }}>
          <Aviso tom="erro" acao={<button className="btn secondary sm" onClick={() => setAberta(carteira.id)}>Ver</button>}>
            <b>{carteira.nome}:</b> {erro.message}
          </Aviso>
        </div>
      ))}

      <Painel>
        <div className="hero">
          <div className="hero-main">
            <div className="hero-label">
              Patrimônio {pf.atualizando && <Loader2 size={13} className="gira" />}
            </div>
            <div className="hero-valor num">{pf.carregando ? <Esqueleto h={36} w={220} /> : <Privado>{dinheiro(total, moeda)}</Privado>}</div>
            <div className="hero-sub">
              <span className={pf.carregando ? 'muted-2' : tomDe(delta24)}>
                <Privado>{delta24 != null ? `${delta24 >= 0 ? '+' : ''}${dinheiro(delta24, moeda)}` : '—'}</Privado> ({pct(delta24Pct)}) em 24h
              </span>
            </div>
          </div>
          <div className="hero-stats">
            <div className="stat">
              <span>Custo estimado (BTC/ETH/SOL)</span>
              <strong className="num">
                <Privado>{resumoCusto ? dinheiro(resumoCusto.custo, moeda) : '—'}</Privado>
              </strong>
            </div>
            <div className="stat">
              <span>Resultado não realizado</span>
              <strong className={`num ${tomDe(resumoCusto?.resultado)}`}>
                <Privado>{resumoCusto ? `${resumoCusto.resultado >= 0 ? '+' : ''}${dinheiro(resumoCusto.resultado, moeda)}` : '—'}</Privado>
                {resumoCusto && <span style={{ fontSize: 12, marginLeft: 6 }}>{pct(resumoCusto.pct)}</span>}
              </strong>
            </div>
            <div className="stat">
              <span>Carteiras</span>
              <strong>{carteiras.length}</strong>
            </div>
          </div>
        </div>
      </Painel>

      <div className="grid g-2-1">
        <Painel
          titulo="Evolução do patrimônio"
          sub="Moedas nativas com histórico, pelo preço de cada dia"
          acoes={
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <Segmentado
                rotulo="Modo"
                valor={modoGrafico}
                opcoes={[
                  { valor: 'total', rotulo: 'Total' },
                  { valor: 'ativos', rotulo: 'Por ativo' },
                ]}
                onChange={setModoGrafico}
              />
              <Segmentado rotulo="Período" valor={janela} opcoes={JANELAS} onChange={setJanela} />
            </div>
          }
        >
          <div style={{ padding: '6px 6px 4px' }}>
            {pf.historicoCarregando && evolucao.length === 0 ? (
              <div style={{ padding: 10 }}>
                <Esqueleto h={260} />
              </div>
            ) : (
              <Grafico
                altura={280}
                desde={inicioDaJanela(janela)}
                formato={fmtMoeda}
                vazio="Ainda sem histórico (Solana precisa da chave Helius)"
                series={
                  modoGrafico === 'total'
                    ? [{ nome: 'Patrimônio', dados: evolucao, cor: COR.acento, tipo: 'area' }]
                    : (Object.entries(porAtivo) as [Nativo, typeof evolucao][]).map(([n, s]) => ({ nome: n, dados: s, cor: COR_NATIVO[n] }))
                }
              />
            )}
          </div>
        </Painel>

        <Painel titulo="Alocação" sub="Derivados contam na moeda (WBTC no BTC, stETH no ETH…)">
          <div className="panel-body">
            <div className="donut-wrap">
              <Donut
                fatias={fatias}
                centro={
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{fatias.length} grupos</div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>
                      <Privado>{dinheiro(total, moeda, true)}</Privado>
                    </div>
                  </div>
                }
              />
              <div className="legenda">
                {fatias.map((f) => (
                  <div key={f.rotulo} className="legenda-item" style={{ ['--cor' as string]: f.cor }}>
                    <i />
                    <span>{f.rotulo}</span>
                    <b>
                      <Privado>{dinheiro(conv(f.valor), moeda, true)}</Privado>
                    </b>
                    <span>{somaAloc ? fixo(((f.valor / somaAloc) * 100), 1) : 0}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Painel>
      </div>

      {pf.benchmarks && <PainelBenchmarks b={pf.benchmarks} />}

      <div className="section-title">
        <h2>Ativos</h2>
        <span>Clique em BTC, ETH ou SOL para ver ou informar o preço médio</span>
      </div>
      <Painel>
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr>
                <th>Ativo</th>
                <th>Preço</th>
                <th className="some-celular">24h</th>
                <th>Valor</th>
                <th className="some-celular">Preço médio</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {pf.carregando && pf.posicoes.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <Esqueleto h={30} />
                  </td>
                </tr>
              )}
              {linhasAtivos.map((p) => (
                <LinhaAtivo key={p.chave} p={p} onAbrir={() => p.nativo && setAtivo(p.chave)} />
              ))}
            </tbody>
          </table>
        </div>
        {(pf.ocultos.length > 0 || tokensForaDoTopo > 0) && (
          <div className="panel-foot" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {tokensForaDoTopo > 0 && (
              <button className="btn quiet sm" onClick={() => setVerTodosTokens((v) => !v)}>
                {verTodosTokens ? 'Só os maiores' : `Mais ${tokensForaDoTopo} token(s) com preço`}
              </button>
            )}
            {pf.ocultos.length > 0 && (
              <button className="btn quiet sm" onClick={() => setVerOcultos((v) => !v)}>
                {verOcultos ? 'Esconder' : 'Mostrar'} {pf.ocultos.length} sem preço, sem liquidez ou abaixo de US$ 0,50
              </button>
            )}
          </div>
        )}
      </Painel>

      <div className="section-title">
        <h2>Carteiras</h2>
        <button className="btn primary sm" onClick={() => setAdicionar(true)}>
          <Plus size={14} /> Adicionar
        </button>
      </div>
      <Painel>
        <div className="rows">
          {carteiras.map((c, i) => (
            <LinhaCarteira key={c.id} c={c} consulta={pf.consultas[i]} onAbrir={() => setAberta(c.id)} />
          ))}
        </div>
      </Painel>

      <p className="rodape-fontes">
        Fontes: mempool.space (Bitcoin), Blockscout e Ethplorer (Ethereum), Jupiter e publicnode (Solana), CoinGecko e Binance (preços),
        AwesomeAPI (câmbio). Preço médio é estimativa pelas entradas on-chain — não é recomendação de investimento.
      </p>

      <Ficha aberta={!!carteiraAberta} onFechar={() => setAberta(null)} topo={carteiraAberta ? <TopoCarteira c={carteiraAberta} /> : null}>
        {carteiraAberta && <CarteiraFicha key={carteiraAberta.id} c={carteiraAberta} onRemovida={() => setAberta(null)} />}
      </Ficha>
      {adicionar && <AdicionarCarteira onFechar={() => setAdicionar(false)} onAdicionada={() => undefined} />}
      {posAtivo && <AtivoModal p={posAtivo} onFechar={() => setAtivo(null)} />}
    </div>
  )
}

function LinhaAtivo({ p, onAbrir }: { p: Posicao; onAbrir: () => void }) {
  const { moeda, conv } = useConversao()
  const c = p.custo
  const medio = c ? (moeda === 'BRL' ? c.precoMedioBrl : c.precoMedioUsd) : null
  const valor = conv(p.valorUsd)
  const custoTotal = medio != null ? medio * p.qtd : null
  const resultado = custoTotal != null && valor != null ? valor - custoTotal : null
  const resultadoPct = custoTotal ? ((valor ?? 0) / custoTotal - 1) * 100 : null
  return (
    <tr className={p.nativo ? 'clicavel' : undefined} onClick={onAbrir}>
      <td>
        <div className="ativo-cel">
          <IconeAtivo src={p.icone} simbolo={p.simbolo} />
          <div style={{ minWidth: 0 }}>
            <strong>{p.simbolo}</strong>
            <span className="sub">
              <Privado>{qtd(p.qtd)}</Privado>
              {p.pendente ? ` (+${qtd(p.pendente)} pend.)` : ''} · {p.nativo ? NOME_DA_REDE[p.rede] : `token ${p.rede.toUpperCase()}`}
            </span>
          </div>
        </div>
      </td>
      <td>{dinheiro(conv(p.precoUsd), moeda)}</td>
      <td className="some-celular">
        <Delta v={p.var24h} />
      </td>
      <td>
        <Privado>{dinheiro(valor, moeda)}</Privado>
      </td>
      <td className="some-celular">
        {p.nativo ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {medio != null ? dinheiro(medio, moeda) : <span className="muted-2">{c?.cobertura[0] === 0 ? 'sem histórico' : 'calculando…'}</span>}
            {c?.manual ? <span className="pill acento">manual</span> : medio != null ? <span className="pill">estimado</span> : null}
            <Pencil size={12} className="muted-2" />
          </span>
        ) : (
          <span className="muted-2">—</span>
        )}
      </td>
      <td>
        {resultado != null ? (
          <span className={tomDe(resultado)}>
            <Privado>{`${resultado >= 0 ? '+' : ''}${dinheiro(resultado, moeda, true)}`}</Privado>
            <span className="sub">{pct(resultadoPct)}</span>
          </span>
        ) : (
          <span className="muted-2">—</span>
        )}
      </td>
    </tr>
  )
}

function LinhaCarteira({
  c,
  consulta,
  onAbrir,
}: {
  c: Carteira
  consulta: ReturnType<typeof usePortfolio>['consultas'][number] | undefined
  onAbrir: () => void
}) {
  const { moeda, conv } = useConversao()
  const mercado = useMercado().data
  const d = consulta?.data
  const preco = mercado?.[NATIVO_DA_REDE[c.rede]]?.preco
  const valorTokens = (d?.tokens ?? []).filter((t) => t.confiavel).reduce((s, t) => s + t.qtd * (t.precoUsd ?? 0), 0)
  const valor = d && preco != null ? d.saldo * preco + valorTokens : null
  return (
    <button className="row" onClick={onAbrir}>
      <span className="chip-rede" style={{ ['--cor' as string]: COR_REDE[c.rede] }}>
        {c.rede.toUpperCase()}
      </span>
      <div className="row-main">
        <strong>{c.nome}</strong>
        <span className="mono">
          {c.tipo === 'xpub' ? `${c.endereco.slice(0, 4)} · ${d?.enderecos?.length ?? '…'} endereços` : encurtar(c.endereco, 7)}
          {c.ens && c.ens !== c.nome ? ` · ${c.ens}` : ''}
        </span>
      </div>
      <div className="row-end">
        {consulta?.isLoading ? (
          <Loader2 size={15} className="gira muted-2" />
        ) : consulta?.error && !d ? (
          <span className="pill perigo">erro</span>
        ) : (
          <>
            <strong className="num">
              <Privado>{dinheiro(conv(valor), moeda)}</Privado>
            </strong>
            <span className="muted-2 num">
              <Privado>
                {qtd(d?.saldo)} {NATIVO_DA_REDE[c.rede]}
              </Privado>
              {d && d.tokens.filter((t) => t.confiavel).length > 0 ? ` + ${d.tokens.filter((t) => t.confiavel).length} tokens` : ''}
            </span>
          </>
        )}
      </div>
      <ChevronRight size={16} className="row-chevron" />
    </button>
  )
}

function PainelBenchmarks({ b }: { b: Benchmarks }) {
  const { moeda, conv } = useConversao()
  const ret = (v: number) => (b.investido > 0 ? (v / b.investido - 1) * 100 : null)
  const linhas = [
    { nome: 'Sua carteira', v: b.carteira, destaque: true },
    { nome: 'Só BTC', v: b.soBtc, destaque: false },
    { nome: '50% BTC / 50% ETH', v: b.metade, destaque: false },
  ]
  const melhorBench = Math.max(b.soBtc, b.metade)
  const bate = b.carteira >= melhorBench
  // diferença menor que 1% é empate (uma carteira só de BTC empata com "só BTC")
  const empate = (v: number) => Math.abs(b.carteira - v) <= Math.max(1, v * 0.01)
  const frase = (() => {
    const vsBtc = empate(b.soBtc) ? 'empata com "só BTC"' : b.carteira > b.soBtc ? 'bate "só BTC"' : 'perde para "só BTC"'
    const vsMeia = empate(b.metade) ? 'empata com o 50/50' : b.carteira > b.metade ? 'bate o 50/50' : 'perde para o 50/50'
    return `Sua carteira ${vsBtc} e ${vsMeia}.`
  })()
  return (
    <>
      <div className="section-title">
        <h2>Contra os benchmarks</h2>
        <span>Mesmo dinheiro, mesmas datas, desde {data(b.desde)}</span>
      </div>
      <Painel
        pe={
          <>
            Cada entrada nas suas carteiras (em dólar do dia) "compra" o benchmark naquele dia; cada saída "vende". Conta só BTC, ETH e SOL com
            histórico — tokens ficam de fora. A regra do método: se não bater os dois em 12–24 meses, a complexidade não se pagou.
          </>
        }
      >
        <div className="kpis" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          <Kpi rotulo="Aporte líquido" valor={<Privado>{dinheiro(conv(b.investido), moeda, true)}</Privado>} detalhe="entradas − saídas" />
          {linhas.map((l) => (
            <Kpi
              key={l.nome}
              rotulo={l.nome}
              valor={<Privado>{dinheiro(conv(l.v), moeda, true)}</Privado>}
              detalhe={<Delta v={ret(l.v)} casas={1} sufixo="sobre o aporte" />}
              tom={l.destaque ? (bate || empate(melhorBench) ? 'ok' : 'perigo') : undefined}
            />
          ))}
        </div>
        <div className="panel-body" style={{ paddingTop: 10 }}>
          <span className={bate || empate(melhorBench) ? 'sobe' : 'desce'} style={{ fontWeight: 600 }}>
            {frase}
          </span>
        </div>
      </Painel>
    </>
  )
}
