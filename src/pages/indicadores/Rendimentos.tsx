import { useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { AlertTriangle, ExternalLink, Search } from 'lucide-react'
import { COR } from '../../lib/cores'
import { dinheiro, numero, fixo } from '../../lib/format'
import { percentil } from '../../lib/indicators/calc'
import { historicoPool, mudancas, REDES_GRANDES, useHistoricoPool, usePools, type Grupo, type Pool } from '../../lib/indicators/rendimentos'
import { HORA } from '../../lib/query'
import { useConversao } from '../../lib/precos'
import { Grafico } from '../../components/Grafico'
import { Aviso, Esqueleto, Ficha, Kpi, Painel, Pill, Segmentado } from '../../components/ui'

type Ordem = 'chao' | 'apy' | 'tvl' | 'base' | 'mudou'
const TVLS = [250_000, 1_000_000, 10_000_000, 100_000_000]
const COM_CHAO = 30 // quantas linhas do topo ganham o cálculo do chão automaticamente

const ap = (v: number | null | undefined, c = 2) => (v == null || !Number.isFinite(v) ? '—' : `${numero(v, c)}%`)

export default function Rendimentos() {
  const pools = usePools()
  const [grupo, setGrupo] = useState<Grupo | 'todos'>('todos')
  const [rede, setRede] = useState('todas')
  const [tvlMin, setTvlMin] = useState(1_000_000)
  const [semIL, setSemIL] = useState(false)
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('tvl')
  const [limite, setLimite] = useState(50)
  const [aberta, setAberta] = useState<Pool | null>(null)

  const redes = useMemo(() => {
    const cont = new Map<string, number>()
    for (const p of pools.data ?? []) cont.set(p.rede, (cont.get(p.rede) ?? 0) + 1)
    return [...cont.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r)
  }, [pools.data])

  const filtradas = useMemo(() => {
    const b = busca.trim().toLowerCase()
    return (pools.data ?? []).filter(
      (p) =>
        p.tvl >= tvlMin &&
        p.apy >= 0.05 &&
        (grupo === 'todos' || p.grupos.includes(grupo)) &&
        (rede === 'todas' ? true : rede === 'grandes' ? REDES_GRANDES.includes(p.rede) : p.rede === rede) &&
        (!semIL || !p.riscoIL) &&
        (!b || p.simbolo.toLowerCase().includes(b) || p.projeto.toLowerCase().includes(b) || (p.meta ?? '').toLowerCase().includes(b)),
    )
  }, [pools.data, grupo, rede, tvlMin, semIL, busca])

  // Ordena primeiro pelo que se sabe sem o chão; o chão das primeiras linhas é
  // buscado e, quando a ordem é "chão", reordena só esse topo.
  const preOrdenadas = useMemo(() => {
    const l = [...filtradas]
    const chave: Record<Ordem, (p: Pool) => number> = {
      chao: (p) => Math.min(p.apy, p.media30d ?? p.apy),
      apy: (p) => p.apy,
      tvl: (p) => p.tvl,
      base: (p) => p.apyBase,
      mudou: (p) => Math.abs(p.var1d ?? 0) + (p.outlier ? 50 : 0),
    }
    return l.sort((a, b) => chave[ordem](b) - chave[ordem](a))
  }, [filtradas, ordem])

  const topo = preOrdenadas.slice(0, COM_CHAO)
  const historicos = useQueries({
    queries: topo.map((p) => ({ queryKey: ['ind', 'pool', p.id], queryFn: () => historicoPool(p.id), staleTime: 6 * HORA })),
  })
  const chaoDe = new Map<string, number | null>()
  topo.forEach((p, i) => chaoDe.set(p.id, historicos[i]?.data?.chao ?? null))

  const visiveis = useMemo(() => {
    const l = preOrdenadas.slice(0, limite)
    if (ordem === 'chao') {
      const comChao = l.slice(0, COM_CHAO).sort((a, b) => (chaoDe.get(b.id) ?? -1) - (chaoDe.get(a.id) ?? -1))
      return [...comChao, ...l.slice(COM_CHAO)]
    }
    return l
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preOrdenadas, limite, ordem, historicos.map((h) => h.dataUpdatedAt).join()])

  const medianaApy = percentil(filtradas.map((p) => p.apy), 0.5)
  const medianaBase = percentil(filtradas.map((p) => p.apyBase), 0.5)
  const tvlTotal = filtradas.reduce((s, p) => s + p.tvl, 0)
  const melhorChao = topo.reduce<{ p: Pool; v: number } | null>((m, p) => {
    const v = chaoDe.get(p.id)
    return v != null && (!m || v > m.v) ? { p, v } : m
  }, null)

  return (
    <>
      <div className="toolbar">
        <Segmentado
          rotulo="Grupo"
          valor={grupo}
          opcoes={[
            { valor: 'todos', rotulo: 'Todos' },
            { valor: 'BTC', rotulo: 'BTC' },
            { valor: 'ETH', rotulo: 'ETH' },
            { valor: 'SOL', rotulo: 'SOL' },
            { valor: 'Stable', rotulo: 'Dólar' },
          ]}
          onChange={setGrupo}
        />
        <select className="sel" value={rede} onChange={(e) => setRede(e.target.value)} aria-label="Rede">
          <option value="todas">Todas as redes</option>
          <option value="grandes">Só redes grandes</option>
          {redes.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select className="sel" value={tvlMin} onChange={(e) => setTvlMin(Number(e.target.value))} aria-label="TVL mínimo">
          {TVLS.map((t) => (
            <option key={t} value={t}>
              TVL ≥ {dinheiro(t, 'USD', true)}
            </option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={semIL} onChange={(e) => setSemIL(e.target.checked)} />
          Sem perda impermanente
        </label>
        <div className="campo-busca grow">
          <Search size={14} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar token ou protocolo" />
        </div>
      </div>

      <Painel>
        <div className="kpis">
          <Kpi rotulo="Pools no filtro" valor={pools.data ? numero(filtradas.length, 0) : '—'} detalhe={pools.data ? `${numero(pools.data.length, 0)} no total` : undefined} />
          <Kpi rotulo="TVL somado" valor={pools.data ? dinheiro(tvlTotal, 'USD', true) : '—'} />
          <Kpi rotulo="APY mediano (cartaz)" valor={ap(medianaApy)} detalhe={`base mediana ${ap(medianaBase)}`} />
          <Kpi
            rotulo={`Melhor chão (top ${COM_CHAO})`}
            valor={melhorChao ? ap(melhorChao.v) : '—'}
            detalhe={melhorChao ? `${melhorChao.p.simbolo} · ${melhorChao.p.projeto}` : 'calculando…'}
            tom="ok"
          />
        </div>
      </Painel>

      <div className="section-title">
        <h2>Pools</h2>
        <Segmentado
          rotulo="Ordenar"
          valor={ordem}
          opcoes={[
            { valor: 'tvl', rotulo: 'Maior TVL' },
            { valor: 'chao', rotulo: 'Maior chão' },
            { valor: 'apy', rotulo: 'Maior cartaz' },
            { valor: 'base', rotulo: 'Maior base' },
            { valor: 'mudou', rotulo: 'Mudou hoje' },
          ]}
          onChange={setOrdem}
        />
      </div>

      {pools.error && !pools.data && <Aviso tom="erro">DefiLlama não respondeu: {(pools.error as Error).message}</Aviso>}
      <Painel>
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr>
                <th>Pool</th>
                <th className="some-celular">TVL</th>
                <th title="O APY que a pool anuncia agora">Cartaz</th>
                <th title="Rendimento superado em 9 de cada 10 dias do último mês">Chão</th>
                <th className="some-celular">Base · incentivo</th>
                <th className="some-celular">Média 30d</th>
                <th className="some-celular">Sinais</th>
              </tr>
            </thead>
            <tbody>
              {pools.isLoading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7}>
                      <Esqueleto h={22} />
                    </td>
                  </tr>
                ))}
              {visiveis.map((p) => {
                const ch = chaoDe.get(p.id)
                const sinais = mudancas(p)
                const total = p.apyBase + p.apyIncentivo || 1
                return (
                  <tr key={p.id} className="clicavel" onClick={() => setAberta(p)}>
                    <td style={{ maxWidth: 280 }}>
                      <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.simbolo}</strong>
                      <span className="sub">
                        {p.projeto} · {p.rede}
                        {p.meta ? ` · ${p.meta}` : ''}
                        <span className="so-celular"> · TVL {dinheiro(p.tvl, 'USD', true)}</span>
                      </span>
                    </td>
                    <td className="some-celular">{dinheiro(p.tvl, 'USD', true)}</td>
                    <td>{ap(p.apy)}</td>
                    <td>
                      {ch !== undefined ? (
                        ch == null ? (
                          <span className="muted-2">…</span>
                        ) : (
                          <b className={ch < p.apy * 0.5 ? 'desce' : 'sobe'}>{ap(ch)}</b>
                        )
                      ) : (
                        <span className="muted-2" title="Abra a pool para calcular">
                          abrir
                        </span>
                      )}
                    </td>
                    <td className="some-celular" style={{ minWidth: 120 }}>
                      <div className="barra" title={`base ${ap(p.apyBase)} · incentivo ${ap(p.apyIncentivo)}`}>
                        <i style={{ width: `${(p.apyBase / total) * 100}%`, ['--cor' as string]: COR.sol }} />
                        <i style={{ width: `${(p.apyIncentivo / total) * 100}%`, ['--cor' as string]: COR.atencao }} />
                      </div>
                      <span className="sub">
                        {ap(p.apyBase, 1)} · {ap(p.apyIncentivo, 1)}
                      </span>
                    </td>
                    <td className="some-celular">{ap(p.media30d)}</td>
                    <td className="some-celular">
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        {p.riscoIL && <Pill title="Pool de dois tokens: perda impermanente se os preços se separarem">IL</Pill>}
                        {p.stable && <Pill tom="info">dólar</Pill>}
                        {sinais.length > 0 && (
                          <Pill tom="aviso" title={sinais.join('\n')}>
                            <AlertTriangle size={11} /> {sinais.length}
                          </Pill>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {pools.data && visiveis.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 30 }} className="muted">
                    Nenhuma pool com esses filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="panel-foot" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {preOrdenadas.length > limite && (
            <button className="btn quiet sm" onClick={() => setLimite((l) => l + 50)}>
              Ver mais 50
            </button>
          )}
          <span>
            <b style={{ color: 'var(--text)' }}>Cartaz</b> é a foto de agora. <b style={{ color: 'var(--text)' }}>Chão</b> é o que a pool pagou
            em 9 de cada 10 dias do último mês — o número para levar a sério. Barra: <span style={{ color: COR.sol }}>base</span> (taxas, se
            sustenta) e <span style={{ color: COR.atencao }}>incentivo</span> (token emitido, acaba).
          </span>
        </div>
      </Painel>

      <Ficha
        aberta={!!aberta}
        onFechar={() => setAberta(null)}
        topo={
          aberta ? (
            <div className="titulo">
              <strong>{aberta.simbolo}</strong>
              <span>
                {aberta.projeto} · {aberta.rede}
              </span>
            </div>
          ) : null
        }
      >
        {aberta && <DetalhePool p={aberta} />}
      </Ficha>
    </>
  )
}

function DetalhePool({ p }: { p: Pool }) {
  const h = useHistoricoPool(p.id)
  const { moeda, conv } = useConversao()
  const [valor, setValor] = useState('10000')
  const [dias, setDias] = useState('365')
  const v = Number(valor.replace(/\./g, '').replace(',', '.')) || 0
  const d = Number(dias) || 0
  const rende = (apy: number | null) => (apy == null ? null : v * ((1 + apy / 100) ** (d / 365) - 1))
  const ultimos = h.data?.pontos.slice(-180) ?? []
  const sinais = mudancas(p)

  return (
    <>
      <div className="panel">
        <div className="kpis">
          <Kpi rotulo="Cartaz (agora)" valor={ap(p.apy)} detalhe={`base ${ap(p.apyBase)} · incentivo ${ap(p.apyIncentivo)}`} />
          <Kpi rotulo="Chão (P10 30d)" valor={h.data ? ap(h.data.chao) : '…'} detalhe={h.data ? `só base: ${ap(h.data.chaoBase)}` : undefined} tom="ok" />
          <Kpi rotulo="Mediana 30d" valor={h.data ? ap(h.data.mediana30d) : '…'} />
          <Kpi rotulo="TVL" valor={dinheiro(p.tvl, 'USD', true)} detalhe={h.data?.tvl30d != null ? `${h.data.tvl30d > 0 ? '+' : ''}${fixo(h.data.tvl30d, 1)}% em 30d` : undefined} />
        </div>
      </div>

      {sinais.map((s) => (
        <Aviso key={s}>{s}</Aviso>
      ))}
      {p.riscoIL && <Aviso tom="info">Pool com dois ativos de preços diferentes: se eles se separarem, você sai com menos do que valorizou (perda impermanente).</Aviso>}

      <div className="panel">
        <div className="panel-head">
          <h2>Rendimento e TVL (180 dias)</h2>
        </div>
        <div style={{ padding: '4px 6px 0' }}>
          {h.isLoading ? (
            <Esqueleto h={260} />
          ) : (
            <Grafico
              altura={200}
              paineis={[90]}
              formato={(x) => `${fixo(x, 2)}%`}
              linhas={h.data?.chao != null ? [{ valor: h.data.chao, cor: COR.bom, rotulo: 'chão' }] : undefined}
              series={[
                { nome: 'APY', dados: ultimos.map((x) => [x.t, x.apy]), cor: COR.eth },
                { nome: 'Base', dados: ultimos.map((x) => [x.t, x.apyBase]), cor: COR.sol, largura: 1 },
                { nome: 'TVL', dados: ultimos.map((x) => [x.t, x.tvl]), cor: COR.muted2, painel: 1, tipo: 'area', formato: (x) => dinheiro(x, 'USD', true) },
              ]}
            />
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Simulador</h2>
          <span className="sub">juros compostos, sem contar gás nem variação de preço</span>
        </div>
        <div className="panel-body">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label htmlFor="sv">Valor ({moeda === 'BRL' ? 'R$' : 'US$'})</label>
              <input id="sv" className="input" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 120, marginTop: 0 }}>
              <label htmlFor="sd">Dias</label>
              <input id="sd" className="input" inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value)} />
            </div>
          </div>
          <div className="detalhes" style={{ marginTop: 14, borderRadius: 10, overflow: 'hidden' }}>
            <div>
              <span>Pelo chão</span>
              <b className="sobe">{dinheiro(rende(h.data?.chao ?? null), moeda)}</b>
            </div>
            <div>
              <span>Pela mediana</span>
              <b>{dinheiro(rende(h.data?.mediana30d ?? null), moeda)}</b>
            </div>
            <div>
              <span>Pelo cartaz</span>
              <b>{dinheiro(rende(p.apy), moeda)}</b>
            </div>
            <div>
              <span>Só a base</span>
              <b>{dinheiro(rende(h.data?.chaoBase ?? p.apyBase), moeda)}</b>
            </div>
          </div>
          <p className="muted-2" style={{ fontSize: 11.5, marginTop: 10 }}>
            Planeje pelo chão; o cartaz é o melhor caso. Valor em {moeda === 'BRL' ? `reais (≈ ${dinheiro(v / (conv(1) ?? 1), 'USD')})` : 'dólar'}.
          </p>
        </div>
      </div>

      <div className="detalhes" style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line-soft)' }}>
        <div>
          <span>Exposição</span>
          <b>{p.exposicao === 'single' ? 'Um ativo' : 'Vários ativos'}</b>
        </div>
        <div>
          <span>Variação 1d / 7d</span>
          <b>
            {p.var1d != null ? `${p.var1d > 0 ? '+' : ''}${fixo(p.var1d, 2)}` : '—'} / {p.var7d != null ? `${p.var7d > 0 ? '+' : ''}${fixo(p.var7d, 2)}` : '—'} p.p.
          </b>
        </div>
        <div>
          <span>Volume 24h</span>
          <b>{p.volume1d ? dinheiro(p.volume1d, 'USD', true) : '—'}</b>
        </div>
        <div>
          <span>Previsão DefiLlama</span>
          <b>{p.previsao ?? '—'}</b>
        </div>
      </div>

      <a className="btn secondary" href={`https://defillama.com/yields/pool/${p.id}`} target="_blank" rel="noreferrer">
        Abrir na DefiLlama <ExternalLink size={13} />
      </a>
    </>
  )
}
