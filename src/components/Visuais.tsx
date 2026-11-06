import { fixo } from '../lib/format'
import { useState } from 'react'
import { COR } from '../lib/cores'

// Visuais pequenos em SVG: donut de alocação, medidor (0-100) e sparkline.

export type Fatia = { rotulo: string; valor: number; cor: string }

export function Donut({ fatias, tamanho = 168, centro }: { fatias: Fatia[]; tamanho?: number; centro?: React.ReactNode }) {
  const [ativa, setAtiva] = useState<number | null>(null)
  const total = fatias.reduce((s, f) => s + f.valor, 0)
  const r = tamanho / 2 - 10
  const c = 2 * Math.PI * r
  const gap = fatias.length > 1 ? 2 : 0 // 2px de superfície entre as fatias
  let acc = 0
  return (
    <div style={{ position: 'relative', width: tamanho, height: tamanho, flex: 'none' }}>
      <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} role="img" aria-label="Alocação">
        <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke={COR.grade} strokeWidth={16} />
        {total > 0 &&
          fatias.map((f, i) => {
            const frac = f.valor / total
            const len = Math.max(0, frac * c - gap)
            const el = (
              <circle
                key={f.rotulo}
                cx={tamanho / 2}
                cy={tamanho / 2}
                r={r}
                fill="none"
                stroke={f.cor}
                strokeWidth={ativa === i ? 20 : 16}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-acc * c}
                transform={`rotate(-90 ${tamanho / 2} ${tamanho / 2})`}
                style={{ transition: 'stroke-width .12s', cursor: 'default' }}
                onMouseEnter={() => setAtiva(i)}
                onMouseLeave={() => setAtiva(null)}
              >
                <title>{`${f.rotulo}: ${fixo((frac * 100), 1)}%`}</title>
              </circle>
            )
            acc += frac
            return el
          })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', pointerEvents: 'none' }}>
        {ativa != null && total > 0 ? (
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{fatias[ativa].rotulo}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{fixo(((fatias[ativa].valor / total) * 100), 1)}%</div>
          </div>
        ) : (
          centro
        )}
      </div>
    </div>
  )
}

/** Semicírculo 0-100 com faixas verde → neutro → vermelho. */
export function Medidor({ valor, rotulo, tom, escala = ['Fundo', 'Topo'] }: { valor: number | null; rotulo: string; tom?: string; escala?: [string, string] }) {
  const w = 230
  const h = 128
  const cx = w / 2
  const cy = 120
  const r = 96
  const arco = (a0: number, a1: number) => {
    const p = (a: number) => [cx + r * Math.cos(Math.PI * (1 - a)), cy - r * Math.sin(Math.PI * (1 - a))]
    const [x0, y0] = p(a0)
    const [x1, y1] = p(a1)
    return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`
  }
  const faixas = [
    [0, 0.2, COR.bom],
    [0.2, 0.4, '#3f7d4f'],
    [0.4, 0.6, '#4a505c'],
    [0.6, 0.8, '#a0662a'],
    [0.8, 1, COR.critico],
  ] as const
  const v = valor == null ? null : Math.max(0, Math.min(100, valor)) / 100
  const ang = v == null ? null : Math.PI * (1 - v)
  return (
    <div className="medidor">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${rotulo}: ${valor == null ? 'sem dado' : Math.round(valor)}`}>
        {faixas.map(([a, b, cor]) => (
          <path key={a} d={arco(a + 0.006, b - 0.006)} stroke={cor} strokeWidth={12} fill="none" strokeLinecap="butt" opacity={0.9} />
        ))}
        {ang != null && (
          <>
            <line x1={cx} y1={cy} x2={cx + (r - 22) * Math.cos(ang)} y2={cy - (r - 22) * Math.sin(ang)} stroke={COR.texto} strokeWidth={3} strokeLinecap="round" />
            <circle cx={cx} cy={cy} r={6} fill={COR.texto} stroke={COR.superficie} strokeWidth={2} />
          </>
        )}
      </svg>
      <div className="medidor-valor num">{valor == null ? '—' : Math.round(valor)}</div>
      <div className={`medidor-rotulo ${tom ?? ''}`}>{rotulo}</div>
      <div className="medidor-escala">
        <span>{escala[0]}</span>
        <span>{escala[1]}</span>
      </div>
    </div>
  )
}

export function Sparkline({ dados, largura = 120, altura = 34, cor, cheio }: { dados: number[]; largura?: number; altura?: number; cor?: string; cheio?: boolean }) {
  const estilo = cheio ? { width: '100%', height: altura } : undefined
  if (dados.length < 2) return <svg className="spark" width={largura} height={altura} style={estilo} />
  const min = Math.min(...dados)
  const max = Math.max(...dados)
  const amp = max - min || 1
  const pts = dados.map((v, i) => `${(i / (dados.length - 1)) * largura},${altura - 2 - ((v - min) / amp) * (altura - 4)}`).join(' ')
  const sobe = dados[dados.length - 1] >= dados[0]
  const c = cor ?? (sobe ? '#64c08a' : '#e07171')
  return (
    <svg className="spark" width={largura} height={altura} style={estilo} viewBox={`0 0 ${largura} ${altura}`} aria-hidden="true" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={c} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
