import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { env } from './config/env.js';
import { db } from './config/db.js';
import { authenticated } from './middlewares/auth.js';
import { AppError } from './modules/shared/errors.js';
import { authRoutes } from './modules/auth/routes.js';
import { teamRoutes, playerRoutes } from './modules/teams/routes.js';
import { matchRoutes } from './modules/matches/routes.js';
import { championshipRoutes } from './modules/championships/routes.js';
import { userRoutes } from './modules/users/routes.js';

export const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }));
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin && req.headers.origin !== env.FRONTEND_ORIGIN) throw new AppError(403, 'Origem da requisição não autorizada.');
  next();
});
app.get('/api/health', async (_req, res) => {
  await db.$queryRaw`SELECT 1`;
  res.json({ status: 'ok', service: 'futeboy-api' });
});
app.use('/api/auth', authRoutes);
app.use('/api', authenticated);
app.use('/api/teams', teamRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/championships', championshipRoutes);
app.use('/api/users', userRoutes);
app.use((_req, _res, next) => next(new AppError(404, 'Recurso não encontrado.')));
const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) { res.status(422).json({ error: error.issues[0]?.message ?? 'Dados inválidos.', details: error.issues.map(i => ({ field: i.path.join('.'), message: i.message })) }); return; }
  if (error instanceof AppError) { res.status(error.status).json({ error: error.message }); return; }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') { res.status(409).json({ error: 'Registro duplicado. Verifique e-mail, inscrição, número da camisa ou vínculo ativo.' }); return; }
    if (error.code === 'P2003') { res.status(409).json({ error: 'Este registro possui vínculos ou histórico. Verifique as associações antes de excluir ou cadastrar.' }); return; }
    if (error.code === 'P2025') { res.status(404).json({ error: 'Registro não encontrado.' }); return; }
    if (error.code === 'P2034') { res.status(409).json({ error: 'Outra alteração ocorreu ao mesmo tempo. Tente novamente.' }); return; }
  }
  if (error?.type === 'entity.parse.failed') { res.status(400).json({ error: 'JSON inválido.' }); return; }
  if (error?.type === 'entity.too.large') { res.status(413).json({ error: 'Requisição excede o tamanho permitido.' }); return; }
  console.error(error);
  res.status(500).json({ error: 'Não foi possível concluir a operação. Verifique se o banco de dados está disponível.' });
};
app.use(errorHandler);
