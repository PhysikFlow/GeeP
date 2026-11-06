import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

// Um erro num gráfico ou numa aba não pode apagar o app inteiro: ele fica
// contido no bloco onde aconteceu, com a mensagem e um "tentar de novo".
export class Protecao extends Component<{ children: ReactNode; compacto?: boolean }, { erro: Error | null }> {
  state = { erro: null as Error | null }

  static getDerivedStateFromError(erro: Error) {
    return { erro }
  }

  render() {
    if (!this.state.erro) return this.props.children
    return (
      <div className={`aviso erro${this.props.compacto ? '' : ''}`} role="alert" style={{ margin: this.props.compacto ? 8 : 0 }}>
        <AlertTriangle size={15} />
        <div>
          Algo deu errado aqui: {this.state.erro.message.slice(0, 160)}
        </div>
        <button className="btn secondary sm" onClick={() => this.setState({ erro: null })}>
          Tentar de novo
        </button>
      </div>
    )
  }
}
