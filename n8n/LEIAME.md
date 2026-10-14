# Workflows do n8n da importação

`Portal_WF_Importar.json` é o workflow que recebe do portal (`POST /wf-importar`) a importação de pastas e
workflows e escreve na instância. Os outros workflows do portal (`Portal_Acesso`, `Portal_WF_Exportar`) ficam
no n8n de produção; este arquivo existe aqui para ser revisado e instalado junto com a aba **Importar**.

## O que ele faz (e o que nunca faz)

- Só aceita usuário **ADMIN** do Monint (o token vai a `/usuarios/me`, como no `Portal_WF_Exportar`). Dá para
  limitar a e-mails específicos em `EMAILS_PERMITIDOS`, no node **Checar Permissao**.
- Só escreve nas instâncias listadas em `INSTANCIAS` (mesmo node). Hoje: **Produção**, **Automaker 1**
  e **Automaker Dev Geral** (as mesmas do `Portal_WF_Exportar`, com os mesmos ids; a AutomakerDev CR não importa). A
  credencial de **escrita** de cada instância fica só nos 3 nodes HTTP dela e **nunca chega ao navegador**.
  Instância cujo `projetoId` ainda está como `TROCAR_PELO_ID_DO_PROJETO` fica escondida e não recebe nada.
- **Só cria**: pastas, workflows (inativos) e, para ligar as chamadas entre eles, atualiza os workflows que
  acabou de criar. Não sobrescreve nem apaga nada que já existia.
- Valida cada pedido antes de tocar na API: 1 a 25 itens, nomes de 1 a 128 caracteres, IDs só com letras,
  números, `_` e `-`, no máximo 8 MB por workflow, e **só propriedades permitidas** no workflow (o navegador
  nunca escolhe o projeto nem a pasta de dentro do JSON: o projeto vem da configuração e a pasta do item).
- Cada importação fica registrada em `portal_wf_log` (e-mail, instância, quantidade e nomes criados).

## Instalação (uma vez)

1. **Em cada instância de destino**, em *Settings → n8n API*, a chave precisa permitir **escrita** (do usuário
   dono do projeto Personal que vai receber os workflows). Escopos: `workflow:create`, `workflow:update`,
   `folder:create` e os de leitura (`workflow:read`, `folder:read`). Confira os nomes na tela de criação.
   Se a chave já é usada pelo `Portal_WF_Exportar`, basta acrescentar os escopos e manter a mesma credencial
   n8n API no n8n de produção (`prod`, `automaker 1`, `dev geral`): o arquivo usa esses mesmos nomes.
2. **Importe** `Portal_WF_Importar.json` (Import from file). Em cada nó `Criar Pasta`, `Criar Workflow` e
   `Atualizar Workflow` confira a credencial: o arquivo do repositório traz um ID provisório
   (`TROCAR_APOS_IMPORTAR`) e é preciso escolher a credencial de cada instância.
3. Em **Checar Permissao**, preencha o `projetoId` de cada instância (ID do projeto Personal da chave: na URL do
   n8n, `/projects/<ID>/workflows`). Só a Dev Geral vem preenchida; as demais ficam escondidas até isso.
4. Se quiser, limite quem importa em `EMAILS_PERMITIDOS` (no mesmo node). Como agora há escrita em **Produção**,
   vale restringir a poucos e-mails.
5. **Publique** o workflow. O caminho do webhook é `portal-wf-importar` (POST).
6. No **Portal_Acesso**, no node *Montar Resposta*, acrescente o recurso para quem é ADMIN:

   ```js
   const recursos = admin ? ['workflows', 'workflows-importar'] : [];
   ```

7. Publique o portal com o `nginx.conf` novo (o `location = /wf-importar` aceita corpo de até 20 MB).

Enquanto o passo 6 não for feito, a aba **Importar** não aparece para ninguém (o portal só mostra se o
recurso vier no `/acesso`).

## Liberar outra instância

1. Em **Checar Permissao**, acrescente uma linha em `INSTANCIAS` (nome, `baseUrl` e `projetoId`).
2. Crie a credencial de escrita dela e **clone** os 3 nodes HTTP (`Criar Pasta`, `Criar Workflow`,
   `Atualizar Workflow`), trocando o nome e a credencial.
3. Nos 3 nodes `Qual Instancia?` (pastas, workflows, atualizar), acrescente uma saída com o identificador da
   instância e ligue-a ao node clonado.

Faça isso com cuidado para **produção**: a importação cria workflows de verdade lá. Se um dia for liberada,
prefira `EMAILS_PERMITIDOS` com poucas pessoas.

## Contrato (o que o portal envia)

`POST /wf-importar`, JSON, `Authorization: Bearer <JWT do Monint>`:

| `acao` | `itens` | Resposta |
|---|---|---|
| `instancias` | (não usa) | `{ instancias: [{ id, nome }] }` |
| `criar-pastas` | `[{ chave, nome, paiId \| null }]` | `{ resultados: [{ chave, id }]` ou `{ chave, erro }` por item `}` |
| `criar-workflows` | `[{ chave, pastaId \| null, workflow }]` | idem |
| `atualizar-workflows` | `[{ chave, id, workflow }]` | idem |

`workflow` tem só `name`, `nodes`, `connections`, `settings` e, se houver, `pinData`, `staticData`,
`description`, `nodeGroups`. A API pública do n8n recusa qualquer outra propriedade, então o portal limpa o
JSON antes de enviar. Erros do pedido inteiro voltam como `{ error }` (400, 401 ou 403).

## Se algo falhar

- **A aba Importar não aparece:** falta o recurso `workflows-importar` no Portal_Acesso (passo 6).
- **"A importação não está liberada para o seu usuário…":** o webhook `portal-wf-importar` não está
  publicado, o usuário não é ADMIN ou o e-mail não está em `EMAILS_PERMITIDOS`.
- **Um workflow volta com `HTTP 400 - request.body… additional property`:** a API do n8n recusou uma propriedade;
  a mensagem diz qual. Avise para ajustar a limpeza em `src/importacao/workflow.ts`.
- **`HTTP 403` / `Forbidden` ao criar:** a chave não tem o escopo ou o usuário dela não escreve naquele projeto.
- **A tela mostra "A API respondeu 500" (ou "O n8n respondeu com erro (500)") ao abrir a aba:** o n8n de produção
  responde 500 a um POST com o cabeçalho `Origin` quando o webhook não está registrado para o método (sem o
  `Origin`, ele responde 404). O navegador manda `Origin` em todo POST, e o resto do portal só usa GET, por isso
  nunca apareceu. O nginx e o proxy do Vite **não repassam o `Origin`** nesta rota; se ainda assim aparecer,
  confira se o `nginx.conf` novo foi publicado e se o workflow `Portal_WF_Importar` está **publicado**.
- **`HTTP 413` do portal:** um único workflow passou de 20 MB (limite do nginx) ou o nginx não foi atualizado.
