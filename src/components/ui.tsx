import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { AlertTriangle, Check, Copy, Info, X } from 'lucide-react'
import { pct, tomDe } from '../lib/format'
import { useAjustes } from '../lib/store'

export function Kpi({
  rotulo,
  valor,
  detalhe,
  tom,
  icone,
  titulo,
}: {
  rotulo: ReactNode
  valor: ReactNode
  detalhe?: ReactNode
  tom?: 'ok' | 'aviso' | 'perigo'
  icone?: ReactNode
  titulo?: string
}) {
  return (
    <div className={`kpi${tom ? ` ${tom}` : ''}`} title={titulo}>
      <span className="kpi-rotulo">
        {icone}
        {rotulo}
      </span>
      <strong className="kpi-valor">{valor}</strong>
      {detalhe && <span className="kpi-detalhe">{detalhe}</span>}
    </div>
  )
}

export function Delta({ v, casas = 2, sufixo }: { v: number | null | undefined; casas?: number; sufixo?: string }) {
  return (
    <span className={`num ${tomDe(v)}`}>
      {pct(v, casas)}
      {sufixo ? ` ${sufixo}` : ''}
    </span>
  )
}

/** Valor monetário que some no modo "ocultar valores". */
export function Privado({ children }: { children: ReactNode }) {
  const { ocultarValores } = useAjustes()
  return <span className={ocultarValores ? 'oculto-valor' : undefined}>{children}</span>
}

export function Pill({ tom, children, title }: { tom?: 'ok' | 'aviso' | 'perigo' | 'info' | 'acento'; children: ReactNode; title?: string }) {
  return (
    <span className={`pill${tom ? ` ${tom}` : ''}`} title={title}>
      {children}
    </span>
  )
}

export function Segmentado<T extends string>({
  valor,
  opcoes,
  onChange,
  rotulo,
}: {
  valor: T
  opcoes: { valor: T; rotulo: ReactNode }[]
  onChange: (v: T) => void
  rotulo: string
}) {
  return (
    <div className="segmented" role="tablist" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button key={o.valor} role="tab" aria-selected={o.valor === valor} className={o.valor === valor ? 'active' : ''} onClick={() => onChange(o.valor)}>
          {o.rotulo}
        </button>
      ))}
    </div>
  )
}

export function Vazio({ icone, children }: { icone?: ReactNode; children: ReactNode }) {
  return (
    <div className="vazio">
      {icone}
      <div>{children}</div>
    </div>
  )
}

export function Esqueleto({ h = 14, w = '100%', style }: { h?: number; w?: number | string; style?: CSSProperties }) {
  return <div className="esqueleto" style={{ height: h, width: w, ...style }} aria-hidden="true" />
}

export function Aviso({ tom = 'aviso', children, acao }: { tom?: 'aviso' | 'info' | 'erro'; children: ReactNode; acao?: ReactNode }) {
  return (
    <div className={`aviso ${tom === 'aviso' ? '' : tom}`} role={tom === 'erro' ? 'alert' : 'status'}>
      {tom === 'info' ? <Info size={15} /> : <AlertTriangle size={15} />}
      <div>{children}</div>
      {acao}
    </div>
  )
}

export function Painel({
  titulo,
  sub,
  acoes,
  children,
  pe,
  className,
}: {
  titulo?: ReactNode
  sub?: ReactNode
  acoes?: ReactNode
  children: ReactNode
  pe?: ReactNode
  className?: string
}) {
  return (
    <section className={`panel${className ? ` ${className}` : ''}`}>
      {(titulo || acoes) && (
        <div className="panel-head">
          <div style={{ minWidth: 0 }}>
            {titulo && <h2>{titulo}</h2>}
            {sub && <div className="sub">{sub}</div>}
          </div>
          {acoes}
        </div>
      )}
      {children}
      {pe && <div className="panel-foot">{pe}</div>}
    </section>
  )
}

const CORES_ICONE = ['#d95926', '#3987e5', '#199e70', '#9085e9', '#d55181', '#c98500']
function corDoTexto(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return CORES_ICONE[Math.abs(h) % CORES_ICONE.length]
}

export function IconeAtivo({ src, simbolo, pequeno }: { src?: string; simbolo: string; pequeno?: boolean }) {
  const [falhou, setFalhou] = useState(false)
  return (
    <span className={`icone-ativo${pequeno ? ' sm' : ''}`} style={{ color: corDoTexto(simbolo) }} aria-hidden="true">
      {simbolo.slice(0, 3).toUpperCase()}
      {src && !falhou && <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFalhou(true)} />}
    </span>
  )
}

export function Ficha({ aberta, onFechar, topo, children }: { aberta: boolean; onFechar: () => void; topo: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!aberta) return
    const fn = (e: KeyboardEvent) => e.key === 'Escape' && onFechar()
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [aberta, onFechar])
  return (
    <>
      <div className={`ficha-fundo${aberta ? ' aberta' : ''}`} onClick={onFechar} aria-hidden="true" />
      <aside className={`ficha${aberta ? ' aberta' : ''}`} aria-hidden={!aberta} inert={!aberta} role="dialog" aria-modal={aberta}>
        <div className="ficha-topo">
          {topo}
          <button className="icon-btn sem-borda" onClick={onFechar} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="ficha-corpo">{aberta && children}</div>
      </aside>
    </>
  )
}

export function Modal({
  titulo,
  onFechar,
  children,
  pe,
}: {
  titulo: ReactNode
  onFechar: () => void
  children: ReactNode
  pe?: ReactNode
}) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => e.key === 'Escape' && onFechar()
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onFechar])
  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-topo">
          <h2>{titulo}</h2>
          <button className="icon-btn sem-borda" onClick={onFechar} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="modal-corpo">{children}</div>
        {pe && <div className="modal-pe">{pe}</div>}
      </div>
    </div>
  )
}

export function Copiar({ texto }: { texto: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      className="icon-btn sem-borda"
      aria-label="Copiar"
      title="Copiar"
      onClick={() => {
        void navigator.clipboard?.writeText(texto).then(() => {
          setOk(true)
          setTimeout(() => setOk(false), 1400)
        })
      }}
    >
      {ok ? <Check size={15} /> : <Copy size={15} />}
    </button>
  )
}

export function Dica({ texto }: { texto: string }) {
  return (
    <span title={texto} aria-label={texto} style={{ display: 'inline-flex', color: 'var(--muted-2)', cursor: 'help' }}>
      <Info size={13} />
    </span>
  )
}
