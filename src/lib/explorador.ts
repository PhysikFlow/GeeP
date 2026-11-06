import type { Carteira, Rede } from './store'

export function linkEndereco(c: Pick<Carteira, 'rede' | 'endereco' | 'tipo'>) {
  if (c.tipo === 'xpub') return null
  if (c.rede === 'btc') return `https://mempool.space/address/${c.endereco}`
  if (c.rede === 'eth') return `https://etherscan.io/address/${c.endereco}`
  return `https://solscan.io/account/${c.endereco}`
}

export function linkTx(rede: Rede, txid: string) {
  if (txid.startsWith('bloco-')) return null
  if (rede === 'btc') return `https://mempool.space/tx/${txid}`
  if (rede === 'eth') return `https://etherscan.io/tx/${txid}`
  return `https://solscan.io/tx/${txid}`
}

export function linkEnderecoBtc(endereco: string) {
  return `https://mempool.space/address/${endereco}`
}
