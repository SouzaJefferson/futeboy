from datetime import datetime
from pathlib import Path
import sqlite3

from flask import Flask, jsonify, render_template, request

app = Flask(__name__)
DB_PATH = Path(__file__).with_name('peladafacil.db')


def connect():
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys = ON')
    return db


def init_db():
    with connect() as db:
        db.executescript('''
            CREATE TABLE IF NOT EXISTS partidas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                titulo TEXT NOT NULL,
                local TEXT NOT NULL,
                data_hora TEXT NOT NULL,
                limite INTEGER NOT NULL CHECK(limite BETWEEN 2 AND 100),
                criada_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS participacoes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                partida_id INTEGER NOT NULL REFERENCES partidas(id) ON DELETE CASCADE,
                nome_jogador TEXT NOT NULL,
                nome_normalizado TEXT NOT NULL,
                criada_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(partida_id, nome_normalizado)
            );
        ''')


def serialize_partida(row):
    item = dict(row)
    item['vagas_restantes'] = max(0, item['limite'] - item['participantes'])
    return item


@app.get('/')
def home():
    return render_template('index.html')


@app.get('/api/partidas')
def listar_partidas():
    with connect() as db:
        rows = db.execute('''
            SELECT p.id, p.titulo, p.local, p.data_hora, p.limite,
                   COUNT(a.id) AS participantes
            FROM partidas p LEFT JOIN participacoes a ON a.partida_id = p.id
            GROUP BY p.id ORDER BY p.data_hora ASC, p.id DESC
        ''').fetchall()
    return jsonify([serialize_partida(r) for r in rows])


@app.post('/api/partidas')
def criar_partida():
    data = request.get_json(silent=True) or {}
    titulo = str(data.get('titulo') or '').strip()
    local = str(data.get('local') or '').strip()
    data_hora = str(data.get('data_hora') or '').strip()
    try:
        limite = int(data.get('limite'))
        horario = datetime.fromisoformat(data_hora)
    except (TypeError, ValueError):
        return jsonify(erro='Informe uma data/hora e limite válidos.'), 400
    if not (3 <= len(titulo) <= 90 and 3 <= len(local) <= 120):
        return jsonify(erro='Título e local devem ter pelo menos 3 caracteres.'), 400
    if not 2 <= limite <= 100:
        return jsonify(erro='O limite deve ser entre 2 e 100 jogadores.'), 400
    if horario <= datetime.now():
        return jsonify(erro='A partida precisa estar no futuro.'), 400
    with connect() as db:
        cur = db.execute(
            'INSERT INTO partidas(titulo, local, data_hora, limite) VALUES (?, ?, ?, ?)',
            (titulo, local, horario.isoformat(timespec='minutes'), limite))
        partida_id = cur.lastrowid
    return jsonify(id=partida_id, mensagem='Partida criada!'), 201


@app.post('/api/partidas/<int:partida_id>/participar')
def participar(partida_id):
    data = request.get_json(silent=True) or {}
    nome = ' '.join(str(data.get('nome') or '').strip().split())
    if not 2 <= len(nome) <= 80:
        return jsonify(erro='Informe um nome de 2 a 80 caracteres.'), 400
    with connect() as db:
        # BEGIN IMMEDIATE serializa inscrições simultâneas e evita exceder vagas.
        db.execute('BEGIN IMMEDIATE')
        partida = db.execute('SELECT * FROM partidas WHERE id = ?', (partida_id,)).fetchone()
        if partida is None:
            return jsonify(erro='Partida não encontrada.'), 404
        if datetime.fromisoformat(partida['data_hora']) <= datetime.now():
            return jsonify(erro='Esta partida já começou.'), 409
        total = db.execute('SELECT COUNT(*) FROM participacoes WHERE partida_id = ?', (partida_id,)).fetchone()[0]
        if total >= partida['limite']:
            return jsonify(erro='Não há vagas disponíveis.'), 409
        try:
            db.execute(
                'INSERT INTO participacoes(partida_id, nome_jogador, nome_normalizado) VALUES (?, ?, ?)',
                (partida_id, nome, nome.casefold()))
        except sqlite3.IntegrityError:
            return jsonify(erro='Este nome já está inscrito nesta partida.'), 409
    return jsonify(mensagem=f'{nome}, presença confirmada!'), 201


@app.get('/api/partidas/<int:partida_id>/participantes')
def listar_participantes(partida_id):
    with connect() as db:
        if not db.execute('SELECT 1 FROM partidas WHERE id=?', (partida_id,)).fetchone():
            return jsonify(erro='Partida não encontrada.'), 404
        rows = db.execute('SELECT nome_jogador FROM participacoes WHERE partida_id=? ORDER BY id', (partida_id,)).fetchall()
    return jsonify([r['nome_jogador'] for r in rows])


init_db()

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
