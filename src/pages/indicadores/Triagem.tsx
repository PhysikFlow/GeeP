import { useMemo, useState } from 'react'
import { AlertTriangle, ExternalLink, Search } from 'lucide-react'
import { COR } from '../../lib/cores'
import { data, dinheiro, fixo, numero } from '../../lib/format'
import { sma } from '../../lib/indicators/calc'
import { NIVEIS, useHacks, useRegime } from '../../lib/indicators/macro'
import { decisaoDe, totalDe } from '../../lib/indicators/dossie'
import { useDossies } from '../../lib/store'
import DossieToken from './DossieToken'
import { medianaDe, useLiquidez, useReceitaDiaria, useTriagem, type Token } from '../../lib/indicators/triagem'
import type { Serie } from '../../lib/precos'
import { Grafico } from '../../components/Grafico'
import { Aviso, Delta, Esqueleto, Ficha, IconeAtivo, Kpi, Painel, Pill } from '../../components/ui'

type Ordem = 'nota' | 'yield' | 'fdvReceita' | 'cresc' | 'mc' | 'var30d'
const x = (v: number | null, c = 1) => (v == null ? '—' : `${fixo(v, c)}×`)
const p = (v: number | null, c = 1) => (v == null ? '—' : `${fixo(v, c)}%`)

/** Bloqueiam a lista curta em qualquer nota (etapa 5). */
const bloqueia = (t: Token) => t.alertas.some((a) => a.startsWith('Diluição severa') || a.startsWith('Volume abaixo'))

export default function Triagem() {
  const q = useTriagem()
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState('todas')
  const [soReceita, setSoReceita] = useState(true)
  const [ordem, setOrdem] = useState<Ordem>('nota')
  const [limite, setLimite] = useState(60)
  const [aberto, setAberto] = useState<Token | null>(null)

  const tokens = q.data?.tokens ?? []
  const dossies = useDossies()
  const listaDossies = Object.values(dossies).sort((a, b) => totalDe(b) - totalDe(a))
  const categorias = useMemo(() => [...new Set(tokens.map((t) => t.categoria).filter(Boolean))].sort() as string[], [tokens])

  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase()
    const l = tokens.filter(
      (t) =>
        (!soReceita || (t.receita30d ?? 0) > 0) &&
        (categoria === 'todas' || t.categoria === categoria) &&
        (!b || t.simbolo.toLowerCase().includes(b) || t.nome.toLowerCase().includes(b)),
    )
    const chave: Record<Ordem, (t: Token) => number> = {
      nota: (t) => t.nota ?? -1,
      yield: (t) => t.yieldHolders ?? -1,
      fdvReceita: (t) => (t.fdvReceita == null ? -Infinity : -t.fdvReceita),
      cresc: (t) => t.crescReceita ?? -Infinity,
      mc: (t) => t.mc,
      var30d: (t) => t.var30d ?? -Infinity,
    }
    return l.sort((a, b) => chave[ordem](b) - chave[ordem](a))
  }, [tokens, busca, categoria, soReceita, ordem])

  // Lista curta: melhores notas, sem alerta que bloqueia, um por setor, até 10.
  const curta = useMemo(() => {
    const setores = new Set<string>()
    const out: Token[] = []
    for (const t of [...tokens].sort((a, b) => (b.nota ?? 0) - (a.nota ?? 0))) {
      if (out.length >= 10) break
      if ((t.nota ?? 0) < 60 || bloqueia(t)) continue
      const s = t.categoria ?? t.id
      if (setores.has(s)) continue
      setores.add(s)
      out.push(t)
    }
    return out
  }, [tokens])

  const comReceita = tokens.filter((t) => (t.receita30d ?? 0) > 0)

  return (
    <>
      {q.error && !q.data && <Aviso tom="erro">Não consegui montar a triagem agora: {(q.error as Error).message}</Aviso>}

      <Painel>
        <div className="kpis">
          <Kpi rotulo="Universo (top CoinGecko)" valor={q.data ? numero(q.data.universo, 0) : '—'} detalhe={q.data ? `${q.data.excluidos} fora: BTC/ETH/BNB, stables, embrulhados, tokenizados` : undefined} />
          <Kpi rotulo="Passaram o filtro mínimo" valor={q.data ? numero(tokens.length, 0) : '—'} detalhe="market cap ≥ US$ 100 mi e volume ≥ US$ 1 mi" />
          <Kpi rotulo="Com receita mapeada" valor={q.data ? numero(comReceita.length, 0) : '—'} detalhe="DefiLlama fees/revenue" />
          <Kpi rotulo="FDV/receita mediano" valor={x(medianaDe(comReceita.map((t) => t.fdvReceita)), 0)} detalhe={`yield mediano ${p(medianaDe(comReceita.map((t) => t.yieldHolders)), 2)}`} />
        </div>
      </Painel>

      <div className="grid g-1-2">
        <Painel
          titulo="Lista curta da etapa 2"
          sub="Nota ≥ 60, sem alerta de bloqueio, um por setor"
          pe="Isto NÃO é recomendação: é quem merece o dossiê de fundamentos (produto, adoção orgânica, unlocks, concorrência, valuation, riscos) e o bear case."
        >
          <div className="rows">
            {q.isLoading && (
              <div className="panel-body">
                <Esqueleto h={180} />
              </div>
            )}
            {curta.map((t) => (
              <button key={t.id} className="row" onClick={() => setAberto(t)} style={{ gridTemplateColumns: '34px minmax(0,1fr) auto' }}>
                <IconeAtivo src={t.icone} simbolo={t.simbolo} />
                <div className="row-main">
                  <strong>
                    {t.simbolo} <span className="muted-2" style={{ display: 'inline', fontWeight: 400 }}>{t.nome}</span>
                  </strong>
                  <span>
                    {t.categoria ?? 'sem setor'} · FDV/receita {x(t.fdvReceita, 0)} · yield {p(t.yieldHolders, 2)}
                  </span>
                </div>
                <div className="row-end">
                  <strong>{t.nota}</strong>
                  <span className="muted-2">nota</span>
                </div>
              </button>
            ))}
            {q.data && curta.length === 0 && <div className="vazio">Nenhum token passou em tudo hoje. "Não fazer nada" também é decisão.</div>}
          </div>
        </Painel>
        <Painel titulo="Como a nota quantitativa é feita">
          <div className="panel-body explica">
            <p>
              Percentil de cada métrica entre os tokens <b>com receita</b>, com pesos: <b>receita para o detentor ÷ market cap</b> (o "dividend
              yield") 30 · <b>FDV ÷ receita anualizada</b> (o "P/L", quanto menor melhor) 25 · <b>crescimento da receita</b> (30 dias contra a média
              dos 11 meses anteriores) 15 · <b>FDV ÷ market cap</b> (diluição pendente) 15 · <b>volume ÷ market cap</b> 15.
            </p>
            <p>
              Cobre só a parte mensurável de "adoção e economia", "tokenomics" e "valuation". As outras partes da nota de 0 a 100 (posição
              competitiva, narrativa, macro) e os alertas de fraude, segurança e processo exigem leitura. Unlocks detalhados dependem do
              Tokenomist (API paga) — o link está no detalhe de cada token.
            </p>
            <p>Liquidez de saída (spread e profundidade a ±2% na Bybit, com OKX de reserva) é medida ao abrir o token.</p>
          </div>
        </Painel>
      </div>

      {listaDossies.length > 0 && (
        <>
          <div className="section-title">
            <h2>Meus dossiês</h2>
            <span>Etapas 3–5, guardadas neste aparelho</span>
          </div>
          <Painel>
            <div className="rows">
              {listaDossies.map((d) => {
                const dec = decisaoDe(d)
                const tk = tokens.find((x) => x.id === d.id)
                return (
                  <button
                    key={d.id}
                    className="row"
                    style={{ gridTemplateColumns: '34px minmax(0,1fr) auto' }}
                    onClick={() => tk && setAberto(tk)}
                    disabled={!tk}
                    title={tk ? undefined : 'Token fora da triagem de hoje (filtro de market cap/volume)'}
                  >
                    <IconeAtivo src={tk?.icone} simbolo={d.simbolo} />
                    <div className="row-main">
                      <strong>
                        {d.simbolo} <span className="muted-2" style={{ display: 'inline', fontWeight: 400 }}>{d.nome}</span>
                      </strong>
                      <span>{dec.detalhe}</span>
                    </div>
                    <div className="row-end">
                      <Pill tom={dec.tom}>
                        {totalDe(d)} · {dec.rotulo}
                      </Pill>
                    </div>
                  </button>
                )
              })}
            </div>
          </Painel>
        </>
      )}

      <div className="section-title">
        <h2>Todos os tokens</h2>
        <span>Clique para ver receita, liquidez e riscos</span>
      </div>
      <div className="toolbar">
        <div className="campo-busca grow">
          <Search size={14} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar token" />
        </div>
        <select className="sel" value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Setor">
          <option value="todas">Todos os setores</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select className="sel" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} aria-label="Ordenar">
          <option value="nota">Maior nota</option>
          <option value="yield">Maior yield p/ detentor</option>
          <option value="fdvReceita">Menor FDV/receita</option>
          <option value="cresc">Maior crescimento de receita</option>
          <option value="mc">Maior market cap</option>
          <option value="var30d">Maior alta em 30d</option>
        </select>
        <label className="check">
          <input type="checkbox" checked={soReceita} onChange={(e) => setSoReceita(e.target.checked)} />
          Só com receita
        </label>
      </div>

      <Painel>
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr>
                <th>Token</th>
                <th>Nota</th>
                <th className="some-celular">Market cap</th>
                <th>FDV/MC</th>
                <th>FDV/receita</th>
                <th>Yield detentor</th>
                <th className="some-celular">Receita 30d</th>
                <th className="some-celular">Cresc. receita</th>
                <th className="some-celular">Vol/MC</th>
                <th className="some-celular">30d</th>
                <th className="some-celular">Alertas</th>
              </tr>
            </thead>
            <tbody>
              {q.isLoading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={11}>
                      <Esqueleto h={22} />
                    </td>
                  </tr>
                ))}
              {lista.slice(0, limite).map((t) => (
                <tr key={t.id} className="clicavel" onClick={() => setAberto(t)}>
                  <td>
                    <div className="ativo-cel">
                      <IconeAtivo src={t.icone} simbolo={t.simbolo} pequeno />
                      <div style={{ minWidth: 0 }}>
                        <strong>{t.simbolo}</strong>
                        <span className="sub">{t.categoria ?? t.nome}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <b className={t.nota == null ? 'muted-2' : t.nota >= 75 ? 'sobe' : t.nota < 50 ? 'desce' : ''}>{t.nota ?? '—'}</b>
                  </td>
                  <td className="some-celular">{dinheiro(t.mc, 'USD', true)}</td>
                  <td className={t.fdvMc != null && t.fdvMc > 1.6 ? 'desce' : ''}>{x(t.fdvMc, 2)}</td>
                  <td>{x(t.fdvReceita, 0)}</td>
                  <td>{p(t.yieldHolders, 2)}</td>
                  <td className="some-celular">{dinheiro(t.receita30d, 'USD', true)}</td>
                  <td className="some-celular">
                    <Delta v={t.crescReceita} casas={0} />
                  </td>
                  <td className="some-celular">{p(t.volMc, 1)}</td>
                  <td className="some-celular">
                    <Delta v={t.var30d} casas={0} />
                  </td>
                  <td className="some-celular">
                    {t.alertas.length > 0 ? (
                      <Pill tom={bloqueia(t) ? 'perigo' : 'aviso'} title={t.alertas.join('\n')}>
                        <AlertTriangle size={11} /> {t.alertas.length}
                      </Pill>
                    ) : (
                      <Pill tom="ok">ok</Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {lista.length > limite && (
          <div className="panel-foot">
            <button className="btn quiet sm" onClick={() => setLimite((l) => l + 60)}>
              Ver mais ({lista.length - limite})
            </button>
          </div>
        )}
      </Painel>

      <Ficha
        aberta={!!aberto}
        onFechar={() => setAberto(null)}
        topo={
          aberto ? (
            <>
              <IconeAtivo src={aberto.icone} simbolo={aberto.simbolo} />
              <div className="titulo">
                <strong>
                  {aberto.simbolo} · {aberto.nome}
                </strong>
                <span>{aberto.categoria ?? 'Setor não mapeado'}</span>
              </div>
            </>
          ) : null
        }
      >
        {aberto && <DetalheToken t={aberto} />}
      </Ficha>
    </>
  )
}

function DetalheToken({ t }: { t: Token }) {
  const rec = useReceitaDiaria(t.slug)
  const liq = useLiquidez(t.simbolo)
  const hacks = useHacks()
  const regime = useRegime()
  const nomeBase = t.nome.toLowerCase().split(' ')[0]
  const hacksDele = (hacks.data ?? []).filter((h) => h.name.toLowerCase().includes(nomeBase) && nomeBase.length >= 3).slice(0, 5)

  const suave = (s: [number, number][] | undefined): Serie => (s?.length ? sma(s, 7) : [])
  const circPct = t.circulante && t.total ? (t.circulante / t.total) * 100 : null
  const liqOk = liq.data ? Math.min(liq.data.profCompra, liq.data.profVenda) >= 50_000 && liq.data.spread < 0.5 : null

  return (
    <>
      {t.alertas.map((a) => (
        <Aviso key={a} tom={a.startsWith('Diluição severa') || a.startsWith('Volume abaixo') ? 'erro' : 'aviso'}>
          {a}
        </Aviso>
      ))}

      <div className="panel">
        <div className="kpis" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
          <Kpi rotulo="Preço" valor={dinheiro(t.preco)} detalhe={<Delta v={t.var30d} casas={1} sufixo="em 30d" />} />
          <Kpi rotulo="Market cap" valor={dinheiro(t.mc, 'USD', true)} detalhe={`FDV ${dinheiro(t.fdv, 'USD', true)}`} />
          <Kpi rotulo="FDV/MC" valor={x(t.fdvMc, 2)} detalhe={circPct != null ? `${fixo(circPct, 0)}% da oferta em circulação` : undefined} tom={t.fdvMc != null && t.fdvMc > 1.6 ? 'aviso' : undefined} />
          <Kpi rotulo="Nota quantitativa" valor={t.nota ?? '—'} tom={t.nota == null ? undefined : t.nota >= 75 ? 'ok' : t.nota < 50 ? 'perigo' : undefined} />
          <Kpi rotulo="Volume 24h" valor={dinheiro(t.volume, 'USD', true)} detalhe={`${p(t.volMc, 1)} do market cap`} />
          <Kpi rotulo="TVL" valor={dinheiro(t.tvl, 'USD', true)} />
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Economia do protocolo</h2>
          <span className="sub">DefiLlama · 30 dias</span>
        </div>
        <div className="detalhes">
          <div>
            <span>Taxas pagas</span>
            <b>{dinheiro(t.taxas30d, 'USD', true)}</b>
          </div>
          <div>
            <span>Receita do protocolo</span>
            <b>{dinheiro(t.receita30d, 'USD', true)}</b>
          </div>
          <div>
            <span>Receita para o detentor</span>
            <b>{dinheiro(t.holders30d, 'USD', true)}</b>
          </div>
          <div>
            <span>FDV ÷ receita anual ("P/L")</span>
            <b>{x(t.fdvReceita, 0)}</b>
          </div>
          <div>
            <span>Yield para o detentor</span>
            <b>{p(t.yieldHolders, 2)}</b>
          </div>
          <div>
            <span>Crescimento da receita</span>
            <b>
              <Delta v={t.crescReceita} casas={0} />
            </b>
          </div>
        </div>
        <div style={{ padding: '4px 6px 0' }}>
          {rec.isLoading ? (
            <div style={{ padding: 10 }}>
              <Esqueleto h={200} />
            </div>
          ) : (
            <Grafico
              altura={210}
              formato={(v) => dinheiro(v, 'USD', true)}
              series={[
                { nome: 'Taxas', dados: suave(rec.data?.taxas), cor: COR.muted2, largura: 1 },
                { nome: 'Receita', dados: suave(rec.data?.receita), cor: COR.eth },
                { nome: 'Para o detentor', dados: suave(rec.data?.holders), cor: COR.sol },
              ]}
              vazio={t.slug ? 'Sem série diária na DefiLlama' : 'Protocolo não mapeado na DefiLlama'}
            />
          )}
        </div>
        <div className="panel-foot">Média móvel de 7 dias, último ano. Taxas = o que os usuários pagam; receita = o que fica com o protocolo; detentor = o que chega ao token.</div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Liquidez de saída</h2>
          {liqOk != null && <Pill tom={liqOk ? 'ok' : 'perigo'}>{liqOk ? 'dá para sair' : 'saída difícil'}</Pill>}
        </div>
        {liq.isLoading ? (
          <div className="panel-body">
            <Esqueleto h={50} />
          </div>
        ) : liq.data ? (
          <div className="detalhes">
            <div>
              <span>Par</span>
              <b>
                {liq.data.par} · {liq.data.corretora}
              </b>
            </div>
            <div>
              <span>Spread</span>
              <b>{p(liq.data.spread, 3)}</b>
            </div>
            <div>
              <span>Compra até −2%</span>
              <b>{dinheiro(liq.data.profCompra, 'USD', true)}</b>
            </div>
            <div>
              <span>Venda até +2%</span>
              <b>{dinheiro(liq.data.profVenda, 'USD', true)}</b>
            </div>
          </div>
        ) : (
          <div className="panel-body">
            <Aviso tom="erro">Par {t.simbolo}/USDT não encontrado na Bybit nem na OKX: pela regra, sai da lista.</Aviso>
          </div>
        )}
        <div className="panel-foot">Critério: spread abaixo de 0,5% e pelo menos US$ 50 mil de cada lado a ±2% do preço.</div>
      </div>

      {liq.isFetched ? (
        <DossieToken t={t} nivel={regime.nivel} saidaRuim={liq.data ? !liqOk : true} />
      ) : (
        <Esqueleto h={80} />
      )}
      {regime.nivel === 3 && <Aviso>Ambiente em {NIVEIS[3].nome.toLowerCase()}: mesmo com nota alta, o método pede ritmo reduzido.</Aviso>}

      <div className="panel">
        <div className="panel-head">
          <h2>Riscos e próximos passos</h2>
        </div>
        <div className="panel-body explica">
          {hacksDele.length > 0 ? (
            hacksDele.map((h) => (
              <p key={`${h.name}${h.date}`}>
                <b style={{ color: 'var(--danger-txt)' }}>Hack:</b> {h.name} — {dinheiro(h.amount, 'USD', true)} em {data(h.date)} ({h.technique ?? h.classification ?? 'técnica não informada'})
              </p>
            ))
          ) : (
            <p>Nenhum hack com esse nome na base da DefiLlama.</p>
          )}
          <p>
            Falta conferir à mão: calendário de unlocks dos próximos 12 meses, concentração em time e fundos, o mecanismo exato pelo qual a receita
            chega ao token (e quem pode mudá-lo), concorrentes lado a lado, governança, regulação e chaves de administrador.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <a className="btn secondary sm" href={`https://www.coingecko.com/en/coins/${t.id}`} target="_blank" rel="noreferrer">
              CoinGecko <ExternalLink size={12} />
            </a>
            {t.slug && (
              <a className="btn secondary sm" href={`https://defillama.com/protocol/${t.slug}`} target="_blank" rel="noreferrer">
                DefiLlama <ExternalLink size={12} />
              </a>
            )}
            <a className="btn secondary sm" href={`https://tokenomist.ai/${t.id}`} target="_blank" rel="noreferrer">
              Unlocks (Tokenomist) <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </div>
    </>
  )
}
