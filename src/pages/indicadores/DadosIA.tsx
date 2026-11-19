import { useMemo, useState } from 'react'
import { Check, Copy, Download } from 'lucide-react'
import { useCicloBtc } from '../../lib/indicators/ciclo'
import { useFundingAgora, useGlobal, useStablecoins } from '../../lib/indicators/fontes'
import { ultimo, haDias } from '../../lib/indicators/calc'
import { useRegime } from '../../lib/indicators/macro'
import { PARES_LP, useRange, type ParLp } from '../../lib/indicators/pool'
import { useShort } from '../../lib/indicators/short'
import { useTriagem } from '../../lib/indicators/triagem'
import { useVeredito } from '../../lib/indicators/veredito'
import { useCambio, useMercado } from '../../lib/precos'
import { usePortfolio } from '../../lib/portfolio'
import { Painel } from '../../components/ui'

// Um JSON só, em inglês, com o que importa das outras abas — para colar em
// qualquer IA e pedir opinião sem ela precisar abrir o site. Chaves pouco
// óbvias levam um "_desc" ao lado. Endereços de carteira nunca entram.

const r = (v: number | null | undefined, c = 2) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** c) / 10 ** c)

export default function DadosIA() {
  const [comCarteira, setComCarteira] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const ver = useVeredito()
  const ciclo = useCicloBtc()
  const regime = useRegime()
  const mercado = useMercado().data
  const cambio = useCambio().data
  const global = useGlobal().data
  const stables = useStablecoins().data
  const funding = useFundingAgora().data
  const sBtc = useShort('BTC').analise
  const sEth = useShort('ETH').analise
  const sSol = useShort('SOL').analise
  const pSol = useRange('SOL', 14, 0.2).analise
  const pEth = useRange('ETH', 14, 0.2).analise
  const pBtc = useRange('BTC', 14, 0.2).analise
  const triagem = useTriagem().data
  const pf = usePortfolio()

  const json = useMemo(() => {
    const short = (a: typeof sBtc) =>
      a && {
        verdict: a.veredito === 'shortar' ? 'can_short' : a.veredito === 'longe' ? 'stay_away' : 'cannot_tell',
        reason: a.porque,
        scores_0_100: { bearish_bias: a.nota.vies, entry_quality: a.nota.entrada, risk_ok: a.nota.risco },
        vetoes: a.vetos,
        checks: Object.fromEntries([...a.vies, ...a.entrada, ...a.risco].map((c) => [c.id, { passed: c.ok, value: c.valor, desc: c.nome }])),
        plan_2x: a.plano && {
          entry: r(a.plano.entrada),
          stop: r(a.plano.stop),
          target: r(a.plano.alvo),
          reward_to_risk: r(a.plano.rr),
          liquidation_price: r(a.plano.liquidacao),
          loss_on_margin_pct_if_stop: r(a.plano.perdaMargem),
          gain_on_margin_pct_if_target: r(a.plano.ganhoMargem),
          funding_pct_per_day_on_margin: r(a.plano.fundingDia, 4),
          _desc: 'Positive funding = the short receives. Margin results ignore exchange fees.',
        },
      }
    const pool = (par: ParLp, a: typeof pSol) =>
      a && {
        pair: PARES_LP[par].nome,
        reference_pool_source: PARES_LP[par].fonte,
        fees_to_volatility_ratio_R: r(a.R),
        _R_desc: 'Fees per unit of liquidity ÷ LVR (σ²·√price/4). Independent of range width. <1 = LPing loses vs rebalancing; 1–1.5 thin; ≥1.5 worth considering.',
        viability: a.viabilidade,
        daily_volatility_pct_30d: r(a.sigmaDia * 100),
        horizon_days: a.horizonte,
        price: r(a.preco),
        ranges: a.ranges.map((x) => ({
          profile: x.perfil,
          min: r(x.min),
          max: r(x.max),
          historical_full_window_coverage_pct: r(x.cobertura * 100, 0),
          avg_time_in_range_pct: r(x.tempoDentro * 100, 0),
          repositions_per_month: r(x.reposicoesMes, 1),
          fee_apr_pct_while_in_range: r(x.taxasAno, 1),
          lvr_apr_pct_while_in_range: r(x.lvrAno, 1),
          expected_net_apr_pct: r(x.saldoAno, 1),
          vs_hodl_pct_at_lower_edge: r(x.ilMin),
          vs_hodl_pct_at_upper_edge: r(x.ilMax),
        })),
      }
    const st = ultimo(stables)
    const varSt = (d: number) => {
      const a = haDias(stables, d)
      return st && a ? r((st / a - 1) * 100) : null
    }
    const dados = {
      _about:
        'Crypto market snapshot from the GeeP app, built only from free public APIs. Values are what the app computed at generated_at. The app is deliberately conservative ("when in doubt, do nothing"). Not financial advice.',
      generated_at: new Date().toISOString(),
      prices_usd: mercado && Object.fromEntries((['BTC', 'ETH', 'SOL'] as const).map((n) => [n, { price: mercado[n].preco, change_24h_pct: r(mercado[n].var24h), change_7d_pct: r(mercado[n].var7d), change_30d_pct: r(mercado[n].var30d), change_1y_pct: r(mercado[n].var1a), from_ath_pct: r(mercado[n].athDist) }])),
      usd_brl: r(cambio, 4),
      verdict: {
        _desc: 'Overall BTC-led verdict. Rules: buy only in regime 1 (thermometer ≤35) or regime 2 (≤30 with ≥1 capitulation signal, half pace); never buy in regime 3, where only an optional small "insurance" tranche appears under strong capitulation. Sell if thermometer ≥75, or ≥60 in regime 3.',
        action: ver.acao === 'comprar' ? 'buy' : ver.acao === 'vender' ? 'sell' : 'do_nothing',
        tranche: ver.parcela,
        reasons: ver.porques,
        better_stay_quiet_reasons: ver.quieto,
        cost_of_waiting: ver.esperar && { brazil_selic_pct: ver.esperar.selic, real_rate_pct: r(ver.esperar.real), _desc: 'Return of doing nothing in Brazilian fixed income.' },
        price_zones_btc: {
          _desc: 'BTC price at which the verdict would flip in each regime if ONLY price moved (other inputs frozen). A guide, not an order level.',
          current_price: r(ver.preco),
          by_regime: ver.zonas.map((z) => ({ regime: z.nivel, buy_below: r(z.comprar), insurance_tranche_below: r(z.seguro), sell_above: r(z.vender) })),
        },
      },
      cycle_thermometer: {
        _desc: '0 = historical cycle bottom zone, 100 = historical top zone. Average of indicator families (on-chain cost basis, price vs long averages, mining, momentum/sentiment).',
        value: r(ciclo.termometro, 1),
        components: ciclo.componentes.map((c) => ({ id: c.id, name: c.nome, family: c.familia, value: r(c.valor, 3), score_0_100: r(c.nota, 0), bottom_zone: c.fundo, top_zone: c.topo })),
      },
      capitulation_ruler: {
        _desc: '6 independent signals historically seen only near cycle bottoms.',
        active_count: ver.sinais,
        signals: ver.regua.map((s) => ({ id: s.id, desc: s.nome, active: s.ativo, value: s.valor })),
      },
      market_regime: {
        _desc: 'Sum of macro/liquidity votes (+1 favors risk, -1 against). ≥+3 = level 1 expansion, ≤-2 = level 3 deterioration, else level 2 selective. Sets buying PACE, not what to buy.',
        level: regime.nivel,
        points: regime.pontos,
        signals: regime.votos.map((v) => ({ id: v.id, name: v.nome, vote: v.voto, value: v.valor, why: v.porque })),
        fear_greed_context_only: regime.fng,
      },
      crypto_liquidity: {
        total_market_cap_usd: r(global?.total_market_cap.usd, 0),
        btc_dominance_pct: r(global?.market_cap_percentage.btc),
        stablecoins_usd: r(st, 0),
        stablecoins_change_pct: { d7: varSt(7), d30: varSt(30), d90: varSt(90) },
        perp_funding_pct_per_8h: funding && Object.fromEntries(Object.entries(funding).map(([k, v]) => [k, v ? r(v.funding * 100, 4) : null])),
      },
      short_2x: { _desc: 'Short analysis always assuming 2x leverage. Default is stay_away; can_short needs bias, entry and risk aligned plus reward/risk ≥2. Weights not backtested.', BTC: short(sBtc), ETH: short(sEth), SOL: short(sSol) },
      lp_ranges: { _desc: 'Concentrated-liquidity range suggestion (range only, not a specific pool). Reposition cost assumed 0.2% per reposition.', SOL: pool('SOL', pSol), ETH: pool('ETH', pEth), BTC: pool('BTC', pBtc) },
      token_screen_top: triagem && {
        _desc: 'Quant screen of CoinGecko top 500 (ex BTC/ETH/BNB, stables, wrapped). score = percentile blend of holder yield, FDV/revenue, revenue growth, FDV/MC, volume/MC. Fundamentals still need human review.',
        tokens: [...triagem.tokens].filter((t) => t.nota != null).sort((a, b) => (b.nota ?? 0) - (a.nota ?? 0)).slice(0, 15).map((t) => ({
          symbol: t.simbolo,
          sector: t.categoria,
          quant_score: t.nota,
          market_cap_usd: r(t.mc, 0),
          fdv_to_mc: r(t.fdvMc),
          fdv_to_annual_revenue: r(t.fdvReceita, 1),
          holder_yield_pct: r(t.yieldHolders),
          revenue_growth_pct: r(t.crescReceita, 0),
          alerts: t.alertas,
        })),
      },
      ...(comCarteira && {
        my_portfolio: {
          _desc: 'User holdings (no wallet addresses). avg_cost is estimated from on-chain inflows unless manual.',
          total_usd: r(pf.totalUsd, 0),
          positions: pf.posicoes.slice(0, 20).map((p) => ({
            asset: p.simbolo,
            qty: r(p.qtd, 6),
            value_usd: r(p.valorUsd, 0),
            avg_cost_usd: r(p.custo?.precoMedioUsd),
            avg_cost_is_manual: p.custo?.manual ?? null,
          })),
          benchmarks: pf.benchmarks && { net_invested_usd: r(pf.benchmarks.investido, 0), portfolio_usd: r(pf.benchmarks.carteira, 0), btc_only_usd: r(pf.benchmarks.soBtc, 0), half_btc_half_eth_usd: r(pf.benchmarks.metade, 0) },
        },
      }),
    }
    return JSON.stringify(dados, null, 2)
  }, [ver, ciclo.termometro, ciclo.componentes, regime, mercado, cambio, global, stables, funding, sBtc, sEth, sSol, pSol, pEth, pBtc, triagem, pf, comCarteira])

  const copiar = () =>
    void navigator.clipboard.writeText(json).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    })
  const baixar = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    a.download = `geep-snapshot-${new Date().toISOString().slice(0, 16).replace(':', '')}.json`
    a.click()
  }

  return (
    <Painel
      titulo="Dados para IA"
      sub="Tudo que importa num JSON em inglês, para colar em qualquer IA. Campos ainda carregando aparecem como null."
      acoes={
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <label className="check">
            <input type="checkbox" checked={comCarteira} onChange={(e) => setComCarteira(e.target.checked)} />
            Incluir minha carteira (sem endereços)
          </label>
          <button className="btn secondary sm" onClick={baixar}>
            <Download size={13} /> Baixar
          </button>
          <button className="btn primary sm" onClick={copiar}>
            {copiado ? <Check size={13} /> : <Copy size={13} />} {copiado ? 'Copiado' : 'Copiar JSON'}
          </button>
        </div>
      }
    >
      <pre className="json-ia">{json}</pre>
    </Painel>
  )
}
