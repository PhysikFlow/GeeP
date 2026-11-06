import { useState } from 'react'
import { Save, Trash2 } from 'lucide-react'
import { relativo } from '../../lib/format'
import { ALERTAS, CRITERIOS, decisaoDe, macroSugerido, TEXTOS, totalDe } from '../../lib/indicators/dossie'
import { NIVEIS } from '../../lib/indicators/macro'
import type { Token } from '../../lib/indicators/triagem'
import { removerDossie, salvarDossie, useDossies, type Dossie } from '../../lib/store'
import { Pill } from '../../components/ui'

/** Etapas 3 a 5: dossiê, bear case e nota, guardados neste aparelho. */
export default function DossieToken({ t, nivel, saidaRuim }: { t: Token; nivel: 1 | 2 | 3 | null; saidaRuim: boolean | null }) {
  const salvo = useDossies()[t.id]
  const [d, setD] = useState<Dossie>(
    () =>
      salvo ?? {
        id: t.id,
        simbolo: t.simbolo,
        nome: t.nome,
        notas: { adocao: 0, tokenomics: 0, competitiva: 0, valuation: 0, narrativa: 0, macro: macroSugerido(nivel) },
        textos: {},
        // os dados já dizem algumas coisas: começam marcadas
        alertas: { diluicao: (t.fdvMc ?? 0) > 3, saida: saidaRuim === true },
        atualizadoEm: 0,
      },
  )
  const [mudou, setMudou] = useState(false)
  const muda = (f: (x: Dossie) => Dossie) => {
    setD(f)
    setMudou(true)
  }
  const total = totalDe(d)
  const dec = decisaoDe(d)
  const emExcecao = total >= 65 && total < 75

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Dossiê e nota (etapas 3–5)</h2>
        <Pill tom={dec.tom}>
          {total}/100 · {dec.rotulo}
        </Pill>
      </div>
      <div className="panel-body" style={{ display: 'grid', gap: 14 }}>
        <p className="muted-2" style={{ fontSize: 12 }}>
          {dec.detalhe} {nivel ? `Ambiente agora: ${NIVEIS[nivel].nome.toLowerCase()}.` : ''} Fica salvo só neste aparelho (e no backup dos Ajustes).
        </p>

        <div className="dossie-notas">
          {CRITERIOS.map((c) => (
            <label key={c.id} className="dossie-nota" title={c.guia}>
              <span>
                {c.nome} <b className="num">{d.notas[c.id]}</b>
                <span className="muted-2">/{c.max}</span>
              </span>
              <input
                type="range"
                min={0}
                max={c.max}
                step={1}
                value={d.notas[c.id]}
                onChange={(e) => muda((x) => ({ ...x, notas: { ...x.notas, [c.id]: Number(e.target.value) } }))}
              />
              <small>{c.guia}</small>
            </label>
          ))}
        </div>

        <div>
          <span className="label" style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
            Alertas que bloqueiam a compra em qualquer nota
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 6 }}>
            {ALERTAS.map((a) => (
              <label key={a.id} className="check">
                <input type="checkbox" checked={!!d.alertas[a.id]} onChange={(e) => muda((x) => ({ ...x, alertas: { ...x.alertas, [a.id]: e.target.checked } }))} />
                {a.nome}
              </label>
            ))}
          </div>
        </div>

        {TEXTOS.map((c) => (
          <div key={c.id} className="field" style={{ marginTop: 0 }}>
            <label htmlFor={`d-${c.id}`}>{c.nome}</label>
            <textarea
              id={`d-${c.id}`}
              className="input texto"
              rows={c.id === 'bear' || c.id === 'resposta' ? 4 : 2}
              placeholder={c.dica}
              value={d.textos[c.id] ?? ''}
              onChange={(e) => muda((x) => ({ ...x, textos: { ...x.textos, [c.id]: e.target.value } }))}
            />
          </div>
        ))}

        {emExcecao && (
          <div className="field" style={{ marginTop: 0 }}>
            <label htmlFor="d-excecao">Memo de exceção (obrigatório para nota 65–74)</label>
            <textarea
              id="d-excecao"
              className="input texto"
              rows={3}
              placeholder="Por que vale abrir exceção, e o que limita o risco (tamanho, prazo, condição de saída)."
              value={d.textos.excecao ?? ''}
              onChange={(e) => muda((x) => ({ ...x, textos: { ...x.textos, excecao: e.target.value } }))}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn primary sm"
            onClick={() => {
              salvarDossie(d)
              setMudou(false)
            }}
            disabled={!mudou && !!salvo}
          >
            <Save size={13} /> {mudou || !salvo ? 'Salvar dossiê' : 'Salvo'}
          </button>
          {salvo && (
            <>
              <span className="muted-2" style={{ fontSize: 12 }}>
                última edição {relativo(salvo.atualizadoEm)}
              </span>
              <button className="btn quiet sm danger" onClick={() => removerDossie(t.id)}>
                <Trash2 size={13} /> Apagar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
