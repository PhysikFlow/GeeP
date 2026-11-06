import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Download, ExternalLink, Trash2, Upload } from 'lucide-react'
import { exportarEstado, importarEstado, mudarAjustes, useAjustes } from '../lib/store'
import { Aviso, Modal, Segmentado } from '../components/ui'

export default function AjustesModal({ onFechar }: { onFechar: () => void }) {
  const ajustes = useAjustes()
  const qc = useQueryClient()
  const [helius, setHelius] = useState(ajustes.heliusKey)
  const [msg, setMsg] = useState<{ tom: 'info' | 'erro'; texto: string } | null>(null)
  const arquivo = useRef<HTMLInputElement>(null)

  function salvarHelius() {
    mudarAjustes({ heliusKey: helius.trim() })
    setMsg({ tom: 'info', texto: helius.trim() ? 'Chave salva. As carteiras Solana vão recarregar com histórico.' : 'Chave removida.' })
  }

  function baixar() {
    const blob = new Blob([exportarEstado()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `geep-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importar(f: File) {
    try {
      const n = importarEstado(await f.text())
      setMsg({ tom: 'info', texto: `${n} carteira(s) importada(s).` })
    } catch (e) {
      setMsg({ tom: 'erro', texto: e instanceof Error ? e.message : 'Arquivo inválido.' })
    }
  }

  return (
    <Modal titulo="Ajustes" onFechar={onFechar} pe={<button className="btn primary" onClick={onFechar}>Fechar</button>}>
      <div className="field">
        <span className="label">Moeda de exibição</span>
        <Segmentado
          rotulo="Moeda"
          valor={ajustes.moeda}
          opcoes={[
            { valor: 'BRL', rotulo: 'Real (R$)' },
            { valor: 'USD', rotulo: 'Dólar (US$)' },
          ]}
          onChange={(m) => mudarAjustes({ moeda: m })}
        />
        <small>Os cálculos são em dólar; o real usa o câmbio do dia (e o câmbio histórico no custo médio).</small>
      </div>

      <div className="field">
        <label className="check">
          <input type="checkbox" checked={ajustes.ocultarValores} onChange={(e) => mudarAjustes({ ocultarValores: e.target.checked })} />
          Ocultar valores (para abrir o app em público)
        </label>
      </div>

      <div className="field">
        <label htmlFor="helius">Chave Helius (opcional, grátis)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="helius"
            className="input mono"
            value={helius}
            onChange={(e) => setHelius(e.target.value)}
            placeholder="cole a API key aqui"
            autoComplete="off"
            spellCheck={false}
          />
          <button className="btn secondary" onClick={salvarHelius} disabled={helius.trim() === ajustes.heliusKey}>
            Salvar
          </button>
        </div>
        <small>
          Os RPCs públicos da Solana não guardam histórico nem listam stake. Com a chave do plano grátis da Helius (cadastro
          com e-mail) o app passa a mostrar o histórico, o preço médio e o stake nativo das carteiras Solana. Ela fica só neste
          aparelho.{' '}
          <a href="https://dashboard.helius.dev/signup" target="_blank" rel="noreferrer">
            Criar chave <ExternalLink size={11} />
          </a>
        </small>
      </div>

      <div className="field">
        <span className="label">Backup das carteiras</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn secondary sm" onClick={baixar}>
            <Download size={14} /> Exportar
          </button>
          <button className="btn secondary sm" onClick={() => arquivo.current?.click()}>
            <Upload size={14} /> Importar
          </button>
          <button
            className="btn quiet sm"
            onClick={() => {
              qc.clear()
              setMsg({ tom: 'info', texto: 'Cache limpo. Tudo será baixado de novo.' })
            }}
          >
            <Trash2 size={14} /> Limpar cache
          </button>
          <input
            ref={arquivo}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importar(f)
              e.target.value = ''
            }}
          />
        </div>
        <small>As carteiras ficam só neste aparelho (sem conta, sem servidor). O backup não leva a chave Helius.</small>
      </div>

      {msg && (
        <div style={{ marginTop: 14 }}>
          <Aviso tom={msg.tom}>{msg.texto}</Aviso>
        </div>
      )}
    </Modal>
  )
}
