import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { db } from '../../config/db.js';
import { env } from '../../config/env.js';
import { authenticated } from '../../middlewares/auth.js';
import { ensure } from '../shared/errors.js';
import { name, photoUrl } from '../shared/contracts.js';
import { transaction } from '../shared/transaction.js';
import { hashPassword, verifyPassword, tokenHash } from './password.js';

export const authRoutes = Router();
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.' } });
const credentials = z.object({ email: z.email().trim().toLowerCase().max(254), password: z.string().min(8).max(128) });
const publicUser = { id: true, name: true, email: true, role: true, photoUrl: true, player: { select: { id: true } } } as const;
const cookie = { httpOnly: true, sameSite: 'strict' as const, secure: env.NODE_ENV === 'production', path: '/api' };
async function createSession(userId: string) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 86400000);
  await db.session.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
  await db.session.create({ data: { userId, tokenHash: tokenHash(token), expiresAt } });
  return { token, expiresAt };
}
authRoutes.post('/register', authLimit, async (req, res) => {
  const input = credentials.extend({ name }).parse(req.body);
  const passwordHash = await hashPassword(input.password);
  const user = await transaction(async tx => {
    ensure(!await tx.user.findUnique({ where: { email: input.email } }), 409, 'Este e-mail já está cadastrado.');
    const created = await tx.user.create({ data: { email: input.email, name: input.name, passwordHash } });
    await tx.player.create({ data: { name: created.name, userId: created.id, createdById: created.id, position: 'MIDFIELDER' } });
    return tx.user.findUniqueOrThrow({ where: { id: created.id }, select: publicUser });
  });
  const session = await createSession(user.id);
  res.cookie('futeboy_session', session.token, { ...cookie, expires: session.expiresAt }).status(201).json(user);
});
authRoutes.post('/login', authLimit, async (req, res) => {
  const input = credentials.parse(req.body);
  const user = await db.user.findUnique({ where: { email: input.email } });
  // Mesmo custo de hash para e-mails desconhecidos reduz enumeração por tempo de resposta.
  const fallback = 'scrypt$00000000000000000000000000000000$' + '00'.repeat(64);
  const valid = await verifyPassword(input.password, user?.passwordHash ?? fallback);
  ensure(user && valid, 401, 'E-mail ou senha incorretos.');
  const session = await createSession(user.id);
  res.cookie('futeboy_session', session.token, { ...cookie, expires: session.expiresAt }).json(await db.user.findUnique({ where: { id: user.id }, select: publicUser }));
});
authRoutes.post('/logout', async (req, res) => {
  const token = req.cookies?.futeboy_session;
  if (typeof token === 'string') await db.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
  res.clearCookie('futeboy_session', cookie).status(204).end();
});
authRoutes.get('/me', authenticated, async (req, res) => {
  res.json(await db.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: publicUser }));
});
authRoutes.patch('/me', authenticated, async (req, res) => {
  const input = z.object({ name, photoUrl }).parse(req.body);
  const result = await transaction(async tx => {
    await tx.player.updateMany({ where: { userId: req.user!.id }, data: input });
    return tx.user.update({ where: { id: req.user!.id }, data: input, select: publicUser });
  });
  res.json(result);
});
