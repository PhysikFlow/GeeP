import { ABAS_INDICADORES, irPara, type AbaIndicadores } from '../lib/rota'
import { Segmentado } from '../components/ui'
import { Veredito } from '../components/Veredito'
import Geral from './indicadores/Geral'
import Ciclo from './indicadores/Ciclo'
import Derivativos from './indicadores/Derivativos'
import Rendimentos from './indicadores/Rendimentos'
import Redes from './indicadores/Redes'
import Regime from './indicadores/Regime'
import Triagem from './indicadores/Triagem'

export default function IndicadoresPage({ aba }: { aba: AbaIndicadores }) {
  return (
    <div className="page">
      <Veredito />
      <div className="toolbar">
        <Segmentado rotulo="Seção" valor={aba} opcoes={ABAS_INDICADORES.map((a) => ({ valor: a.id, rotulo: a.rotulo }))} onChange={(a) => irPara('indicadores', a)} />
      </div>
      {aba === 'geral' && <Geral />}
      {aba === 'regime' && <Regime />}
      {aba === 'ciclo' && <Ciclo />}
      {aba === 'triagem' && <Triagem />}
      {aba === 'derivativos' && <Derivativos />}
      {aba === 'rendimentos' && <Rendimentos />}
      {aba === 'redes' && <Redes />}
      <p className="rodape-fontes">
        Fontes gratuitas e públicas: CoinGecko, Binance (spot e futuros), alternative.me (Medo &amp; Ganância), Bitstamp,
        bitcoin-data.com (on-chain, até 15 chamadas/dia e atraso de até 7 dias no plano grátis), mempool.space, Blockscout, DefiLlama.
        Nada aqui é recomendação de investimento — são leituras históricas para apoiar a sua decisão.
      </p>
    </div>
  )
}
