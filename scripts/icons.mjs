// Gera os ícones do PWA a partir do SVG da marca (public/icons/logo.svg).
// Rodar com `npm run icons` sempre que a marca mudar.
import sharp from 'sharp'
import { readFile, writeFile } from 'node:fs/promises'

const dir = new URL('../public/icons/', import.meta.url)
const logo = await readFile(new URL('logo.svg', dir), 'utf8')

// O "maskable" ocupa o quadrado inteiro (o Android recorta em círculo/gota), e o
// do iPhone não aceita transparência: os dois trocam o cartão arredondado por
// fundo cheio.
const cheio = logo.replace(/<rect[^>]*\/>/, '<rect width="512" height="512" fill="#12151c"/>')
// No maskable a marca encolhe para caber na zona segura (80% do centro).
const maskable = cheio.replace('<g id="marca">', '<g id="marca" transform="translate(51.2 51.2) scale(.8)">')

const saidas = [
  ['icon-192.png', logo, 192],
  ['icon-512.png', logo, 512],
  ['maskable-192.png', maskable, 192],
  ['maskable-512.png', maskable, 512],
  ['apple-touch-icon.png', cheio, 180],
  ['favicon-32.png', logo, 32],
]
for (const [nome, svg, tam] of saidas) {
  const png = await sharp(Buffer.from(svg)).resize(tam, tam).png().toBuffer()
  await writeFile(new URL(nome, dir), png)
  console.log('ok', nome)
}
