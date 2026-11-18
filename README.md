# PeladaFácil ⚽

Aplicação responsiva para organizar futebol amador, com Python, Flask e SQLite, sem dependência de serviços externos.

## Executar

Requer Python 3.10 ou superior. Abra o terminal na pasta do projeto:

```bash
python -m venv .venv
```

Ative o ambiente:

- Nobara/Linux/macOS: `source .venv/bin/activate`
- Windows (PowerShell): `.venv\Scripts\Activate.ps1`

Instale as dependências e inicie:

```bash
pip install -r requirements.txt
python app.py
```

Acesse **http://127.0.0.1:5000**.

O arquivo `peladafacil.db` é criado automaticamente. Bancos da versão anterior são migrados sem apagar partidas ou inscrições; cada partida antiga recebe um código permanente. Inscrições antigas permanecem com seus nomes e não são automaticamente associadas a contas.

## Contas e inscrições

1. Clique em **Entrar / Cadastrar** e depois em **Cadastre-se**.
2. Informe nome, e-mail e senha de 8 a 128 caracteres. O cadastro já inicia a sessão.
3. É necessário login para organizar partidas. Quem recebeu o link ou código pode confirmar presença apenas informando o nome, sem cadastro.
4. O formulário de presença também oferece **Já tenho conta. Quero entrar**. Quando conectado, o nome da conta é usado e a inscrição fica vinculada ao usuário.
5. A mesma conta ou nome não pode se inscrever duas vezes na mesma partida. Nomes de convidados são normalizados quanto a espaços e maiúsculas. O limite de vagas é respeitado mesmo com inscrições simultâneas.
6. Use **Sair** para encerrar a sessão.

Senhas são armazenadas como hashes com salt. A sessão usa cookie HttpOnly/SameSite e os formulários enviam token CSRF. A chave de sessão é criada no arquivo local `.session-secret`, ignorado pelo Git. Conserve esse arquivo para manter as sessões após reiniciar. Também é possível definir a variável de ambiente `PELADAFACIL_SECRET_KEY`.

## Convite e formulário por partida

Ao criar uma partida, uma janela mostra:

- **Link do formulário**, como `/partida/AB3D5FGH`, com botão **Copiar link**.
- **Código de acesso** de oito caracteres, que também aparece no cartão da partida.

Use **Compartilhar convite** para abrir essa janela novamente. O destinatário pode abrir o link ou digitar o código no campo **Recebeu um código de partida?**. Códigos são aceitos em letras maiúsculas ou minúsculas.

A página do convite mostra apenas a partida escolhida. Clique em **Confirmar presença**, informe seu nome e envie **Confirmar minha vaga**. Não é necessário criar uma conta. O login é uma opção no próprio formulário e retoma a confirmação após a entrada. No celular, o botão de confirmação fica fixo no rodapé. A consulta das partidas e dos participantes é pública.

O botão de copiar prepara o convite para envio pelo aplicativo de sua preferência; o sistema não envia e-mails ou mensagens automaticamente.

**Alcance do link:** `127.0.0.1` só funciona no computador que executa o servidor. Para testar em celulares/computadores da mesma rede, configure `PELADAFACIL_HOST=0.0.0.0` e acesse o servidor pelo IP da rede (por exemplo, `http://192.168.1.20:5000`). Compartilhe o convite gerado a partir desse endereço. A conectividade depende da rede e do firewall. Para uso fora da rede local é necessário hospedar a aplicação em um servidor acessível pela internet.

Exemplo para rede local no PowerShell:

```powershell
$env:PELADAFACIL_HOST = '0.0.0.0'
python app.py
```

No Nobara/Linux:

```bash
PELADAFACIL_HOST=0.0.0.0 python app.py
```

## Filtros

Na página inicial, combine **Onde você quer jogar?**, **Qual dia?**, **A partir de** e **Até** e clique em **Buscar jogos**. **Limpar** restaura a listagem completa.

Os campos de data abrem um calendário em modal, exibido como painel na parte inferior no celular. Toque no mês/ano para escolher diretamente o mês e use as setas para trocar o ano. Selecione o dia e confirme em **Usar esta data**. O calendário também aceita as setas do teclado. Na criação de partidas, datas anteriores a hoje ficam desabilitadas.

Os campos de horário abrem um modal com seletores de hora/minutos e atalhos de horários frequentes. Os seletores são reutilizados nos filtros e na criação de partidas. Botões e campos foram dimensionados para uso por toque, com respeito à área segura do dispositivo.

O local aceita parte do texto, sem diferenciar maiúsculas ou acentos: `sao jose` encontra `Praça São José`. Os limites de horário são inclusivos. Uma faixa de `22:00` a `02:00` abrange horários antes e depois da meia-noite. Quando há filtro de data, ele continua se referindo à data de início da partida. Horários usam o fuso local do servidor.

## Administrador e exclusão de jogos

No PowerShell, dentro da pasta do projeto, execute uma vez:

```powershell
.\.venv\Scripts\python.exe -m flask --app app criar-admin
```

Informe o e-mail do administrador. Se já existir uma conta com esse e-mail, ela recebe acesso de administrador e mantém a senha atual. Se for uma conta nova, o terminal solicita nome e senha (com confirmação, sem exibir a senha durante a digitação).

Depois, inicie ou reinicie o servidor normalmente, entre no site com essa conta e clique em **Admin** no topo. Se a conta já estiver conectada, recarregue a página para mostrar o botão.

- **Excluir**: remove a partida escolhida e suas inscrições após confirmação no modal.
- **Limpar todos os jogos**: exige digitar `EXCLUIR TODOS` e confirmar. Remove todas as partidas e inscrições existentes no momento da confirmação.
- As contas de usuários, senhas e permissões são preservadas.
- As exclusões são permanentes; os links das partidas removidas deixam de funcionar.

O cadastro público nunca concede privilégios de administrador. Contas antigas também continuam como usuários comuns até serem promovidas pelo comando local. As APIs validam a permissão no banco a cada acesso.

## Dados locais e Git

`peladafacil.db`, os auxiliares SQLite (`*.db-journal`, `*.db-wal`, `*.db-shm`) e `.session-secret` estão no `.gitignore`. Jogos, inscrições, contas, hashes de senha e permissões ficam no banco local e não são enviados em um commit normal. O código das tabelas e das migrações é versionado para que cada instalação crie seu próprio banco.

Arquivos ignorados ainda podem ser adicionados à força com `git add -f`; não faça isso com o banco ou a chave de sessão. A limpeza administrativa serve para gerenciar os jogos locais e não é necessária antes de um commit.

## API

As rotas POST exigem cookie de sessão e cabeçalho `X-CSRF-Token`. Obtenha o token em `GET /api/auth/sessao`; cadastro, login e logout devolvem um novo token.

| Método | Endpoint | Função |
|---|---|---|
| GET | `/api/auth/sessao` | Usuário atual e token CSRF |
| POST | `/api/auth/cadastro` | Cadastrar com nome, e-mail e senha |
| POST | `/api/auth/login` | Entrar com e-mail e senha |
| POST | `/api/auth/logout` | Sair da conta |
| GET | `/api/partidas` | Listar; filtros `local`, `data`, `hora_inicio`, `hora_fim` |
| GET | `/api/partidas/codigo/<codigo>` | Consultar partida pelo código |
| POST | `/api/partidas` | Criar partida (exige login) |
| POST | `/api/partidas/<id>/participar` | Confirmar presença da conta (exige login) |
| POST | `/api/partidas/codigo/<codigo>/participar` | Confirmar pelo convite: `{ "nome": "Nome do jogador" }` sem login; conectado, usa o nome da conta |
| GET | `/api/partidas/<id>/participantes` | Listar nomes dos inscritos |
| GET | `/api/admin/partidas` | Listar todos os jogos (administrador) |
| DELETE | `/api/admin/partidas/<id>` | Excluir uma partida e inscrições (administrador) |
| DELETE | `/api/admin/partidas` | Limpar jogos e inscrições com `{ "confirmacao": "EXCLUIR TODOS" }` (administrador) |

Para integrar com um servidor WSGI, use a fábrica `app:create_app()`.

## Testes

```bash
python -m unittest discover -s tests -v
```

A suíte usa bancos temporários e cobre autenticação, CSRF, senhas, convites, confirmação sem conta, persistência, filtros, validações, inscrições simultâneas, migração, permissões administrativas, criação de administrador e exclusão de jogos com preservação de contas.

## Escopo do protótipo

Não inclui recuperação de senha, confirmação de e-mail, cancelamento de presença ou envio automático de mensagens. O servidor embutido destina-se a desenvolvimento e testes locais. Uma publicação exige configuração de produção com HTTPS, cookie Secure e proteção contra abuso. O modo de depuração só é ativado com `FLASK_DEBUG=1`.
