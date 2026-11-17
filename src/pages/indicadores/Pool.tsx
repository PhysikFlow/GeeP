import { useState } from 'react'
import { Ban, CircleAlert, CircleCheck, ExternalLink, Hand } from 'lucide-react'
import { COR } from '../../lib/cores'
import { dinheiro, fixo } from '../../lib/format'
import { COBERTURA, PARES_LP, useRange, type AnaliseLp, type ParLp, type Perfil, type Range } from '../../lib/indicators/pool'
import { useShort } from '../../lib/indicators/short'
import { useVeredito } from '../../lib/indicators/veredito'
import type { Serie } from '../../lib/precos'
import { Grafico } from '../../components/Grafico'
import { Aviso, Esqueleto, Kpi, Painel, Segmentado } from '../../components/ui'

const PERFIS: { id: Perfil; nome: string; cor: string; resumo: string }[] = [
  { id: 'conservador', nome: 'Conservador', cor: COR.stable, resumo: 'Mais largo: fica dentro mais tempo, rende menos por dólar.' },
  { id: 'equilibrado', nome: 'Equilibrado', cor: COR.eth, resumo: 'Meio-termo entre tempo dentro e concentração.' },
  { id: 'agressivo', nome: 'Agressivo', cor: COR.outros, resumo: 'Mais estreito: rende mais por dólar enquanto dentro, sai com frequência.' },
]

const VIAB = {
  fora: { texto: 'Fique de fora: as taxas não pagam a volatilidade', classe: 'perigo', Icone: Ban },
  fina: { texto: 'Margem fina: as taxas mal cobrem a volatilidade', classe: 'aviso', Icone: CircleAlert },
  considerar: { texto: 'Vale considerar: as taxas pagam a volatilidade com folga', classe: 'ok', Icone: CircleCheck },
}

const pct = (v: number | null, c = 1, sinal = false) => (v == null ? '—' : `${sinal && v > 0 ? '+' : ''}${fixo(v, c)}%`)

export default function Pool() {
  const [par, setPar] = useState<ParLp>('SOL')
  const [H, setH] = useState(14)
  const [custo, setCusto] = useState('0,2')
  const custoNum = Math.max(0, Number(custo.replace(',', '.')) || 0)
  const { analise: a, pool, velas } = useRange(par, H, custoNum)
  const ver = useVeredito()
  const sh = useShort(PARES_LP[par].ativo).analise

  return (
    <>
      <div className="toolbar">
        <Segmentado
          rotulo="Par"
          valor={par}
          opcoes={(Object.keys(PARES_LP) as ParLp[]).map((p) => ({ valor: p, rotulo: PARES_LP[p].nome }))}
          onChange={setPar}
        />
        <Segmentado
          rotulo="Horizonte"
          valor={String(H)}
          opcoes={[
            { valor: '7', rotulo: '7 dias' },
            { valor: '14', rotulo: '14 dias' },
            { valor: '30', rotulo: '30 dias' },
          ]}
          onChange={(x) => setH(Number(x))}
        />
        <label className="check" title="Swap, taxa de rede e slippage para fechar e reabrir a posição, em % do valor">
          Custo por reposicionamento
          <input className="input" style={{ width: 64, padding: '6px 8px' }} inputMode="decimal" value={custo} onChange={(e) => setCusto(e.target.value)} />%
        </label>
      </div>
      <p className="muted-2" style={{ fontSize: 12, marginTop: -6, marginBottom: 12 }}>
        Horizonte = de quanto em quanto tempo você aceita reposicionar. O app devolve só o range; a pool abaixo é a referência usada para medir o
        par, não uma recomendação.
      </p>

      {(velas.error || pool.error) && !a && <Aviso tom="erro">Dados indisponíveis agora: {((velas.error ?? pool.error) as Error).message}</Aviso>}
      {!a ? <Esqueleto h={260} /> : conteudo(a)}

      {a && ver.quieto.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Aviso>
            <Hand size={14} style={{ verticalAlign: -2 }} /> O veredito geral pede para ficar quieto agora ({ver.quieto[0].toLowerCase()}). Abrir ou
            mexer em posição também é agir.
          </Aviso>
        </div>
      )}
      {a && sh && sh.nota.vies >= 70 && (
        <div style={{ marginTop: 8 }}>
          <Aviso tom="info">
            {PARES_LP[par].ativo} em tendência de baixa (viés {sh.nota.vies} na aba Short). Abaixo do preço atual, a posição vai virando 100%{' '}
            {PARES_LP[par].ativo} conforme cai — é comprar a queda aos poucos. Se você não quer acumular mais {PARES_LP[par].ativo} agora, um range
            só acima do preço funciona como venda escalonada; se quer, só abaixo funciona como compra escalonada.
          </Aviso>
        </div>
      )}

      <details className="panel short-regra">
        <summary>Como o range é calculado</summary>
        <div className="explica">
          <p>
            <b>Primeiro, se vale.</b> Enquanto o preço está dentro, a posição ganha taxas e paga o custo da volatilidade (LVR: a pool sempre vende o
            que sobe e compra o que cai). Os dois crescem na mesma proporção quando o range aperta, então quem decide é a razão{' '}
            <b>R = taxas por unidade de liquidez ÷ (σ² diária × √preço ÷ 4)</b>, medida na pool de referência. R abaixo de 1: perde para "segurar e
            rebalancear" com qualquer range. Entre 1 e 1,5: margem fina, que custos comem.
          </p>
          <p>
            <b>Depois, qual range.</b> Em ~3 anos de velas diárias, para cada dia de partida, o app mede a máxima e a mínima atingidas nos {a?.horizonte ?? H}{' '}
            dias seguintes (o caminho, não só onde terminou), em desvios da volatilidade daquela época. Os ranges são os quantis que deixaram 90%,
            75% e 50% das janelas inteiras dentro, reescalados pela volatilidade de agora. A assimetria vem do próprio histórico.
          </p>
          <p>
            Saldo esperado = (taxas − LVR) × tempo dentro − custo × reposicionamentos. É estimativa: usa a liquidez e o volume de hoje, ignora MEV
            e taxas dinâmicas, e não tem backtest de lucro. Pesquisa completa em{' '}
            <a href="https://github.com/PhysikFlow/GeeP/blob/main/docs/pesquisa-range-lp.md" target="_blank" rel="noreferrer">
              docs/pesquisa-range-lp.md <ExternalLink size={11} />
            </a>
            .
          </p>
        </div>
      </details>
    </>
  )

  function conteudo(a: AnaliseLp) {
    const p = pool.data
    // Ponto de partida conservador: com R > 1 a conta sempre prefere o mais
    // estreito, mas ela supõe reposicionar na hora certa e volume estável.
    const sugerido: Perfil | null =
      a.viabilidade === 'fora' || a.viabilidade == null
        ? null
        : a.viabilidade === 'fina' || ver.quieto.length > 0 || (sh?.nota.vies ?? 0) >= 70
          ? 'conservador'
          : 'equilibrado'
    const v = a.viabilidade ? VIAB[a.viabilidade] : null
    const closes: Serie = (velas.data ?? []).map((x) => [x.t, x.c])
    return (
      <>
        <div className={`short-faixa ${v?.classe ?? 'neutro'}`}>
          {v ? <v.Icone size={18} /> : <CircleAlert size={18} />}
          <div>
            <b>
              {PARES_LP[par].nome}: {v ? v.texto : 'sem dados da pool de referência'}
            </b>
            <div>
              {a.R != null
                ? `R = ${fixo(a.R, 2)}: cada US$ 1 de custo de volatilidade rende US$ ${fixo(a.R, 2)} em taxas, com qualquer range. ${
                    a.viabilidade === 'fora' ? 'Os ranges abaixo ficam como referência: todos têm saldo esperado negativo.' : ''
                  }`
                : 'Sem a pool, os ranges abaixo valem como faixas de preço, mas sem conta de taxas.'}
            </div>
          </div>
        </div>

        <Painel titulo="Pool de referência" sub={`${PARES_LP[par].fonte} · só para medir o par`}>
          <div className="kpis">
            <Kpi rotulo="Pool" valor={p ? p.protocolo : '—'} detalhe={p ? `taxa ${fixo(p.taxaPct, 2)}%` : undefined} />
            <Kpi rotulo="TVL" valor={p?.tvl ? dinheiro(p.tvl, 'USD', true) : '—'} />
            <Kpi rotulo="Volume 24 h" valor={p ? dinheiro(p.volumeDia, 'USD', true) : '—'} />
            <Kpi rotulo="Taxas/dia para provedores" valor={p ? dinheiro(p.taxasDiaLp, 'USD', true) : '—'} detalhe={p?.janelaTaxas} />
            <Kpi rotulo="Volatilidade" valor={`${fixo(a.sigmaDia * 100, 2)}%/dia`} detalhe={`${fixo(a.sigmaDia * Math.sqrt(365) * 100, 0)}% ao ano (30 dias)`} />
            <Kpi rotulo="Preço agora" valor={dinheiro(a.preco)} />
          </div>
          {p && (
            <div className="panel-foot">
              <a href={p.link} target="_blank" rel="noreferrer">
                Ver a pool <ExternalLink size={11} />
              </a>{' '}
              · {a.janelas} janelas históricas de {a.horizonte} dias
            </div>
          )}
        </Painel>

        <div className="grid g3">
          {PERFIS.map((pf) => (
            <CartaoRange
              key={pf.id}
              r={a.ranges.find((x) => x.perfil === pf.id)!}
              preco={a.preco}
              nome={pf.nome}
              cor={pf.cor}
              resumo={pf.resumo}
              ativo={PARES_LP[par].ativo}
              sugerido={sugerido === pf.id}
            />
          ))}
        </div>
        <p className="muted-2" style={{ fontSize: 11.5, lineHeight: 1.5, marginTop: 8 }}>
          {a.viabilidade === 'fora'
            ? 'Com R abaixo de 1, nenhum range é sugerido: quanto mais estreito, mais rápido a volatilidade come a posição.'
            : 'Com R acima de 1, a conta sempre prefere o range mais estreito — mas ela supõe que você reposiciona na hora certa a cada saída, ao custo informado, e que o volume de hoje se mantém. Quanto mais estreito, mais esses erros pesam. Por isso o ponto de partida sugerido é conservador: equilibrado só quando a margem é folgada, o veredito não pede quietude e não há tendência de baixa.'}
        </p>

        <Painel
          titulo="Preço e os três ranges"
          sub="180 dias"
          pe={
            <>
              Faixa dos últimos 30 dias: {dinheiro(a.faixa30.min)} a {dinheiro(a.faixa30.max)}.{' '}
              {a.lateral
                ? 'O mercado está lateral: essa faixa (com meio ATR de margem) é uma alternativa gráfica ao range de volatilidade.'
                : 'Sem lateralidade clara: a faixa recente não serve de range sozinha.'}
            </>
          }
        >
          <div style={{ padding: '4px 6px 0' }}>
            <Grafico
              altura={260}
              desde={Math.floor(Date.now() / 1000) - 180 * 86400}
              formato={(x) => dinheiro(x)}
              linhas={PERFIS.flatMap((pf) => {
                const r = a.ranges.find((x) => x.perfil === pf.id)!
                return [
                  { valor: r.max, cor: pf.cor, rotulo: `${pf.nome.toLowerCase()} máx` },
                  { valor: r.min, cor: pf.cor, rotulo: `${pf.nome.toLowerCase()} mín` },
                ]
              })}
              series={[{ nome: PARES_LP[par].ativo, dados: closes, cor: COR.texto, largura: 2 }]}
            />
          </div>
        </Painel>
      </>
    )
  }
}

function CartaoRange({
  r,
  preco,
  nome,
  cor,
  resumo,
  ativo,
  sugerido,
}: {
  r: Range
  preco: number
  nome: string
  cor: string
  resumo: string
  ativo: string
  sugerido: boolean
}) {
  return (
    <section className={`panel range-cartao${sugerido ? ' sugerido' : ''}`} style={{ ['--cor' as string]: cor }}>
      {sugerido && <span className="pill ok range-selo">Ponto de partida sugerido</span>}
      <div className="range-topo">
        <i />
        <b>{nome}</b>
        <span className="muted-2">{fixo(COBERTURA[r.perfil] * 100, 0)}% das janelas dentro</span>
      </div>
      <div className="range-faixa num">
        {dinheiro(r.min)} <span className="muted-2">–</span> {dinheiro(r.max)}
      </div>
      <div className="muted-2" style={{ fontSize: 12 }}>
        {pct((r.min / preco - 1) * 100, 1, true)} / {pct((r.max / preco - 1) * 100, 1, true)} do preço · {resumo}
      </div>
      <div className="detalhes" style={{ borderRadius: 8, overflow: 'hidden' }}>
        <div>
          <span>Tempo dentro (histórico)</span>
          <b>{pct(r.tempoDentro * 100, 0)}</b>
        </div>
        <div>
          <span>Reposicionamentos/mês</span>
          <b>{fixo(r.reposicoesMes, 1)}</b>
        </div>
        <div>
          <span>Taxas enquanto dentro</span>
          <b>{r.taxasAno == null ? '—' : `${fixo(r.taxasAno, 0)}% a.a.`}</b>
        </div>
        <div>
          <span>Custo da volatilidade (LVR)</span>
          <b>{r.lvrAno == null ? '—' : `${fixo(r.lvrAno, 0)}% a.a.`}</b>
        </div>
        <div>
          <span>Saldo esperado</span>
          <b className={r.saldoAno == null ? '' : r.saldoAno >= 0 ? 'sobe' : 'desce'}>{r.saldoAno == null ? '—' : `${r.saldoAno > 0 ? '+' : ''}${fixo(r.saldoAno, 1)}% a.a.`}</b>
        </div>
        <div>
          <span>Taxas por dólar vs range cheio</span>
          <b>{fixo(r.mult, 1)}×</b>
        </div>
        <div>
          <span>Contra só segurar, se o preço chegar à borda de baixo</span>
          <b className="desce">{pct(r.ilMin, 2)}</b>
        </div>
        <div>
          <span>Contra só segurar, se o preço chegar à borda de cima</span>
          <b className="desce">{pct(r.ilMax, 2)}</b>
        </div>
      </div>
      <p className="muted-2" style={{ fontSize: 11.5, lineHeight: 1.5, margin: 0 }}>
        Sai por baixo: fica 100% em {ativo}, sem render. Sai por cima: fica 100% em USDC.
      </p>
    </section>
  )
}
