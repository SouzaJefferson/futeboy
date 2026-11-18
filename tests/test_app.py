from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import datetime, timedelta
from pathlib import Path
import sqlite3
from tempfile import TemporaryDirectory
import unittest

from app import create_app


class AppTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.db_path = str(Path(self.temp.name) / 'test.db')
        self.config = {'TESTING': True, 'DATABASE': self.db_path, 'SECRET_KEY': 'test-only-key'}
        self.app = create_app(self.config)
        self.client = self.app.test_client()
        self.day = (datetime.now() + timedelta(days=2)).strftime('%Y-%m-%d')

    def tearDown(self):
        self.temp.cleanup()

    def post(self, client, path, body=None):
        token = client.get('/api/auth/sessao').json['csrf_token']
        return client.post(path, json=body or {}, headers={'X-CSRF-Token': token})

    def register(self, client=None, name='Ana Silva', email='ana@example.com'):
        return self.post(client or self.client, '/api/auth/cadastro',
                         {'nome': name, 'email': email, 'senha': 'senha-teste-123'})

    def match(self, client=None, **changes):
        data = dict(titulo='Pelada de sábado', local='Praça São José',
                    data_hora=f'{self.day}T19:00', limite=2)
        data.update(changes)
        return self.post(client or self.client, '/api/partidas', data)

    def delete(self, client, path, body=None):
        token = client.get('/api/auth/sessao').json['csrf_token']
        return client.delete(path, json=body or {}, headers={'X-CSRF-Token': token})

    def promote(self, email='ana@example.com'):
        result = self.app.test_cli_runner().invoke(args=['criar-admin', '--email', email])
        self.assertEqual(result.exit_code, 0, result.output)

    def test_admin_permissions_and_no_public_promotion(self):
        self.assertEqual(self.client.get('/api/admin/partidas').status_code, 401)
        self.assertEqual(self.delete(self.client, '/api/admin/partidas').status_code, 401)
        result = self.post(self.client, '/api/auth/cadastro', {'nome':'Ana Silva', 'email':'ana@example.com',
            'senha':'senha-teste-123', 'is_admin':True})
        self.assertEqual(result.json['usuario']['is_admin'], 0)
        match = self.match().json
        self.assertEqual(self.client.get('/api/admin/partidas').status_code, 403)
        self.assertEqual(self.delete(self.client, f"/api/admin/partidas/{match['id']}").status_code, 403)
        self.assertEqual(self.delete(self.client, '/api/admin/partidas', {'confirmacao':'EXCLUIR TODOS'}).status_code, 403)
        self.promote()
        self.assertEqual(self.client.get('/api/auth/sessao').json['usuario']['is_admin'], 1)
        self.assertEqual(self.client.get('/api/admin/partidas').status_code, 200)
        self.assertEqual(self.client.delete('/api/admin/partidas', json={'confirmacao':'EXCLUIR TODOS'}).status_code, 403)
        with closing(sqlite3.connect(self.db_path)) as db, db:
            db.execute('UPDATE usuarios SET is_admin=0')
        self.assertEqual(self.client.get('/api/admin/partidas').status_code, 403)
        self.assertEqual(len(self.client.get('/api/partidas').json), 1)

    def test_admin_deletes_one_game_and_its_registrations(self):
        self.register()
        self.promote()
        first, second = self.match().json, self.match().json
        self.post(self.client, f"/api/partidas/{first['id']}/participar")
        self.post(self.app.test_client(), f"/api/partidas/codigo/{first['codigo']}/participar", {'nome':'Convidado'})
        self.post(self.client, f"/api/partidas/{second['id']}/participar")
        result = self.delete(self.client, f"/api/admin/partidas/{first['id']}")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(self.client.get(first['url']).status_code, 404)
        self.assertEqual(self.client.get(f"/api/partidas/codigo/{first['codigo']}").status_code, 404)
        self.assertEqual(self.client.get(f"/api/partidas/{second['id']}/participantes").json, ['Ana Silva'])
        self.assertEqual(self.delete(self.client, f"/api/admin/partidas/{first['id']}").status_code, 404)
        with closing(sqlite3.connect(self.db_path)) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM participacoes').fetchone()[0], 1)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM usuarios').fetchone()[0], 1)

    def test_admin_bulk_delete_requires_confirmation_and_keeps_accounts(self):
        self.register()
        self.promote()
        other = self.app.test_client()
        self.register(other, 'Bruno Silva', 'bruno@example.com')
        for _ in range(2):
            match = self.match().json
            self.post(other, f"/api/partidas/{match['id']}/participar")
        for data in ({}, {'confirmacao':'sim'}):
            self.assertEqual(self.delete(self.client, '/api/admin/partidas', data).status_code, 400)
            self.assertEqual(len(self.client.get('/api/partidas').json), 2)
        result = self.delete(self.client, '/api/admin/partidas', {'confirmacao':'EXCLUIR TODOS'})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json['excluidas'], 2)
        self.assertEqual(self.client.get('/api/admin/partidas').json, [])
        with closing(sqlite3.connect(self.db_path)) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM participacoes').fetchone()[0], 0)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM usuarios').fetchone()[0], 2)
        self.assertEqual(self.client.get('/api/auth/sessao').json['usuario']['is_admin'], 1)
        self.assertEqual(self.match().status_code, 201)

    def test_cli_creates_admin_and_preserves_existing_password(self):
        runner = self.app.test_cli_runner()
        result = runner.invoke(args=['criar-admin'], input='admin@example.com\nAdministrador Local\nUma-senha-123\nUma-senha-123\n')
        self.assertEqual(result.exit_code, 0, result.output)
        login = self.post(self.client, '/api/auth/login', {'email':'admin@example.com', 'senha':'Uma-senha-123'})
        self.assertEqual(login.status_code, 200)
        self.assertEqual(login.json['usuario']['is_admin'], 1)
        self.register(email='ana@example.com')
        self.promote()
        login = self.post(self.client, '/api/auth/login', {'email':'ana@example.com', 'senha':'senha-teste-123'})
        self.assertEqual(login.status_code, 200)
        self.assertEqual(login.json['usuario']['is_admin'], 1)

    def test_migrate_existing_accounts_without_granting_admin(self):
        old_path = str(Path(self.temp.name) / 'old_users.db')
        with closing(sqlite3.connect(old_path)) as db, db:
            db.executescript("CREATE TABLE usuarios(id INTEGER PRIMARY KEY, nome TEXT NOT NULL, email TEXT NOT NULL UNIQUE, senha_hash TEXT NOT NULL); INSERT INTO usuarios VALUES(1,'Conta antiga','antiga@example.com','hash-antigo');")
        app = create_app({**self.config, 'DATABASE':old_path})
        with closing(sqlite3.connect(old_path)) as db:
            self.assertEqual(db.execute('SELECT is_admin FROM usuarios').fetchone()[0], 0)
        result = app.test_cli_runner().invoke(args=['criar-admin', '--email', 'antiga@example.com'])
        self.assertEqual(result.exit_code, 0, result.output)
        with closing(sqlite3.connect(old_path)) as db:
            self.assertEqual(db.execute('SELECT senha_hash,is_admin FROM usuarios').fetchone(), ('hash-antigo',1))

    def test_authentication_and_csrf(self):
        self.assertEqual(self.client.post('/api/auth/cadastro', json={}).status_code, 403)
        self.assertEqual(self.match().status_code, 401)
        self.assertEqual(self.post(self.client, '/api/partidas/1/participar').status_code, 401)
        self.assertEqual(self.register().status_code, 201)
        self.assertEqual(self.client.get('/api/auth/sessao').json['usuario']['nome'], 'Ana Silva')
        self.assertEqual(self.register(email='ANA@EXAMPLE.COM').status_code, 409)
        with closing(sqlite3.connect(self.db_path)) as db, db:
            password = db.execute('SELECT senha_hash FROM usuarios').fetchone()[0]
            self.assertNotIn('senha-teste-123', password)
        self.assertEqual(self.post(self.client, '/api/auth/logout').status_code, 200)
        self.assertIsNone(self.client.get('/api/auth/sessao').json['usuario'])
        self.assertEqual(self.post(self.client, '/api/auth/login', {'email': 'ana@example.com', 'senha': 'errada'}).status_code, 401)
        self.assertEqual(self.post(self.client, '/api/auth/login', {'email': 'ANA@example.com', 'senha': 'senha-teste-123'}).status_code, 200)
        self.assertEqual(self.match().status_code, 201)

    def test_invite_code_form_and_persistence(self):
        self.register()
        created = self.match()
        self.assertEqual(created.status_code, 201)
        match = created.json
        code = match['codigo']
        self.assertEqual(len(code), 8)
        self.assertEqual(self.client.get(match['url']).status_code, 200)
        self.assertIn(b'join-form', self.client.get(match['url']).data)
        public = self.app.test_client()
        result = public.get(f'/api/partidas/codigo/{code.lower()}')
        self.assertEqual(result.json['id'], match['id'])
        self.assertEqual(public.get('/partida/INVALIDO').status_code, 404)
        self.assertEqual(public.get('/api/partidas/codigo/INVALIDO').status_code, 404)
        endpoint = f"/api/partidas/{match['id']}/participar"
        self.assertEqual(self.post(self.client, endpoint, {'nome': 'Nome falsificado'}).status_code, 201)
        self.assertEqual(self.post(self.client, endpoint).status_code, 409)
        self.assertEqual(public.get(f"/api/partidas/{match['id']}/participantes").json, ['Ana Silva'])
        reopened = create_app(self.config).test_client()
        self.assertEqual(reopened.get(f'/api/partidas/codigo/{code}').json['participantes'], 1)
        self.assertEqual(reopened.get('/api/partidas').json[0]['codigo'], code)

    def test_filters(self):
        self.register()
        self.match()
        self.match(local='Arena Centro', data_hora=f'{self.day}T09:00')
        self.match(local='Campo Norte', data_hora=f'{self.day}T23:30')
        self.match(local='Campo Norte', data_hora=f'{self.day}T01:00')
        def count(**filters):
            response = self.client.get('/api/partidas', query_string=filters)
            self.assertEqual(response.status_code, 200)
            return len(response.json)
        self.assertEqual(count(local='sao jose'), 1)
        self.assertEqual(count(local='CENTRO', data=self.day, hora_inicio='08:00', hora_fim='10:00'), 1)
        self.assertEqual(count(hora_inicio='19:00', hora_fim='19:00'), 1)
        self.assertEqual(count(hora_inicio='22:00', hora_fim='02:00'), 2)
        self.assertEqual(count(local='inexistente'), 0)
        self.assertEqual(count(data='2000-01-01'), 0)
        self.assertEqual(self.client.get('/api/partidas?hora_inicio=25:00').status_code, 400)
        self.assertEqual(self.client.get('/api/partidas?data=errada').status_code, 400)

    def test_guest_can_confirm_by_link_without_account(self):
        self.register()
        match = self.match().json
        endpoint = f"/api/partidas/codigo/{match['codigo'].lower()}/participar"
        guest = self.app.test_client()
        self.assertEqual(guest.post(endpoint, json={'nome': 'Pedro'}).status_code, 403)
        for name in ['', 'A', ' ' * 4, 'a' * 81, 123]:
            self.assertEqual(self.post(guest, endpoint, {'nome': name}).status_code, 400)
        self.assertEqual(self.post(guest, endpoint, {'nome': '  Pedro   Lima  '}).status_code, 201)
        self.assertIsNone(guest.get('/api/auth/sessao').json['usuario'])
        self.assertEqual(self.post(guest, endpoint, {'nome': 'PEDRO LIMA'}).status_code, 409)
        self.assertEqual(self.post(self.app.test_client(), endpoint, {'nome': 'Lucas'}).status_code, 201)
        self.assertEqual(self.post(self.app.test_client(), endpoint, {'nome': 'Maria'}).status_code, 409)
        self.assertEqual(guest.get(f"/api/partidas/{match['id']}/participantes").json, ['Pedro Lima', 'Lucas'])
        self.assertEqual(self.post(guest, '/api/partidas/codigo/INVALIDO/participar', {'nome': 'Pedro'}).status_code, 404)
        with closing(sqlite3.connect(self.db_path)) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM usuarios').fetchone()[0], 1)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM participacoes WHERE usuario_id IS NULL').fetchone()[0], 2)
        another = self.match().json
        self.assertEqual(self.post(self.client, f"/api/partidas/codigo/{another['codigo']}/participar", {'nome': 'Outro nome'}).status_code, 201)
        self.assertEqual(guest.get(f"/api/partidas/{another['id']}/participantes").json, ['Ana Silva'])
        self.assertEqual(self.post(guest, f"/api/partidas/codigo/{another['codigo']}/participar", {'nome': 'ANA SILVA'}).status_code, 409)
        with closing(sqlite3.connect(self.db_path)) as db, db:
            db.execute("UPDATE partidas SET data_hora='2000-01-01T10:00' WHERE id=?", (another['id'],))
        self.assertEqual(self.post(guest, f"/api/partidas/codigo/{another['codigo']}/participar", {'nome': 'Joana'}).status_code, 409)

    def test_guests_compete_for_last_slot(self):
        self.register()
        match = self.match().json
        endpoint = f"/api/partidas/codigo/{match['codigo']}/participar"
        self.post(self.client, endpoint)
        clients = [self.app.test_client() for _ in range(3)]
        with ThreadPoolExecutor(max_workers=3) as pool:
            statuses = list(pool.map(lambda item: self.post(item[1], endpoint, {'nome': f'Convidado {item[0]}'}).status_code, enumerate(clients)))
        self.assertEqual(sorted(statuses), [201, 409, 409])

    def test_capacity_concurrent_and_same_name(self):
        self.register()
        match = self.match().json
        endpoint = f"/api/partidas/{match['id']}/participar"
        self.post(self.client, endpoint)
        clients = [self.app.test_client() for _ in range(3)]
        for i, client in enumerate(clients):
            self.register(client, f'Jogador {i}', f'j{i}@example.com')
        with ThreadPoolExecutor(max_workers=3) as pool:
            statuses = list(pool.map(lambda c: self.post(c, endpoint).status_code, clients))
        self.assertEqual(sorted(statuses), [201, 409, 409])
        result = self.client.get(f"/api/partidas/codigo/{match['codigo']}").json
        self.assertEqual(result['participantes'], 2)
        self.assertEqual(result['vagas_restantes'], 0)
        another = self.match().json
        url = f"/api/partidas/{another['id']}/participar"
        self.post(self.client, url)
        same_name = self.app.test_client()
        self.register(same_name, 'Ana Silva', 'outra@example.com')
        self.assertEqual(self.post(same_name, url).status_code, 409)

    def test_input_validation_and_closed_match(self):
        self.assertEqual(self.post(self.client, '/api/auth/cadastro', {'nome':'Ana','email':'x','senha':'123'}).status_code, 400)
        self.assertEqual(self.post(self.client, '/api/auth/cadastro', {'nome':'Ana','email':'a@b.com','senha':'123'}).status_code, 400)
        self.register()
        for changes in [{'limite': 1}, {'limite': 2.5}, {'limite': True}, {'data_hora': f'{self.day}T19:00+03:00'}, {'titulo': 'a'}, {'data_hora': '2000-01-01T10:00'}]:
            self.assertEqual(self.match(**changes).status_code, 400, changes)
        token = self.client.get('/api/auth/sessao').json['csrf_token']
        self.assertEqual(self.client.post('/api/partidas', json=['invalid'], headers={'X-CSRF-Token':token}).status_code, 400)
        match = self.match().json
        with closing(sqlite3.connect(self.db_path)) as db, db:
            db.execute("UPDATE partidas SET data_hora='2000-01-01T10:00' WHERE id=?", (match['id'],))
        self.assertEqual(self.post(self.client, f"/api/partidas/{match['id']}/participar").status_code, 409)
        self.assertEqual(self.post(self.client, '/api/partidas/999/participar').status_code, 404)

    def test_migration_preserves_old_data(self):
        old_path = str(Path(self.temp.name) / 'legacy.db')
        with closing(sqlite3.connect(old_path)) as db, db:
            db.executescript('''
                CREATE TABLE partidas (id INTEGER PRIMARY KEY, titulo TEXT NOT NULL, local TEXT NOT NULL,
                    data_hora TEXT NOT NULL, limite INTEGER NOT NULL, criada_em TEXT DEFAULT CURRENT_TIMESTAMP);
                CREATE TABLE participacoes (id INTEGER PRIMARY KEY, partida_id INTEGER REFERENCES partidas(id),
                    nome_jogador TEXT NOT NULL, nome_normalizado TEXT NOT NULL,
                    criada_em TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(partida_id,nome_normalizado));
                INSERT INTO partidas(id,titulo,local,data_hora,limite) VALUES (1,'Jogo antigo','Quadra','2099-12-01T19:00',10);
                INSERT INTO participacoes(id,partida_id,nome_jogador,nome_normalizado) VALUES (1,1,'João','joão');
            ''')
        config = {**self.config, 'DATABASE': old_path}
        app = create_app(config)
        old = app.test_client().get('/api/partidas').json[0]
        self.assertTrue(old['codigo'])
        self.assertEqual(old['participantes'], 1)
        self.assertEqual(app.test_client().get('/api/partidas/1/participantes').json, ['João'])
        self.assertEqual(create_app(config).test_client().get('/api/partidas').json[0]['codigo'], old['codigo'])


if __name__ == '__main__':
    unittest.main()
