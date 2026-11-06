import { useMemo, useState } from 'react'
import { CheckCircle2, Loader2, ShieldAlert } from 'lucide-react'
import { detectar } from '../../lib/detect'
import { resolverEns } from '../../lib/chains/eth'
import { adicionarCarteira, NOME_DA_REDE, useCarteiras } from '../../lib/store'
import { Modal } from '../../components/ui'

const EXEMPLOS = [
  { rotulo: 'Bloco gênese (BTC)', valor: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' },
  { rotulo: 'vitalik.eth (ETH)', valor: 'vitalik.eth' },
  { rotulo: 'Exemplo da doc. Solana', valor: 'vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg' },
]

export default function AdicionarCarteira({ onFechar, onAdicionada }: { onFechar: () => void; onAdicionada?: (id: string) => void }) {
  const carteiras = useCarteiras()
  const [texto, setTexto] = useState('')
  const [nome, setNome] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const det = useMemo(() => detectar(texto), [texto])

  const duplicada = det.ok && carteiras.some((c) => c.endereco.toLowerCase() === det.valor.toLowerCase() || c.ens === det.valor)

  async function salvar() {
    if (!det.ok || duplicada) return
    setSalvando(true)
    setErro(null)
    try {
      let endereco = det.valor
      let ens: string | undefined
      if (det.tipo === 'ens') {
        ens = det.valor
        endereco = await resolverEns(det.valor)
        if (carteiras.some((c) => c.rede === 'eth' && c.endereco.toLowerCase() === endereco.toLowerCase())) {
          throw new Error(`${ens} já está na lista (${endereco}).`)
        }
      }
      const padrao = ens ?? `${NOME_DA_REDE[det.rede]} ${carteiras.filter((c) => c.rede === det.rede).length + 1}`
      const nova = adicionarCarteira({
        rede: det.rede,
        endereco,
        tipo: det.tipo === 'xpub' ? 'xpub' : 'endereco',
        nome: nome.trim() || padrao,
        ens,
      })
      onAdicionada?.(nova.id)
      onFechar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui adicionar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      titulo="Adicionar carteira"
      onFechar={onFechar}
      pe={
        <>
          <button className="btn quiet" onClick={onFechar}>
            Cancelar
          </button>
          <button className="btn primary" onClick={() => void salvar()} disabled={!det.ok || duplicada || salvando}>
            {salvando && <Loader2 size={14} className="gira" />}
            Adicionar
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="end">Endereço público</label>
        <textarea
          id="end"
          className="input"
          rows={3}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="bc1…, 1…, 3…, xpub/zpub…, 0x…, nome.eth ou endereço Solana"
          autoFocus
          spellCheck={false}
          autoComplete="off"
        />
        <small>Só leitura. O app nunca pede, guarda ou conecta chave privada — só olha o que é público na blockchain.</small>
      </div>

      {texto.trim() && (
        <div className={`deteccao ${det.ok && !duplicada ? 'ok' : 'erro'}`} style={{ marginTop: 10 }}>
          {det.ok && !duplicada ? <CheckCircle2 size={15} /> : <ShieldAlert size={15} />}
          <span>
            {det.ok
              ? duplicada
                ? 'Esta carteira já está na lista.'
                : `${NOME_DA_REDE[det.rede]} · ${det.formato}${det.tipo === 'xpub' ? ' — os endereços são derivados aqui, no aparelho' : ''}`
              : det.motivo}
          </span>
        </div>
      )}

      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="nome">Nome (opcional)</label>
        <input id="nome" className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Ledger, Hot wallet, Corretora…" />
      </div>

      {!texto && (
        <div className="field">
          <span className="label">Quer só testar? Endereços públicos conhecidos:</span>
          <div className="exemplos">
            {EXEMPLOS.map((e) => (
              <button key={e.valor} onClick={() => setTexto(e.valor)}>
                {e.rotulo}
              </button>
            ))}
          </div>
        </div>
      )}

      {erro && (
        <div className="deteccao erro" style={{ marginTop: 12 }}>
          <ShieldAlert size={15} />
          <span>{erro}</span>
        </div>
      )}
    </Modal>
  )
}
