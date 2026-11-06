import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { del, get, set } from 'idb-keyval'

// Tudo que vem das APIs passa pelo React Query, e o cache dele vive no
// IndexedDB: o app abre com o último retrato (inclusive offline) e só então
// confere a rede. Cada consulta diz quanto tempo o dado vale (staleTime).

export const MIN = 60_000
export const HORA = 60 * MIN
export const DIA = 24 * HORA

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * MIN,
      gcTime: 7 * DIA,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export const persister = createAsyncStoragePersister({
  storage: {
    getItem: (k) => get<string>(k).then((v) => v ?? null),
    setItem: (k, v) => set(k, v),
    removeItem: (k) => del(k),
  },
  key: 'geep.cache',
  throttleTime: 2000,
})

// Sobe quando o formato de algum dado guardado mudar: o cache velho é descartado.
export const VERSAO_DO_CACHE = 'v3'
