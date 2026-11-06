import { useState } from 'react'
import { data, dinheiro, numero, pct, qtd } from '../../lib/format'
import type { Posicao } from '../../lib/portfolio'
import { useConversao } from '../../lib/precos'
import { definirPrecoMedio } from '../../lib/store'
import { Aviso, Modal, Privado } from '../../components/ui'

export default function AtivoModal({ p, onFechar }: { p: Posicao; onFechar: () => void }) {
  const { moeda, conv, cambio } = useConversao()
  const c = p.custo
  const [manual, setManual] = useState(() => {
    const v = c?.manual ? conv(c.precoMedioUsd) : null
    return v != null ? String(Math.round(v * 100) / 100) : ''
  })
  const medio = moeda === 'BRL' ? c?.precoMedioBrl : c?.precoMedioUsd
  const atual = conv(p.precoUsd)
  const resultado = medio != null && atual != null ? (atual / medio - 1) * 100 : null
  const entradas = c?.entradas ?? []

  function salvar() {
    const v = Number(manual.replace(/\./g, '').replace(',', '.'))
    if (!manual.trim()) definirPrecoMedio(p.chave, null)
    else if (Number.isFinite(v) && v > 0) definirPrecoMedio(p.chave, moeda === 'BRL' && cambio ? v / cambio : v)
    onFechar()
  }

  return (
    <Modal
      titulo={`Preço médio · ${p.simbolo}`}
      onFechar={onFechar}
      pe={
        <>
          <button className="btn quiet" onClick={onFechar}>
            Cancelar
          </button>
          <button className="btn primary" onClick={salvar}>
            Salvar
          </button>
        </>
      }
    >
      <div className="detalhes" style={{ borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
        <div>
          <span>Quantidade</span>
          <b>
            <Privado>{qtd(p.qtd)}</Privado>
          </b>
        </div>
        <div>
          <span>Preço agora</span>
          <b>{dinheiro(atual, moeda)}</b>
        </div>
        <div>
          <span>Preço médio {c?.manual ? '(manual)' : '(estimado)'}</span>
          <b>{dinheiro(medio, moeda)}</b>
        </div>
        <div>
          <span>Resultado</span>
          <b className={resultado == null ? '' : resultado >= 0 ? 'sobe' : 'desce'}>{pct(resultado)}</b>
        </div>
      </div>

      {c && !c.manual && (
        <div className="explica" style={{ marginBottom: 14 }}>
          <p>
            <b>Como é estimado:</b> cada entrada na carteira conta como compra pelo preço daquele dia; cada saída reduz a quantidade
            sem mudar o preço médio (custo médio). Transferências entre carteiras suas que estão no app se anulam.
          </p>
          <p>
            Base: {numero(entradas.length, 0)} entradas
            {entradas.length ? `, de ${data(entradas[0].t)} a ${data(entradas[entradas.length - 1].t)}` : ''} · {c.cobertura[0]} de{' '}
            {c.cobertura[1]} carteira(s) com histórico.
          </p>
        </div>
      )}
      {c?.parcial && (
        <Aviso>
          Nem todas as carteiras de {p.simbolo} têm histórico (Solana sem chave Helius, ou falha da API). O preço médio vale só para as
          que têm.
        </Aviso>
      )}
      {(c?.saldoInicialEstimado ?? 0) > 1e-8 && (
        <Aviso>
          O histórico baixado não chega ao início: {qtd(c!.saldoInicialEstimado!)} {p.simbolo} já estavam na carteira e entraram pelo
          preço da primeira movimentação vista.
        </Aviso>
      )}

      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="pm">Seu preço médio real ({moeda === 'BRL' ? 'R$' : 'US$'})</label>
        <input
          id="pm"
          className="input"
          inputMode="decimal"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder={medio != null ? `Estimado: ${dinheiro(medio, moeda)}` : 'Ex.: 350000'}
        />
        <small>Se você sabe quanto pagou (corretora, planilha), informe aqui: ele substitui o estimado. Deixe vazio para voltar ao estimado.</small>
      </div>

      {entradas.length > 0 && !c?.manual && (
        <div className="panel" style={{ marginTop: 14 }}>
          <div className="panel-head">
            <h3>Maiores entradas</h3>
          </div>
          <div>
            {[...entradas]
              .sort((a, b) => b.qtd - a.qtd)
              .slice(0, 8)
              .map((e) => (
                <div key={`${e.t}-${e.qtd}`} className="mov" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                  <div>
                    <Privado>
                      +{qtd(e.qtd)} {p.simbolo}
                    </Privado>
                    <div className="muted-2" style={{ fontSize: 11 }}>
                      {data(e.t)}
                    </div>
                  </div>
                  <div className="mov-end">{dinheiro(conv(e.precoUsd), moeda)}</div>
                </div>
              ))}
          </div>
        </div>
      )}
    </Modal>
  )
}
