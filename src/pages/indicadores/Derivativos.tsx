import { useState } from 'react'
import { COR, COR_NATIVO } from '../../lib/cores'
import { compacto, dinheiro, duracao, numero, fixo } from '../../lib/format'
import { haDias, ultimo } from '../../lib/indicators/calc'
import { useDerivativos, useFundingCorretoras } from '../../lib/indicators/fontes'
import type { Nativo } from '../../lib/store'
import { Grafico } from '../../components/Grafico'
import { Aviso, Delta, Esqueleto, Kpi, Painel, Segmentado } from '../../components/ui'

const PARES: Record<Nativo, string> = { BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT' }

export default function Derivativos() {
  const [ativo, setAtivo] = useState<Nativo>('BTC')
  const q = useDerivativos(PARES[ativo])
  const tres = useFundingCorretoras(ativo)
  const d = q.data
  const cor = COR_NATIVO[ativo]

  const fundingAnual = d ? d.funding * 3 * 365 * 100 : null
  const premio = d ? (d.mark / d.index - 1) * 100 : null
  const oiAgora = ultimo(d?.oiValor)
  const oi7 = haDias(d?.oiValor, 7)
  const oi30 = d?.oiValor[0]?.[1] ?? null
  const ls = ultimo(d?.longShort)
  const top = ultimo(d?.topTraders)
  const taker = ultimo(d?.taker)
  const funding30 = d ? d.fundingHist.slice(-90).reduce((s, [, v]) => s + v, 0) : null

  return (
    <>
      <div className="toolbar">
        <Segmentado
          rotulo="Ativo"
          valor={ativo}
          opcoes={(['BTC', 'ETH', 'SOL'] as Nativo[]).map((n) => ({ valor: n, rotulo: n }))}
          onChange={setAtivo}
        />
        <span className="muted-2" style={{ fontSize: 12 }}>
          Perpétuo {PARES[ativo]} na Binance Futures (maior volume do mercado)
        </span>
      </div>

      {q.error && !d && <Aviso tom="erro">Binance Futures não respondeu: {(q.error as Error).message}</Aviso>}

      <Painel>
        {!d ? (
          <div className="panel-body">
            <Esqueleto h={90} />
          </div>
        ) : (
          <div className="kpis">
            <Kpi
              rotulo="Funding atual (8h)"
              valor={`${fixo((d.funding * 100), 4)}%`}
              detalhe={`${fixo(fundingAnual!, 1)}% a.a. · próximo em ${duracao(Math.max(0, (d.proximoFunding - Date.now()) / 1000))}`}
              tom={fundingAnual! > 30 ? 'aviso' : fundingAnual! < 0 ? 'ok' : undefined}
            />
            <Kpi rotulo="Funding acumulado 30d" valor={`${fixo(funding30!, 2)}%`} detalhe="custo de ficar comprado alavancado" />
            <Kpi rotulo="Prêmio do perpétuo" valor={`${fixo(premio!, 3)}%`} detalhe={`mark ${dinheiro(d.mark)} · índice ${dinheiro(d.index)}`} />
            <Kpi
              rotulo="Open interest"
              valor={oiAgora ? dinheiro(oiAgora, 'USD', true) : '—'}
              detalhe={
                <>
                  7d <Delta v={oiAgora && oi7 ? (oiAgora / oi7 - 1) * 100 : null} casas={1} /> · 30d{' '}
                  <Delta v={oiAgora && oi30 ? (oiAgora / oi30 - 1) * 100 : null} casas={1} />
                </>
              }
            />
            <Kpi rotulo="Long/short (contas)" valor={ls ? numero(ls, 2) : '—'} detalhe={ls ? `${fixo(((ls / (1 + ls)) * 100), 0)}% das contas compradas` : undefined} />
            <Kpi rotulo="Long/short (top traders)" valor={top ? numero(top, 2) : '—'} detalhe="posição dos 20% maiores" />
            <Kpi rotulo="Compra ÷ venda agressora" valor={taker ? numero(taker, 3) : '—'} detalhe="> 1 = mais compra a mercado" />
          </div>
        )}
      </Painel>

      <Painel titulo="Funding agora em três corretoras" sub="Por 8 horas e anualizado. Divergência grande entre elas costuma ser corrigida rápido.">
        <div className="kpis" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {(['Binance', 'Bybit', 'OKX'] as const).map((c) => {
            const f = tres.data?.[c]
            return (
              <Kpi
                key={c}
                rotulo={c}
                valor={f != null && Number.isFinite(f) ? `${fixo(f * 100, 4)}%` : '—'}
                detalhe={f != null && Number.isFinite(f) ? `${fixo(f * 3 * 365 * 100, 1)}% a.a.` : tres.isLoading ? 'carregando…' : 'sem resposta'}
              />
            )
          })}
        </div>
      </Painel>

      <div className="grid g2">
        <Painel
          titulo="Funding (últimos 90 dias)"
          pe="Positivo: comprados pagam aos vendidos (mercado alavancado na alta). Negativo e persistente costuma aparecer perto de fundos locais."
        >
          <div style={{ padding: '4px 6px 0' }}>
            <Grafico
              altura={220}
              formato={(v) => `${fixo(v, 4)}%`}
              series={[{ nome: 'Funding por 8h', dados: d?.fundingHist ?? [], cor: COR.bom, tipo: 'barras', corNegativa: COR.critico }]}
              vazio={q.isLoading ? 'Carregando…' : 'Sem dados'}
            />
          </div>
        </Painel>
        <Painel
          titulo="Open interest (30 dias)"
          pe="Dinheiro em contratos abertos. OI subindo com preço subindo = alta alavancada; OI caindo rápido = liquidações/desalavancagem."
        >
          <div style={{ padding: '4px 6px 0' }}>
            <Grafico
              altura={220}
              formato={(v) => dinheiro(v, 'USD', true)}
              series={[{ nome: 'OI em US$', dados: d?.oiValor ?? [], cor, tipo: 'area' }]}
              vazio={q.isLoading ? 'Carregando…' : 'Sem dados'}
            />
          </div>
        </Painel>
        <Painel
          titulo="Long/short (30 dias)"
          pe="Quando a massa (contas) está muito comprada e os grandes não, o risco de queda para liquidar comprados é maior — e vice-versa."
        >
          <div style={{ padding: '4px 6px 0' }}>
            <Grafico
              altura={220}
              formato={(v) => fixo(v, 2)}
              linhas={[{ valor: 1, cor: COR.muted2, rotulo: '1' }]}
              series={[
                { nome: 'Contas', dados: d?.longShort ?? [], cor: COR.eth },
                { nome: 'Top traders', dados: d?.topTraders ?? [], cor: COR.btc },
              ]}
              vazio={q.isLoading ? 'Carregando…' : 'Sem dados'}
            />
          </div>
        </Painel>
        <Painel titulo="Fluxo agressor (30 dias)" pe="Volume de compra a mercado ÷ venda a mercado nos futuros. Acima de 1 = compradores com pressa.">
          <div style={{ padding: '4px 6px 0' }}>
            <Grafico
              altura={220}
              formato={(v) => fixo(v, 3)}
              series={[{ nome: 'Compra/venda', dados: d?.taker ?? [], cor: COR.eth, tipo: 'base', base: 1, corNegativa: COR.critico }]}
              vazio={q.isLoading ? 'Carregando…' : 'Sem dados'}
            />
          </div>
        </Painel>
      </div>
      {d && (
        <p className="muted-2" style={{ fontSize: 11.5, marginTop: 10 }}>
          OI em contratos: {compacto(ultimo(d.oi))} {ativo}. Liquidações e dados de várias corretoras somadas (Coinglass) exigem plano pago — não
          entram aqui.
        </p>
      )}
    </>
  )
}
