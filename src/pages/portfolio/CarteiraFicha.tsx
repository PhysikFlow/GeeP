import { useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, ExternalLink, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { COR_REDE } from '../../lib/cores'
import { saldoDiario } from '../../lib/custo'
import { linkEndereco, linkEnderecoBtc, linkTx } from '../../lib/explorador'
import { data, dinheiro, encurtar, numero, qtd, relativo } from '../../lib/format'
import { useDadosCarteira } from '../../lib/portfolio'
import { cambioEm, useCambio, useConversao, useHistorico, useMercado, valorEm, type Serie } from '../../lib/precos'
import { editarCarteira, NOME_DA_REDE, removerCarteira, type Carteira } from '../../lib/store'
import { Grafico, inicioDaJanela, JANELAS, type Janela } from '../../components/Grafico'
import { Aviso, Copiar, Esqueleto, IconeAtivo, Kpi, Privado, Segmentado } from '../../components/ui'

export function TopoCarteira({ c }: { c: Carteira }) {
  return (
    <>
      <span className="chip-rede" style={{ ['--cor' as string]: COR_REDE[c.rede] }}>
        {c.rede.toUpperCase()}
      </span>
      <div className="titulo">
        <strong>{c.nome}</strong>
        <span>
          {NOME_DA_REDE[c.rede]} · {c.tipo === 'xpub' ? 'chave estendida' : encurtar(c.endereco, 8)}
        </span>
      </div>
    </>
  )
}

export default function CarteiraFicha({ c, onRemovida }: { c: Carteira; onRemovida: () => void }) {
  const q = useDadosCarteira(c)
  const d = q.data
  const mercado = useMercado().data
  const { moeda, conv } = useConversao()
  const cambio = useCambio().data ?? 5
  const hist = useHistorico(c.rede === 'btc' ? 'BTC' : c.rede === 'eth' ? 'ETH' : 'SOL', !!d?.movimentos?.length)
  const fx = useHistorico('USDBRL', moeda === 'BRL' && !!d?.movimentos?.length)
  const [janela, setJanela] = useState<Janela>('1a')
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(c.nome)
  const [verTodosTokens, setVerTodosTokens] = useState(false)
  const [confirmar, setConfirmar] = useState(false)

  const preco = d ? (mercado?.[d.nativo]?.preco ?? null) : null
  const valorNativo = d && preco != null ? d.saldo * preco : null
  const tokensValidos = (d?.tokens ?? []).filter((t) => t.confiavel && t.precoUsd != null).sort((a, b) => b.qtd * (b.precoUsd ?? 0) - a.qtd * (a.precoUsd ?? 0))
  const tokensOutros = (d?.tokens ?? []).filter((t) => !tokensValidos.includes(t))
  const valorTokens = tokensValidos.reduce((s, t) => s + t.qtd * (t.precoUsd ?? 0), 0)

  const series = useMemo(() => {
    if (!d?.movimentos?.length || !hist.data) return null
    const q: Serie = saldoDiario(d.movimentos, d.saldo)
    const v: Serie = q.map(([t, x]) => {
      const usd = x * (valorEm(hist.data!, t) ?? 0)
      return [t, moeda === 'BRL' ? usd * cambioEm(fx.data ?? [], t, cambio) : usd]
    })
    return { q, v }
  }, [d, hist.data, fx.data, moeda, cambio])

  const link = linkEndereco(c)

  return (
    <>
      <div className="endereco-linha">
        <code title={c.endereco}>{c.endereco}</code>
        <Copiar texto={c.endereco} />
        {link && (
          <a className="icon-btn sem-borda" href={link} target="_blank" rel="noreferrer" aria-label="Abrir no explorador" title="Abrir no explorador">
            <ExternalLink size={15} />
          </a>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {editando ? (
          <>
            <input className="input" style={{ flex: 1, minWidth: 160 }} value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
            <button
              className="btn primary sm"
              onClick={() => {
                editarCarteira(c.id, { nome: nome.trim() || c.nome })
                setEditando(false)
              }}
            >
              Salvar
            </button>
          </>
        ) : (
          <button className="btn quiet sm" onClick={() => setEditando(true)}>
            <Pencil size={13} /> Renomear
          </button>
        )}
        <button className="btn quiet sm" onClick={() => void q.refetch()} disabled={q.isFetching}>
          <RefreshCw size={13} className={q.isFetching ? 'gira' : undefined} /> {q.isFetching ? 'Atualizando…' : d ? `Atualizado ${relativo(d.atualizadoEm)}` : 'Atualizar'}
        </button>
        <span style={{ flex: 1 }} />
        {confirmar ? (
          <>
            <span className="muted" style={{ fontSize: 12 }}>
              Remover do app?
            </span>
            <button
              className="btn danger sm"
              onClick={() => {
                removerCarteira(c.id)
                onRemovida()
              }}
            >
              Sim, remover
            </button>
            <button className="btn quiet sm" onClick={() => setConfirmar(false)}>
              Não
            </button>
          </>
        ) : (
          <button className="btn danger sm" onClick={() => setConfirmar(true)}>
            <Trash2 size={13} /> Remover
          </button>
        )}
      </div>

      {q.error && !d && <Aviso tom="erro">{(q.error as Error).message}</Aviso>}
      {q.isLoading && (
        <div className="panel">
          <div className="panel-body" style={{ display: 'grid', gap: 10 }}>
            <Esqueleto h={22} w="40%" />
            <Esqueleto h={14} w="70%" />
            <Esqueleto h={180} />
            <span className="muted" style={{ fontSize: 12 }}>
              {c.tipo === 'xpub' ? 'Derivando endereços e procurando os usados (gap de 20)…' : 'Lendo a blockchain…'}
            </span>
          </div>
        </div>
      )}

      {d && (
        <>
          <div className="panel">
            {c.rede === 'btc' ? (
              <div className="kpis" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                <Kpi rotulo="Saldo" valor={<Privado>{`${qtd(d.saldo)} BTC`}</Privado>} detalhe={d.pendente ? `${qtd(d.pendente)} pendente` : undefined} />
                <Kpi rotulo="Valor" valor={<Privado>{dinheiro(conv(valorNativo), moeda)}</Privado>} />
                <Kpi rotulo="Transações" valor={numero(d.totalTransacoes, 0)} />
              </div>
            ) : (
              <div className="kpis" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                <Kpi rotulo="Saldo" valor={<Privado>{`${qtd(d.saldo)} ${d.nativo}`}</Privado>} detalhe={d.pendente ? `${qtd(d.pendente)} pendente` : undefined} />
                <Kpi rotulo={`Valor em ${d.nativo}`} valor={<Privado>{dinheiro(conv(valorNativo), moeda)}</Privado>} />
                <Kpi rotulo="Tokens" valor={<Privado>{dinheiro(conv(valorTokens), moeda)}</Privado>} detalhe={`${tokensValidos.length} com preço e liquidez`} />
                <Kpi rotulo="Total" valor={<Privado>{dinheiro(conv((valorNativo ?? 0) + valorTokens), moeda)}</Privado>} />
              </div>
            )}
          </div>

          {d.avisos.map((a) => (
            <Aviso key={a}>{a}</Aviso>
          ))}
          {d.movimentos === null && c.rede === 'sol' && (
            <Aviso tom="info">
              Histórico e preço médio da Solana precisam da chave grátis da Helius (Ajustes). Saldo e tokens funcionam sem ela.
            </Aviso>
          )}

          {series && (
            <div className="panel">
              <div className="panel-head">
                <h2>Evolução</h2>
                <Segmentado rotulo="Período" valor={janela} opcoes={JANELAS} onChange={setJanela} />
              </div>
              <div style={{ padding: '6px 6px 0' }}>
                <Grafico
                  altura={190}
                  paineis={[90]}
                  desde={inicioDaJanela(janela)}
                  series={[
                    { nome: `Valor (${moeda})`, dados: series.v, cor: COR_REDE[c.rede], tipo: 'area', formato: (v) => dinheiro(v, moeda, true) },
                    { nome: d.nativo, dados: series.q, cor: '#97a0b0', painel: 1, largura: 1, formato: (v) => qtd(v) },
                  ]}
                />
              </div>
            </div>
          )}

          {(tokensValidos.length > 0 || tokensOutros.length > 0) && (
            <div className="panel">
              <div className="panel-head">
                <h2>Tokens</h2>
                <span className="sub">{tokensValidos.length} com preço · {tokensOutros.length} sem preço ou suspeitos</span>
              </div>
              <div className="rows">
                {(verTodosTokens ? [...tokensValidos, ...tokensOutros] : tokensValidos.slice(0, 25)).map((t) => (
                  <div key={t.id} className="row static">
                    <IconeAtivo src={t.icone} simbolo={t.simbolo} />
                    <div className="row-main">
                      <strong>{t.simbolo}</strong>
                      <span>{t.nome}</span>
                    </div>
                    <div className="row-end">
                      <strong className="num">
                        <Privado>{t.precoUsd != null && t.confiavel ? dinheiro(conv(t.qtd * t.precoUsd), moeda) : '—'}</Privado>
                      </strong>
                      <span className="muted-2 num">
                        <Privado>{qtd(t.qtd)}</Privado>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {(tokensOutros.length > 0 || tokensValidos.length > 25) && (
                <div className="panel-foot">
                  <button className="btn quiet sm" onClick={() => setVerTodosTokens((v) => !v)}>
                    {verTodosTokens ? 'Mostrar só os com preço' : `Ver todos (${tokensValidos.length + tokensOutros.length})`}
                  </button>
                  {!verTodosTokens && tokensOutros.length > 0 && ' Tokens sem preço costumam ser spam de airdrop — não interaja com eles.'}
                </div>
              )}
            </div>
          )}

          <div className="panel">
            <div className="panel-head">
              <h2>Detalhes</h2>
            </div>
            <div className="detalhes">
              {d.detalhes.map((x) => (
                <div key={x.rotulo} title={x.dica}>
                  <span>{x.rotulo}</span>
                  <b>{x.valor}</b>
                </div>
              ))}
            </div>
          </div>

          {d.enderecos && d.enderecos.length > 0 && (
            <div className="panel">
              <div className="panel-head">
                <h2>Endereços usados</h2>
                <span className="sub">{d.enderecos.length} derivados da chave</span>
              </div>
              <div className="rows">
                {[...d.enderecos]
                  .sort((a, b) => b.saldo - a.saldo)
                  .slice(0, 50)
                  .map((e) => (
                    <a key={e.endereco} className="row" href={linkEnderecoBtc(e.endereco)} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                      <span className="muted-2 mono">{e.caminho}</span>
                      <div className="row-main">
                        <strong className="mono">{encurtar(e.endereco, 10)}</strong>
                        <span>
                          {e.ntx} transações · {e.caminho.startsWith('1/') ? 'troco' : 'recebimento'}
                        </span>
                      </div>
                      <div className="row-end">
                        <strong className="num">
                          <Privado>{qtd(e.saldo)} BTC</Privado>
                        </strong>
                      </div>
                    </a>
                  ))}
              </div>
            </div>
          )}

          {d.movimentos && d.movimentos.length > 0 && (
            <div className="panel">
              <div className="panel-head">
                <h2>Movimentações</h2>
                <span className="sub">
                  {numero(d.movimentos.length, 0)} baixadas{d.totalTransacoes ? ` de ${numero(d.totalTransacoes, 0)}` : ''}
                </span>
              </div>
              <div>
                {[...d.movimentos]
                  .reverse()
                  .slice(0, 40)
                  .map((m) => {
                    const p = hist.data ? valorEm(hist.data, m.t) : null
                    const l = linkTx(c.rede, m.txid)
                    return (
                      <div key={m.txid} className="mov">
                        <span className={`seta ${m.delta >= 0 ? 'sobe' : 'desce'}`}>
                          {m.delta >= 0 ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div className={m.delta >= 0 ? 'sobe' : 'desce'}>
                            <Privado>
                              {m.delta >= 0 ? '+' : ''}
                              {qtd(m.delta)} {d.nativo}
                            </Privado>
                          </div>
                          <div className="muted-2" style={{ fontSize: 11 }}>
                            {data(m.t, true)}
                            {m.pendente ? ' · pendente' : ''}
                            {m.taxa ? ` · taxa ${qtd(m.taxa)}` : ''}
                          </div>
                        </div>
                        <div className="mov-end">
                          <Privado>{p != null ? dinheiro(conv(Math.abs(m.delta) * p), moeda) : '—'}</Privado>
                          {l && (
                            <span>
                              <a href={l} target="_blank" rel="noreferrer">
                                {encurtar(m.txid, 5)}
                              </a>
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
              </div>
              <div className="panel-foot">Valor de cada movimentação pelo preço do dia em que aconteceu.</div>
            </div>
          )}
        </>
      )}
    </>
  )
}
