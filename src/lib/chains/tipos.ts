import type { Nativo, Rede } from '../store'

/** Uma mudança no saldo da moeda nativa, vista por uma carteira. */
export type Movimento = {
  /** Identificador da transação: junta a mesma transação vista por duas carteiras suas. */
  txid: string
  /** Unix, em segundos. */
  t: number
  /** Variação do saldo na moeda (BTC/ETH/SOL), já com a taxa descontada. */
  delta: number
  /** Taxa paga por esta carteira, quando ela é quem enviou. */
  taxa?: number
  pendente?: boolean
}

export type Token = {
  /** Contrato (EVM) ou mint (Solana). */
  id: string
  simbolo: string
  nome: string
  qtd: number
  precoUsd: number | null
  variacao24h?: number | null
  icone?: string
  /** Lista curada / reputação boa: o resto é provável spam ou airdrop. */
  confiavel: boolean
}

export type Detalhe = { rotulo: string; valor: string; dica?: string }

export type EnderecoDerivado = { endereco: string; caminho: string; saldo: number; ntx: number }

export type DadosCarteira = {
  rede: Rede
  nativo: Nativo
  saldo: number
  pendente: number
  tokens: Token[]
  /** null = histórico indisponível sem chave (Solana sem Helius). */
  movimentos: Movimento[] | null
  /** O histórico baixado não chega ao começo da carteira (limite de páginas). */
  historicoParcial: boolean
  /** Nº total de transações da carteira, quando a API informa. */
  totalTransacoes: number | null
  detalhes: Detalhe[]
  enderecos?: EnderecoDerivado[]
  avisos: string[]
  atualizadoEm: number
}
