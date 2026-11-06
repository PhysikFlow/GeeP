import { lazy, Suspense, useEffect, useState } from 'react'
import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  BarChart3,
  Download,
  Eye,
  EyeOff,
  Filter,
  Gauge,
  Landmark,
  Menu,
  RefreshCw,
  Settings,
  Sparkles,
  Sprout,
  TrendingUp,
  Wallet,
  Waypoints,
} from 'lucide-react'
import { ABAS_INDICADORES, irPara, useRota, type AbaIndicadores } from './lib/rota'
import { mudarAjustes, useAjustes, useCarteiras } from './lib/store'
import { Segmentado } from './components/ui'
import { Protecao } from './components/Protecao'
import AjustesModal from './pages/AjustesModal'
import PortfolioPage from './pages/PortfolioPage'

const IndicadoresPage = lazy(() => import('./pages/IndicadoresPage'))

const ICONE_ABA: Record<AbaIndicadores, typeof Gauge> = {
  geral: Gauge,
  regime: Landmark,
  ciclo: TrendingUp,
  triagem: Filter,
  derivativos: BarChart3,
  rendimentos: Sprout,
  redes: Waypoints,
}

type EventoInstalar = Event & { prompt: () => Promise<void> }

export default function App() {
  const rota = useRota()
  const carteiras = useCarteiras()
  const ajustes = useAjustes()
  const qc = useQueryClient()
  const buscando = useIsFetching()
  const [gaveta, setGaveta] = useState(false)
  const [ajustesAbertos, setAjustesAbertos] = useState(false)
  const [instalar, setInstalar] = useState<EventoInstalar | null>(null)
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const fn = (e: Event) => {
      e.preventDefault()
      setInstalar(e as EventoInstalar)
    }
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('beforeinstallprompt', fn)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('beforeinstallprompt', fn)
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  // fecha a gaveta ao navegar
  useEffect(() => setGaveta(false), [rota.pagina, rota.aba])

  const titulo =
    rota.pagina === 'carteira'
      ? { h: 'Portfólio', p: 'Suas carteiras públicas de BTC, ETH e SOL num lugar só' }
      : rota.pagina === 'indicadores'
        ? { h: ABAS_INDICADORES.find((a) => a.id === rota.aba)?.rotulo ?? 'Indicadores', p: 'Indicadores de mercado para basear decisões' }
        : { h: 'Em breve', p: 'Espaço reservado para a próxima ferramenta' }

  return (
    <div className="app-shell">
      <div className={`sidebar-backdrop${gaveta ? ' visible' : ''}`} onClick={() => setGaveta(false)} aria-hidden="true" />
      <aside className={`sidebar${gaveta ? ' open' : ''}`}>
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" />
          <div className="brand-text">
            <strong>GeeP</strong>
            <span>Portfólio cripto</span>
          </div>
        </div>
        <nav className="menu" aria-label="Navegação">
          <span className="nav-group-label">Patrimônio</span>
          <button className={`nav-item${rota.pagina === 'carteira' ? ' active' : ''}`} onClick={() => irPara('carteira')} title="Portfólio">
            <Wallet size={18} />
            <span>Portfólio</span>
            {carteiras.length > 0 && <b>{carteiras.length}</b>}
          </button>
          <span className="nav-group-label">Mercado</span>
          <button
            className={`nav-item${rota.pagina === 'indicadores' ? ' active' : ''}`}
            onClick={() => irPara('indicadores')}
            title="Indicadores"
          >
            <Activity size={18} />
            <span>Indicadores</span>
          </button>
          {rota.pagina === 'indicadores' && (
            <div className="nav-sub">
              {ABAS_INDICADORES.map((a) => {
                const Icone = ICONE_ABA[a.id]
                return (
                  <button
                    key={a.id}
                    className={`nav-item${rota.aba === a.id ? ' active' : ''}`}
                    onClick={() => irPara('indicadores', a.id)}
                    title={a.rotulo}
                  >
                    <Icone size={15} />
                    <span>{a.rotulo}</span>
                  </button>
                )
              })}
            </div>
          )}
          <span className="nav-group-label">Próximo</span>
          <button className={`nav-item${rota.pagina === 'em-breve' ? ' active' : ''}`} onClick={() => irPara('em-breve')} title="Em breve">
            <Sparkles size={18} />
            <span>Em breve</span>
          </button>
        </nav>
        <div className="sidebar-foot">
          {instalar && (
            <button
              className="nav-item"
              onClick={async () => {
                await instalar.prompt()
                setInstalar(null)
              }}
              title="Instalar app"
            >
              <Download size={18} />
              <span>Instalar app</span>
            </button>
          )}
          <button className="nav-item" onClick={() => setAjustesAbertos(true)} title="Ajustes">
            <Settings size={18} />
            <span>Ajustes</span>
          </button>
          <div className={`sidebar-status${online ? '' : ' off'}`} title={online ? 'Online' : 'Sem conexão'}>
            <i />
            <span>{online ? (buscando ? 'Atualizando…' : 'Online · APIs públicas') : 'Offline · mostrando o último retrato'}</span>
          </div>
        </div>
      </aside>

      <main className="main-area" id="principal">
        <header className="topbar">
          <button className="mobile-header-button" onClick={() => setGaveta(true)} aria-label="Abrir menu" aria-expanded={gaveta}>
            <Menu size={20} />
          </button>
          <div className="topbar-title">
            <h1>{titulo.h}</h1>
            <p>{titulo.p}</p>
          </div>
          <div className="topbar-actions">
            <span className="some-celular">
              <Segmentado
                rotulo="Moeda"
                valor={ajustes.moeda}
                opcoes={[
                  { valor: 'BRL', rotulo: 'R$' },
                  { valor: 'USD', rotulo: 'US$' },
                ]}
                onChange={(m) => mudarAjustes({ moeda: m })}
              />
            </span>
            <button
              className={`icon-btn${ajustes.ocultarValores ? ' on' : ''}`}
              onClick={() => mudarAjustes({ ocultarValores: !ajustes.ocultarValores })}
              aria-label={ajustes.ocultarValores ? 'Mostrar valores' : 'Ocultar valores'}
              title={ajustes.ocultarValores ? 'Mostrar valores' : 'Ocultar valores'}
            >
              {ajustes.ocultarValores ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <button
              className="icon-btn"
              onClick={() => void qc.invalidateQueries()}
              aria-label="Atualizar agora"
              title="Atualizar agora"
              disabled={buscando > 0}
            >
              <RefreshCw size={16} className={buscando ? 'gira' : undefined} />
            </button>
          </div>
        </header>
        <Protecao key={`${rota.pagina}-${rota.aba}`}>
          {rota.pagina === 'carteira' && <PortfolioPage />}
          {rota.pagina === 'indicadores' && (
            <Suspense fallback={<div className="page muted">Carregando indicadores…</div>}>
              <IndicadoresPage aba={rota.aba} />
            </Suspense>
          )}
        </Protecao>
        {rota.pagina === 'em-breve' && (
          <div className="page">
            <div className="em-breve">
              <div>
                <Sparkles size={34} />
                <h2>Página em branco</h2>
                <p className="muted" style={{ marginTop: 6 }}>
                  Reservada para a próxima ferramenta.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {ajustesAbertos && <AjustesModal onFechar={() => setAjustesAbertos(false)} />}
    </div>
  )
}
