// Cores de dado em hex (o lightweight-charts não lê variável CSS). As cinco de
// identidade foram validadas juntas sobre a superfície #12151c (faixa de
// luminosidade, croma, separação para daltonismo e contraste ≥ 3:1) na ordem
// BTC, ETH, SOL, Stables, Outros. Mudou uma? Rode o validador de novo.
export const COR = {
  btc: '#d95926',
  eth: '#3987e5',
  sol: '#199e70',
  stable: '#9085e9',
  outros: '#d55181',

  // estados (zonas de fundo/topo); nunca usados como "série 6"
  bom: '#0ca30c',
  atencao: '#fab219',
  critico: '#d03b3b',

  texto: '#eef1f6',
  muted: '#97a0b0',
  muted2: '#838c9e',
  grade: '#1a1e27',
  eixo: '#232833',
  superficie: '#12151c',
  acento: '#f08a24',
} as const

export const COR_NATIVO = { BTC: COR.btc, ETH: COR.eth, SOL: COR.sol } as const
export const COR_GRUPO: Record<string, string> = { BTC: COR.btc, ETH: COR.eth, SOL: COR.sol, Stables: COR.stable, Outros: COR.outros }
export const COR_REDE = { btc: COR.btc, eth: COR.eth, sol: COR.sol } as const
