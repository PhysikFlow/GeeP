import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { registerSW } from 'virtual:pwa-register'
import { DIA, persister, queryClient, VERSAO_DO_CACHE } from './lib/query'
import App from './App'
import './styles.css'

registerSW({ immediate: true })

// As carteiras ficam no localStorage e o cache no IndexedDB. Pedir
// armazenamento persistente evita que o navegador apague isso para liberar
// espaço (o PWA instalado costuma receber sem perguntar).
void navigator.storage?.persist?.().catch(() => undefined)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 7 * DIA,
        buster: VERSAO_DO_CACHE,
        dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' },
      }}
    >
      <App />
    </PersistQueryClientProvider>
  </StrictMode>,
)
