import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { config } from './chain';
import { App } from './App';
import './styles.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } } });
createRoot(document.getElementById('root')!).render(<StrictMode><WagmiProvider config={config}><QueryClientProvider client={queryClient}><App/></QueryClientProvider></WagmiProvider></StrictMode>);
