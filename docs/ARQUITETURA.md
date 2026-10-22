# Arquitetura e plano

## Decisões iniciais

Monorepo npm com dois workspaces: React 19 + TypeScript + Vite + Tailwind 4 e API Express 5 + TypeScript + Prisma 6. PostgreSQL 17 é a fonte de verdade. Sem autenticação terceirizada nem armazenamento simulado no navegador. Mantemos Prisma 6 explicitamente para a configuração estável baseada em schema.prisma; upgrades são uma decisão separada.

API modular: rotas validam contratos Zod, serviços implementam autorização e transações, funções puras calculam placares, classificação e estatísticas. Frontend separa componentes, contexto de autenticação, cliente HTTP e páginas. O proxy /api mantém cookies no mesmo domínio em desenvolvimento. Na implantação, um reverse proxy deve manter essa configuração.

## Etapas

1. Planejamento: arquitetura, entidades e regras descritas aqui.
2. Estrutura: workspaces, configuração de ambiente, API health, banco, migration e seed.
3. MVP: sessões, perfis, CRUD de equipes/jogadores, vínculos, partidas e eventos; interface responsiva.
4. Campeonatos: inscrições, geração de turno único, classificação e artilharia calculadas.
5. Qualidade: testes de domínio e integração com PostgreSQL isolado, build, validação visual e documentação.

## Modelo

- User 1:N Session; User 0:1 Player; User 1:N recursos criados.
- Team N:M User via TeamManager (responsáveis).
- Player N:M Team via Membership com início/fim, número e capitão. Índices parciais garantem apenas uma equipe ativa por jogador, um capitão e um número ativo por equipe.
- Championship N:M Team via ChampionshipTeam, com chave composta única.
- Match aponta mandante, visitante, organizador e opcionalmente campeonato.
- MatchEvent aponta partida, equipe, vínculo do autor e opcionalmente vínculo de quem deu assistência. Os vínculos preservam a equipe histórica mesmo após uma transferência.

Não há colunas de totais ou placares gravadas: gols são eventos e todos os agregados derivam dos mesmos registros. Consultas incluem relações em lote para evitar N+1. A lista usa limites (200 partidas, 100 equipes, 500 jogadores, 100 campeonatos); paginação por cursor pode ser adicionada quando o volume exigir.

## Regras e ambiguidades resolvidas

- Cadastro público sempre PLAYER. ADMIN pode promover usuários. ORGANIZER cria e gerencia seus recursos e equipes nas quais é responsável. ADMIN gerencia tudo. Jogadores consultam dados e editam o próprio perfil.
- A criação de uma partida exige gerir ambas as equipes, ou gerir o campeonato no qual ambas estão inscritas. Só o dono da partida/administrador altera a súmula.
- Novos jogadores são cadastrados por organizadores; vínculo a conta existente é exclusivo de ADMIN, para impedir apropriação de identidades.
- Um jogador tem no máximo um vínculo ativo. Transferir exige encerrar o vínculo e criar outro; não se reescreve a história. Números entre 1 e 99. Capitão pertence ao elenco. Responsáveis são usuários organizadores/admin.
- Estados: SCHEDULED → LIVE → FINISHED; SCHEDULED/LIVE → CANCELLED. Cancelada/finalizada é imutável. Eventos só em LIVE; exclusão de evento incorreto é permitida enquanto LIVE. Canceladas não contam nas estatísticas.
- Eventos GOAL, YELLOW_CARD, RED_CARD e NOTE. Assistência é opcional em GOAL e precisa ser de outro jogador da mesma equipe. Um gol não pode receber duas assistências. Autores devem ter vínculo válido na data/hora de início da partida. Sem gols contra nesta versão.
- Estatísticas individuais incluem apenas partidas finalizadas. Jogos do jogador significam partidas com ao menos um evento dele (gol, assistência ou cartão); não há módulo de escalação/minutos nesta versão, e o rótulo da UI explicita isso. Estatísticas de equipe incluem todas as partidas finalizadas.
- Resultados são registrados na súmula, gol a gol, e a finalização é transacional. Não há edição manual de placares.
- Pontos: 3/1/0. Desempate: pontos, vitórias, saldo, gols pró, nome. Sem confronto direto nesta versão. Apenas partidas FINISHED do campeonato contam.
- Pontos corridos, turno único, calendário circular determinístico, sem confrontos duplicados. Geração exige ao menos duas equipes e calendário vazio. Datas de jogos devem estar no intervalo do campeonato (limite final inclusivo até 23:59:59 UTC).
- Campeonato já iniciado (com jogos) tem inscrições e intervalo de datas bloqueados. Futuro mata-mata será outro serviço de estratégia, preservando as entidades básicas.
- Exclusão com histórico vinculado retorna conflito; remova associações sem histórico antes. Não há exclusão silenciosa de súmulas.
- Fotos e escudos são URLs HTTPS opcionais, sem upload obrigatório e sem dependência externa para uso básico. Escudos e avatares locais são gerados por iniciais. SVG remoto não é inserido no DOM.

## Segurança e concorrência

Senhas usam scrypt com sal aleatório e comparação constante. Sessões opacas aleatórias de 256 bits são armazenadas somente como hash SHA-256, com expiração de sete dias, cookie HttpOnly/SameSite Strict e Secure em produção. Logout revoga a sessão. Alterar permissões invalida sessões existentes. Rate limiting em autenticação, Helmet, CORS restrito e checagem Origin em mutações. Respostas de autenticação não expõem senhas ou hashes.

Transações serializáveis com repetição limitada em conflitos protegem operações compostas. Eventos e transições bloqueiam a linha da partida. Restrições SQL complementam o Prisma: equipes diferentes, intervalos de datas, limites de camisa/minuto, assistente diferente do autor e índices parciais. Regras que dependem de outras tabelas são verificadas dentro das transações nos serviços.
