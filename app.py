from contextlib import contextmanager
from datetime import datetime, timedelta
from functools import wraps
from pathlib import Path
import os
import re
import secrets
import sqlite3
import unicodedata
import click

from flask import Flask, current_app, jsonify, render_template, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

ROOT = Path(__file__).resolve().parent


@contextmanager
def connect():
    db = sqlite3.connect(current_app.config['DATABASE'], timeout=10)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys = ON')
    try:
        with db:
            yield db
    finally:
        db.close()


def normalized(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', value.casefold())
                   if not unicodedata.combining(c))


def new_code(db):
    while True:
        code = ''.join(secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(8))
        if not db.execute('SELECT 1 FROM partidas WHERE codigo=?', (code,)).fetchone():
            return code


def init_db():
    with connect() as db:
        db.executescript('''
            CREATE TABLE IF NOT EXISTS usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                senha_hash TEXT NOT NULL,
                is_admin INTEGER NOT NULL DEFAULT 0 CHECK(is_admin IN (0, 1))
            );
            CREATE TABLE IF NOT EXISTS partidas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                titulo TEXT NOT NULL,
                local TEXT NOT NULL,
                data_hora TEXT NOT NULL,
                limite INTEGER NOT NULL CHECK(limite BETWEEN 2 AND 100),
                criada_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                codigo TEXT,
                organizador_id INTEGER REFERENCES usuarios(id)
            );
            CREATE TABLE IF NOT EXISTS participacoes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                partida_id INTEGER NOT NULL REFERENCES partidas(id) ON DELETE CASCADE,
                nome_jogador TEXT NOT NULL,
                nome_normalizado TEXT NOT NULL,
                criada_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                usuario_id INTEGER REFERENCES usuarios(id),
                UNIQUE(partida_id, nome_normalizado)
            );
        ''')
        # Migração aditiva: preserva partidas e inscrições da versão anterior.
        columns = {r['name'] for r in db.execute('PRAGMA table_info(usuarios)')}
        if 'is_admin' not in columns:
            db.execute('ALTER TABLE usuarios ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0 CHECK(is_admin IN (0, 1))')
        columns = {r['name'] for r in db.execute('PRAGMA table_info(partidas)')}
        if 'codigo' not in columns:
            db.execute('ALTER TABLE partidas ADD COLUMN codigo TEXT')
        if 'organizador_id' not in columns:
            db.execute('ALTER TABLE partidas ADD COLUMN organizador_id INTEGER REFERENCES usuarios(id)')
        columns = {r['name'] for r in db.execute('PRAGMA table_info(participacoes)')}
        if 'usuario_id' not in columns:
            db.execute('ALTER TABLE participacoes ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id)')
        for row in db.execute('SELECT id FROM partidas WHERE codigo IS NULL').fetchall():
            db.execute('UPDATE partidas SET codigo=? WHERE id=?', (new_code(db), row['id']))
        db.execute('CREATE UNIQUE INDEX IF NOT EXISTS partida_codigo ON partidas(codigo)')
        db.execute('CREATE UNIQUE INDEX IF NOT EXISTS participacao_usuario ON participacoes(partida_id, usuario_id)')


def user():
    if not session.get('usuario_id'):
        return None
    with connect() as db:
        row = db.execute('SELECT id, nome, email, is_admin FROM usuarios WHERE id=?',
                         (session['usuario_id'],)).fetchone()
    return dict(row) if row else None


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not user():
            return jsonify(erro='Entre na sua conta para continuar.'), 401
        return view(*args, **kwargs)
    return wrapped


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        account = user()
        if not account:
            return jsonify(erro='Entre na sua conta para continuar.'), 401
        if not account['is_admin']:
            return jsonify(erro='Acesso exclusivo para administradores.'), 403
        return view(*args, **kwargs)
    return wrapped


def json_body():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def text(data, key):
    value = data.get(key, '')
    return value.strip() if isinstance(value, str) else ''


MATCH_QUERY = '''
    SELECT p.id, p.titulo, p.local, p.data_hora, p.limite, p.codigo,
           COUNT(a.id) AS participantes
    FROM partidas p LEFT JOIN participacoes a ON a.partida_id = p.id
'''


def serialize_partida(row):
    item = dict(row)
    item['vagas_restantes'] = max(0, item['limite'] - item['participantes'])
    item['url'] = url_for('partida_page', codigo=item['codigo'])
    return item


def create_app(config=None):
    app = Flask(__name__)
    app.config.update(DATABASE=str(ROOT / 'peladafacil.db'),
                      SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE='Lax',
                      PERMANENT_SESSION_LIFETIME=timedelta(days=7), MAX_CONTENT_LENGTH=16384)
    if config:
        app.config.update(config)
    if not app.config.get('SECRET_KEY'):
        secret = os.environ.get('PELADAFACIL_SECRET_KEY')
        if not secret:
            secret_file = ROOT / '.session-secret'
            try:
                with secret_file.open('x', encoding='utf-8') as file:
                    file.write(secrets.token_hex(32))
            except FileExistsError:
                pass
            secret = secret_file.read_text(encoding='utf-8').strip()
        app.config['SECRET_KEY'] = secret

    @app.before_request
    def csrf_protection():
        if request.method in {'POST', 'PUT', 'PATCH', 'DELETE'}:
            expected = session.get('csrf_token')
            provided = request.headers.get('X-CSRF-Token', '')
            if not expected or not secrets.compare_digest(expected.encode(), provided.encode()):
                return jsonify(erro='Sessão expirada. Recarregue a página e tente novamente.'), 403

    @app.get('/')
    def home():
        return render_template('index.html', codigo=None)

    @app.get('/partida/<codigo>')
    def partida_page(codigo):
        codigo = codigo.strip().upper()
        with connect() as db:
            found = db.execute('SELECT 1 FROM partidas WHERE codigo=?', (codigo,)).fetchone()
        return render_template('index.html', codigo=codigo), 200 if found else 404

    @app.get('/api/auth/sessao')
    def auth_session():
        if 'csrf_token' not in session:
            session['csrf_token'] = secrets.token_hex(32)
        return jsonify(usuario=user(), csrf_token=session['csrf_token'])

    def sign_in(account):
        session.clear()
        session.permanent = True
        session['usuario_id'] = account['id']
        session['csrf_token'] = secrets.token_hex(32)
        return jsonify(usuario={k: account[k] for k in ('id', 'nome', 'email', 'is_admin')},
                       csrf_token=session['csrf_token'])

    @app.post('/api/auth/cadastro')
    def register():
        data = json_body()
        nome = ' '.join(text(data, 'nome').split())
        email = text(data, 'email').casefold()
        senha = data.get('senha', '')
        if not 2 <= len(nome) <= 80:
            return jsonify(erro='Informe um nome de 2 a 80 caracteres.'), 400
        if len(email) > 254 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
            return jsonify(erro='Informe um e-mail válido.'), 400
        if not isinstance(senha, str) or not 8 <= len(senha) <= 128:
            return jsonify(erro='A senha deve ter de 8 a 128 caracteres.'), 400
        with connect() as db:
            try:
                cur = db.execute('INSERT INTO usuarios(nome,email,senha_hash) VALUES (?,?,?)',
                                 (nome, email, generate_password_hash(senha)))
            except sqlite3.IntegrityError:
                return jsonify(erro='Este e-mail já está cadastrado.'), 409
            account = dict(id=cur.lastrowid, nome=nome, email=email, is_admin=0)
        return sign_in(account), 201

    @app.post('/api/auth/login')
    def login():
        data = json_body()
        email, senha = text(data, 'email').casefold(), data.get('senha', '')
        if not isinstance(senha, str) or len(senha) > 128:
            return jsonify(erro='E-mail ou senha incorretos.'), 401
        with connect() as db:
            account = db.execute('SELECT * FROM usuarios WHERE email=?', (email,)).fetchone()
        if not account or not check_password_hash(account['senha_hash'], senha):
            return jsonify(erro='E-mail ou senha incorretos.'), 401
        return sign_in(account)

    @app.post('/api/auth/logout')
    def logout():
        session.clear()
        session['csrf_token'] = secrets.token_hex(32)
        return jsonify(mensagem='Você saiu da conta.', csrf_token=session['csrf_token'])

    @app.get('/api/partidas')
    def listar_partidas():
        local = request.args.get('local', '').strip()
        date = request.args.get('data', '').strip()
        start, end = request.args.get('hora_inicio', ''), request.args.get('hora_fim', '')
        try:
            if date:
                datetime.strptime(date, '%Y-%m-%d')
            for hour in (start, end):
                if hour and not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d', hour):
                    raise ValueError
        except ValueError:
            return jsonify(erro='Informe uma data e horários válidos.'), 400
        with connect() as db:
            rows = db.execute(MATCH_QUERY + ' GROUP BY p.id ORDER BY p.data_hora, p.id DESC').fetchall()
        result = []
        for row in rows:
            day, hour = row['data_hora'][:10], row['data_hora'][11:16]
            if local and normalized(local) not in normalized(row['local']):
                continue
            if date and day != date:
                continue
            if start and end and start > end:
                if not (hour >= start or hour <= end):
                    continue
            elif (start and hour < start) or (end and hour > end):
                continue
            result.append(serialize_partida(row))
        return jsonify(result)

    @app.get('/api/partidas/codigo/<codigo>')
    def buscar_partida(codigo):
        with connect() as db:
            row = db.execute(MATCH_QUERY + ' WHERE p.codigo=? GROUP BY p.id',
                             (codigo.strip().upper(),)).fetchone()
        if not row:
            return jsonify(erro='Partida não encontrada. Confira o código informado.'), 404
        return jsonify(serialize_partida(row))

    @app.post('/api/partidas')
    @login_required
    def criar_partida():
        data = json_body()
        titulo, local = text(data, 'titulo'), text(data, 'local')
        try:
            raw_limit = data.get('limite')
            if isinstance(raw_limit, bool) or not re.fullmatch(r'\d+', str(raw_limit)):
                raise ValueError
            limite = int(raw_limit)
            horario = datetime.fromisoformat(text(data, 'data_hora'))
            if horario.tzinfo is not None:
                raise ValueError
        except (TypeError, ValueError):
            return jsonify(erro='Informe uma data/hora local e um limite inteiro válidos.'), 400
        if not (3 <= len(titulo) <= 90 and 3 <= len(local) <= 120):
            return jsonify(erro='Nome da partida: 3 a 90 caracteres. Local: 3 a 120 caracteres.'), 400
        if not 2 <= limite <= 100:
            return jsonify(erro='O limite deve ser entre 2 e 100 jogadores.'), 400
        horario = horario.replace(second=0, microsecond=0)
        if horario <= datetime.now():
            return jsonify(erro='A partida precisa estar no futuro.'), 400
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            codigo = new_code(db)
            cur = db.execute('''INSERT INTO partidas(titulo,local,data_hora,limite,codigo,organizador_id)
                                VALUES (?,?,?,?,?,?)''',
                             (titulo, local, horario.isoformat(timespec='minutes'), limite,
                              codigo, session['usuario_id']))
            partida_id = cur.lastrowid
        return jsonify(id=partida_id, codigo=codigo,
                       url=url_for('partida_page', codigo=codigo), mensagem='Partida criada!'), 201

    @app.post('/api/partidas/<int:partida_id>/participar')
    @login_required
    def participar(partida_id):
        return confirmar_presenca(partida_id=partida_id)

    @app.post('/api/partidas/codigo/<codigo>/participar')
    def participar_por_convite(codigo):
        return confirmar_presenca(codigo=codigo.strip().upper())

    def confirmar_presenca(partida_id=None, codigo=None):
        account = user()
        nome = account['nome'] if account else ' '.join(text(json_body(), 'nome').split())
        if not 2 <= len(nome) <= 80:
            return jsonify(erro='Informe seu nome com 2 a 80 caracteres.'), 400
        usuario_id = account['id'] if account else None
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if codigo:
                partida = db.execute('SELECT * FROM partidas WHERE codigo=?', (codigo,)).fetchone()
            else:
                partida = db.execute('SELECT * FROM partidas WHERE id=?', (partida_id,)).fetchone()
            if partida is None:
                return jsonify(erro='Partida não encontrada.'), 404
            partida_id = partida['id']
            if datetime.fromisoformat(partida['data_hora']) <= datetime.now():
                return jsonify(erro='Esta partida já começou.'), 409
            if db.execute('SELECT 1 FROM participacoes WHERE partida_id=? AND (usuario_id=? OR nome_normalizado=?)',
                          (partida_id, usuario_id, nome.casefold())).fetchone():
                return jsonify(erro='Você ou este nome já está inscrito nesta partida.'), 409
            total = db.execute('SELECT COUNT(*) FROM participacoes WHERE partida_id=?', (partida_id,)).fetchone()[0]
            if total >= partida['limite']:
                return jsonify(erro='Não há vagas disponíveis.'), 409
            db.execute('''INSERT INTO participacoes(partida_id,nome_jogador,nome_normalizado,usuario_id)
                          VALUES (?,?,?,?)''', (partida_id, nome, nome.casefold(), usuario_id))
        return jsonify(mensagem=f'{nome}, presença confirmada!'), 201

    @app.get('/api/partidas/<int:partida_id>/participantes')
    def listar_participantes(partida_id):
        with connect() as db:
            if not db.execute('SELECT 1 FROM partidas WHERE id=?', (partida_id,)).fetchone():
                return jsonify(erro='Partida não encontrada.'), 404
            rows = db.execute('SELECT nome_jogador FROM participacoes WHERE partida_id=? ORDER BY id',
                              (partida_id,)).fetchall()
        return jsonify([r['nome_jogador'] for r in rows])

    @app.get('/api/admin/partidas')
    @admin_required
    def admin_partidas():
        with connect() as db:
            rows = db.execute(MATCH_QUERY + ' GROUP BY p.id ORDER BY p.data_hora DESC, p.id DESC').fetchall()
        return jsonify([serialize_partida(row) for row in rows])

    @app.delete('/api/admin/partidas/<int:partida_id>')
    @admin_required
    def admin_excluir_partida(partida_id):
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            partida = db.execute('SELECT titulo FROM partidas WHERE id=?', (partida_id,)).fetchone()
            if partida is None:
                return jsonify(erro='Partida não encontrada.'), 404
            # Exclusão explícita também suporta bancos antigos sem ON DELETE CASCADE.
            db.execute('DELETE FROM participacoes WHERE partida_id=?', (partida_id,))
            db.execute('DELETE FROM partidas WHERE id=?', (partida_id,))
        return jsonify(mensagem=f'Partida "{partida["titulo"]}" e suas inscrições foram excluídas.')

    @app.delete('/api/admin/partidas')
    @admin_required
    def admin_limpar_partidas():
        if text(json_body(), 'confirmacao') != 'EXCLUIR TODOS':
            return jsonify(erro='Digite EXCLUIR TODOS para confirmar a limpeza.'), 400
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            total = db.execute('SELECT COUNT(*) FROM partidas').fetchone()[0]
            db.execute('DELETE FROM participacoes')
            db.execute('DELETE FROM partidas')
        return jsonify(mensagem=f'{total} partida(s) e suas inscrições foram excluídas. As contas foram mantidas.', excluidas=total)

    @app.cli.command('criar-admin')
    @click.option('--email', prompt='E-mail do administrador')
    def criar_admin(email):
        """Cria um administrador local ou promove uma conta já cadastrada."""
        email = email.strip().casefold()
        if len(email) > 254 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
            raise click.ClickException('Informe um e-mail válido.')
        with connect() as db:
            existing = db.execute('SELECT id FROM usuarios WHERE email=?', (email,)).fetchone()
        if existing:
            with connect() as db:
                db.execute('UPDATE usuarios SET is_admin=1 WHERE id=?', (existing['id'],))
            click.echo('Conta promovida a administrador. Entre com sua senha atual.')
            return
        nome = ' '.join(click.prompt('Nome do administrador').split())
        if not 2 <= len(nome) <= 80:
            raise click.ClickException('O nome deve ter de 2 a 80 caracteres.')
        senha = click.prompt('Senha (8 a 128 caracteres)', hide_input=True, confirmation_prompt='Repita a senha')
        if not 8 <= len(senha) <= 128:
            raise click.ClickException('A senha deve ter de 8 a 128 caracteres.')
        with connect() as db:
            db.execute('INSERT INTO usuarios(nome,email,senha_hash,is_admin) VALUES (?,?,?,1)',
                       (nome, email, generate_password_hash(senha)))
        click.echo('Administrador criado. Entre no site com esse e-mail e senha e abra Administração.')

    with app.app_context():
        init_db()
    return app


if __name__ == '__main__':
    create_app().run(debug=os.environ.get('FLASK_DEBUG') == '1',
                     host=os.environ.get('PELADAFACIL_HOST', '127.0.0.1'), port=5000)
