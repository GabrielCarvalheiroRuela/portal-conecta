import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { mockWorkflows } from './vite-mock-wf'

// Os proxies de /api, /acesso, /filas-integracao e /wf existem só em desenvolvimento, para não esbarrar em CORS.
// Em produção quem faz esse papel são os locations do nginx.conf.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_API_TARGET || 'http://localhost:3001'
  const n8n = env.VITE_N8N_TARGET || 'https://automakerdev.citelsoftware.com.br'

  return {
    // VITE_MOCK_WF=1 simula /acesso e /wf (aba Workflows) sem n8n; ver vite-mock-wf.ts.
    plugins: [react(), mockWorkflows(env.VITE_MOCK_WF === '1')],
    server: {
      port: 4200,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          secure: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
        },
        '/acesso': {
          target: n8n,
          changeOrigin: true,
          secure: true,
          rewrite: (p) => p.replace(/^\/acesso/, '/webhook/portal-acesso'),
        },
        '/filas-integracao': {
          target: n8n,
          changeOrigin: true,
          secure: true,
          rewrite: (p) => p.replace(/^\/filas-integracao/,'/webhook/filas-integracao'),
        },
        // /wf-importar vem antes de /wf: o Vite casa pelo começo do caminho, e "/wf" também casaria com ele.
        '/wf-importar': {
          target: n8n,
          changeOrigin: true,
          secure: true,
          rewrite: (p) => p.replace(/^\/wf-importar/, '/webhook/portal-wf-importar'),
        },
        '/wf': {
          target: n8n,
          changeOrigin: true,
          secure: true,
          rewrite: (p) => p.replace(/^\/wf/, '/webhook/portal-wf'),
        },
      },
    },
  }
})
