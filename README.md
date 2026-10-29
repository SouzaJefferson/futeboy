# PeladaFácil ⚽

Protótipo acadêmico de organização de futebol amador, com frontend responsivo, backend Flask e banco SQLite local.

## Executar

Requer Python 3.10 ou superior.

```bash
cd peladafacil
python -m venv .venv
```

Ative o ambiente:

- Linux/macOS: `source .venv/bin/activate`
- Windows (PowerShell): `.venv\Scripts\Activate.ps1`

Instale e execute:

```bash
pip install -r requirements.txt
python app.py
```

Acesse **http://127.0.0.1:5000**.

O arquivo `peladafacil.db` é criado automaticamente ao iniciar e guarda os cadastros. O servidor é destinado somente ao desenvolvimento local.

## Demonstração em aula

1. Clique em **Criar partida** e preencha o título, local, data futura e número de vagas.
2. Confira a partida na lista.
3. Clique em **Quero jogar** e inscreva um jogador.
4. Clique em **Ver participantes** para confirmar o registro.
5. Tente inscrever o mesmo nome novamente (duplicidade bloqueada).
6. Preencha todas as vagas e observe o botão de inscrição desabilitado.

## Arquitetura

`Navegador (HTML/CSS/JS) → API HTTP (Flask) → SQLite (partidas, participacoes)`

Rotas:

| Método | Endpoint | Função |
|---|---|---|
| GET | `/api/partidas` | Listar partidas com vagas |
| POST | `/api/partidas` | Criar partida |
| POST | `/api/partidas/<id>/participar` | Confirmar jogador |
| GET | `/api/partidas/<id>/participantes` | Ver inscritos |

## Limitações acadêmicas

- Não há login/autenticação; duplicidade é verificada por nome normalizado dentro da partida (não verifica identidade real).
- Horários são interpretados no fuso local do computador servidor.
- Não há cancelamento de presença, exclusão de partidas ou mapa.
- Não publique este app na internet sem adicionar autenticação, proteção contra abuso, configuração de produção e revisão de privacidade.
