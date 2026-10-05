/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Client ID do projeto no Google Cloud. Não é segredo — é público por design.
   * Precisa ser o MESMO valor de api.security.google.client-id na API: ele é o audience do
   * ID Token, e o backend recusa o login se os dois divergirem.
   */
  readonly VITE_GOOGLE_CLIENT_ID?: string
  /** Só em desenvolvimento: usuário e senha do POST /Autenticar para o login sem Google. */
  readonly VITE_MONINT_USER?: string
  readonly VITE_MONINT_PASS?: string
  /** Só em desenvolvimento: recursos restritos (separados por vírgula) que a tela mostra sem consultar a lista. */
  readonly VITE_RECURSOS_DEV?: string
  /** Só em desenvolvimento: ADMIN faz a tela tratar quem entrou como admin (as abas de admin aparecem). */
  readonly VITE_PERFIL_DEV?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
