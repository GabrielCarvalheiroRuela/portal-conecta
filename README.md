# Conecta — Onboarding

Tela de cadastro de lojistas e integrações da integração multi-tenant. Consome a API Monint
(`monitoramento-pedpen`).

Três abas:

| Aba | O que faz | Endpoints |
|---|---|---|
| Nova integração | Vincula uma plataforma a um lojista | `GET /clientes`, `POST /integracoes` |
| Novo lojista | Cria o usuário de login do lojista | `POST /cadastro` |
| Integrações | Consulta o que está cadastrado | `GET /integracoes` |

## Rodar

```bash
npm install
```

Copie o `.env.example` para `.env` e preencha o `VITE_GOOGLE_CLIENT_ID` — **sem ele o Google não
funciona** (veja a armadilha abaixo).

```bash
npm run dev
```

Sobe em `http://localhost:4200` e pede login com a conta Google da Citel.

## Login pelo Google

A tela autentica só pelo Google Workspace. O fluxo:

1. O botão do Google devolve um **ID Token** no navegador
2. A tela manda esse token para `POST /Autenticar/google`
3. A API confere a assinatura contra as chaves públicas do Google, o `aud`, o `exp`, o
   `email_verified` e o domínio (`hd`)
4. Se passar, a API cria o usuário no `CADUSR` na primeira entrada e devolve o JWT do Monint

O `POST /Autenticar` por usuário e senha continua existindo na API — é o que o n8n usa —, mas esta
tela não o usa.

### Configuração no Google Cloud

No projeto, em *Credentials > OAuth 2.0 Client IDs > Web application*, a origem em que a tela roda
precisa estar em **Authorized JavaScript origins**:

- `http://localhost:4200` para desenvolvimento
- `https://onboarding.citelsoftware.com.br` para produção

Não é preciso configurar *Authorized redirect URIs*: o Google Identity Services devolve o token na
própria página, sem redirect.

Se o consent screen estiver em **Testing**, só entram os e-mails cadastrados como *test users* — o
sintoma é `access_blocked`.

### ⚠️ O client ID tem que bater dos dois lados

`VITE_GOOGLE_CLIENT_ID` (aqui) e `api.security.google.client-id` (na API) precisam ser **o mesmo
valor**. Ele é o `audience` do ID Token: se divergirem, o login falha com "Token do Google inválido
ou expirado". Ao trocar o projeto pessoal pelo da Citel, troque nos dois.

### ⚠️ Build sem a variável remove o Google silenciosamente

O Vite substitui `import.meta.env.VITE_GOOGLE_CLIENT_ID` no momento do build. Sem a variável, ela
vira `undefined`, a condição `!CLIENT_ID` fica constante e o Rollup **elimina o ramo do Google
inteiro** como código morto — o build passa sem erro e a tela sai sem botão de login, só com o
aviso de configuração.

Por isso o `Dockerfile` recebe `VITE_GOOGLE_CLIENT_ID` como `ARG`. Ao publicar, confira que ele foi
passado:

```bash
grep -c "gsi/client" dist/assets/*.js
```

Tem que devolver `1`. Se devolver `0`, o bundle saiu sem o Google.

## Perfil de usuário (admin e comum)

O usuário interno tem um perfil no `CADUSR` (`USR_PERFIL`: `ADMIN` ou `USUARIO`, padrão `USUARIO`). Quem é
admin é dado do banco, marcado com `UPDATE` (script em `monitoramento-pedpen/sql/001_cadusr_perfil.sql`);
o login pelo Google nunca promove nem rebaixa ninguém.

- **API:** `POST /plataformas`, `POST /integracoes` e `GET /clientes` respondem **403** ao usuário interno
  sem perfil ADMIN. Lojistas (o n8n) e admins passam como antes, e `POST /cadastro` continua aberto.
- **Token:** o login devolve o claim `perfil`. A tela o lê em `ehAdmin()` (`src/services/api.ts`) e **esconde**
  as abas **Plataformas**, **Nova integração** e **Workflows** de quem não é admin.
- **Esconder não protege:** quem barra é a API (e o n8n, na aba Workflows). O token reflete o perfil do
  momento do login, então quem foi promovido precisa entrar de novo para ver as abas.
- **Desenvolvimento:** `VITE_PERFIL_DEV=ADMIN` no `.env` mostra as abas de admin no `npm run dev`, só visualmente.

## Controle de acesso por recurso

A aba **Workflows** exige, além de ser admin, estar na lista do n8n. Quem decide não é a tela:

1. Ao entrar, o portal chama `GET /acesso` com o JWT do Monint.
2. O nginx repassa ao webhook `portal-acesso` do n8n (workflow **Portal_Acesso**).
3. O n8n repassa o mesmo JWT ao Monint (`GET /plataformas`) — só passa token que o Monint aceita —,
   lê o e-mail do `sub` e consulta a Data Table `portal_acessos` (colunas `email` e `recurso`, uma
   linha por pessoa e recurso).
4. Responde `{ email, recursos: [...] }`. A aba só aparece se o recurso dela estiver na lista.

**Para liberar alguém:** adicione uma linha em `portal_acessos` no n8n, com o `email` em minúsculas e
`recurso` = `workflows`. Não precisa de deploy.

**Esconder a aba não protege nada sozinho.** Todo endpoint que entregar dado restrito tem de repetir
a checagem no servidor: `GET /acesso?recurso=workflows` responde 403 sem permissão e 401 com token
inválido. Para trancar uma rota da API do Monint, aponte um `auth_request` do nginx para esse mesmo
endpoint.

Se o n8n cair ou o webhook não estiver publicado, o portal segue funcionando, só sem as abas
restritas. Em desenvolvimento, `VITE_N8N_TARGET` aponta para o n8n que tem o workflow.

Para mexer na tela sem estar na tabela, `VITE_RECURSOS_DEV=workflows` no `.env` mostra a aba no
`npm run dev`. Isso é só visual: os dados continuam sendo checados no n8n e quem não está na tabela
recebe 403. No build de produção a variável é ignorada.

### Aba Workflows (exportação)

Escolhe a instância do n8n, filtra por cliente, base e/ou trecho do nome (com prévia da lista) e baixa
um ZIP com um `.json` por workflow. Tudo passa pelo
webhook `portal-wf` do n8n (workflow **Portal_WF_Exportar**, `/wf` no nginx e no Vite):

Os nomes seguem `Cliente_Base_Etapa` (ex.: `LAB_Mercos_Pedido_Captura`): o **cliente** é a parte antes
do primeiro `_` e a **base** é a segunda. Os filtros `cliente`, `base` e `busca` (trecho do nome) se
combinam, sem diferenciar maiúsculas, e a exportação exige ao menos um. Só a base pega a mesma base de
todos os clientes.

- `GET /wf?acao=instancias` — instâncias disponíveis (apelido e nome).
- `GET /wf?acao=clientes&instancia=dev` — as opções dos filtros: clientes e bases, cada uma com a
  quantidade de workflows.
- `GET /wf?acao=previa&instancia=dev&base=Mercos` — o total e os workflows que casam (`id` e `nome`,
  até 300).
- `GET /wf?acao=exportar&instancia=dev&ids=ID1,ID2` — o ZIP com exatamente esses workflows (até 300).
  A seleção é por ID porque o n8n aceita nomes repetidos; IDs malformados, repetidos ou de
  arquivados são ignorados.

Na tela há duas listas: o **resultado do filtro**, que muda a cada busca, e a lista **para exportar**,
que acumula entre buscas (adicione um a um ou todos do resultado, e remova o que não quiser). O ZIP leva
a segunda. Trocar de instância zera as duas.

As três repetem a checagem do `Portal_Acesso` (recurso `workflows`). A instância vai por apelido e a
credencial de cada uma fica só no n8n. Workflows arquivados não entram. Os JSONs podem ter senhas em
texto puro nos nodes, por isso cada exportação é registrada na tabela `portal_wf_log` com o e-mail,
a instância, a quantidade e os nomes exportados.

## Build e publicação

```bash
npm run build
```

Gera em `dist/`. O `Dockerfile` faz build em dois estágios e serve com nginx; o `location /api/` do
`nginx.conf` cumpre em produção o mesmo papel do proxy do Vite. **Nenhuma credencial entra no
build.**

## Sessão

O login guarda o JWT em `sessionStorage` e a credencial apenas em memória, nunca em disco. Enquanto
a aba estiver aberta o token é renovado sozinho quando vence (a API expira em 2h). Depois de um F5,
a credencial se perde: o token continua valendo até expirar, e aí a tela pede login de novo.

Fechar a aba encerra a sessão.

## Decisões que não são óbvias no código

**`@tailwindcss/forms` é obrigatório.** Os inputs usam `rounded-md border-slate-300` sem classe de
largura de borda — no CDN do protótipo o input herda a borda nativa do navegador, mas num build
local o preflight do Tailwind zera `border-width` e os campos ficam invisíveis. O plugin é o que
repõe `border-width: 1px`. Ao mexer no Tailwind, confira que os campos ainda têm borda.

**A chave PEM vai exatamente como colada.** Sem `trim`, sem normalizar quebras de linha. O n8n
assina JWT RS256 com ela e qualquer reformatação quebra a assinatura — com erro que só aparece em
produção.

**O `codigoIntegracao` é da integração, não do lojista.** Um lojista com Tray e Mercos cadastra
duas integrações, com códigos diferentes, sob o mesmo `codigoCliente`. Por isso o formulário pede
os dois.

**O `webhookToken` aparece uma vez só.** Nenhum endpoint devolve esse valor depois do 201; perdido,
só recadastrando a integração.

**A aba de consulta não carrega segredos.** Usa o `GET /integracoes` sem `incluirCredenciais`, então
chave privada e tokens não chegam ao navegador.

**Os formulários ficam montados ao trocar de aba.** Interromper o preenchimento de uma integração
para cadastrar um lojista não pode apagar o que já foi digitado.

**Sem fonte externa.** O protótipo carrega Inter do Google Fonts, o que não funciona em rede
fechada. Aqui a fonte cai para a do sistema. Para usar Inter de verdade, coloque o `.woff2` em
`public/fonts/` e descomente o `@font-face` do `src/index.css`.

## Limitações conhecidas

- A consulta é somente leitura: a API ainda não tem endpoint de edição nem de desativação de
  integração. Hoje desativar é `UPDATE CADINT SET INT_ATIVO_='N'` no banco.
- Nenhuma listagem pagina. Com o volume atual não é problema.
