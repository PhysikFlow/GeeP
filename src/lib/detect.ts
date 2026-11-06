import { base58, bech32, bech32m, createBase58check } from '@scure/base'
import { sha256 } from '@noble/hashes/sha2.js'
import type { Rede } from './store'

// Descobre a rede pelo formato do texto colado. Só aceita o que é PÚBLICO:
// endereço, chave estendida pública (xpub/ypub/zpub) ou nome ENS. Uma chave
// privada ou frase-semente é recusada com aviso — nunca deve entrar aqui.

const b58check = createBase58check(sha256)

export type Deteccao =
  | { ok: true; rede: Rede; tipo: 'endereco' | 'xpub' | 'ens'; valor: string; formato: string }
  | { ok: false; motivo: string }

export function detectar(entrada: string): Deteccao {
  const v = entrada.trim()
  if (!v) return { ok: false, motivo: '' }

  if (pareceSegredo(v)) {
    return {
      ok: false,
      motivo: 'Isto parece uma chave PRIVADA ou frase-semente. Nunca cole isso em app nenhum — use só o endereço público.',
    }
  }

  // Bitcoin: bech32 (bc1q…) e bech32m (bc1p…, Taproot)
  if (/^bc1/i.test(v)) {
    const low = v.toLowerCase()
    try {
      const d = low.startsWith('bc1p') ? bech32m.decode(low as `${string}1${string}`) : bech32.decode(low as `${string}1${string}`)
      if (d.prefix === 'bc') return { ok: true, rede: 'btc', tipo: 'endereco', valor: low, formato: low.startsWith('bc1p') ? 'Taproot' : 'SegWit nativo' }
    } catch {
      // cai no erro abaixo
    }
    return { ok: false, motivo: 'Endereço bc1 inválido (confira se colou inteiro).' }
  }

  // Chave estendida pública
  if (/^[xyz]pub[1-9A-HJ-NP-Za-km-z]{100,112}$/.test(v)) {
    try {
      b58check.decode(v)
      const f = v[0] === 'z' ? 'zpub (SegWit nativo)' : v[0] === 'y' ? 'ypub (SegWit aninhado)' : 'xpub (legado)'
      return { ok: true, rede: 'btc', tipo: 'xpub', valor: v, formato: f }
    } catch {
      return { ok: false, motivo: 'Chave estendida com dígito verificador inválido.' }
    }
  }

  // EVM
  if (/^0x[0-9a-fA-F]{40}$/.test(v)) return { ok: true, rede: 'eth', tipo: 'endereco', valor: v, formato: 'Endereço EVM' }
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.eth$/i.test(v)) return { ok: true, rede: 'eth', tipo: 'ens', valor: v.toLowerCase(), formato: 'Nome ENS' }

  // Base58: 25 bytes = Bitcoin legado (1…/3…); 32 bytes = chave pública Solana.
  if (/^[1-9A-HJ-NP-Za-km-z]{25,44}$/.test(v)) {
    let bytes: Uint8Array | null = null
    try {
      bytes = base58.decode(v)
    } catch {
      bytes = null
    }
    if (bytes?.length === 25 && /^[13]/.test(v)) {
      try {
        b58check.decode(v)
        return { ok: true, rede: 'btc', tipo: 'endereco', valor: v, formato: v[0] === '1' ? 'Legado (P2PKH)' : 'Script (P2SH)' }
      } catch {
        return { ok: false, motivo: 'Endereço Bitcoin com dígito verificador inválido.' }
      }
    }
    if (bytes?.length === 32) return { ok: true, rede: 'sol', tipo: 'endereco', valor: v, formato: 'Endereço Solana' }
  }

  return { ok: false, motivo: 'Formato não reconhecido. Aceito: endereço BTC (bc1/1/3), xpub/ypub/zpub, 0x… ou .eth, e endereço Solana.' }
}

function pareceSegredo(v: string) {
  // Frase-semente: 12+ palavras minúsculas
  if (/^([a-z]+\s+){11,23}[a-z]+$/.test(v.toLowerCase()) && v.split(/\s+/).length >= 12) return true
  // Chaves privadas estendidas
  if (/^[xyzt]prv[1-9A-HJ-NP-Za-km-z]{100,}$/.test(v)) return true
  // WIF (5…, K…, L… com 51-52 caracteres)
  if (/^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(v)) return true
  // Chave privada EVM em hex (64 caracteres)
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(v)) return true
  // Chave privada Solana exportada (64 bytes em base58, ~87-88 caracteres)
  if (/^[1-9A-HJ-NP-Za-km-z]{85,90}$/.test(v)) return true
  return false
}
