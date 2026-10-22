import type { RequestHandler } from 'express';
import type { Prisma, Role } from '@prisma/client';
import { db } from '../config/db.js';
import { tokenHash } from '../modules/auth/password.js';
import { ensure } from '../modules/shared/errors.js';
export type Actor = { id: string; role: Role };
declare global { namespace Express { interface Request { user?: Actor } } }
export const authenticated: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.futeboy_session;
  ensure(typeof token === 'string' && token.length === 64, 401, 'Entre na sua conta para continuar.');
  const session = await db.session.findUnique({ where: { tokenHash: tokenHash(token) }, include: { user: { select: { id: true, role: true } } } });
  ensure(session && session.expiresAt > new Date(), 401, 'Sua sessão expirou. Entre novamente.');
  req.user = session.user;
  next();
};
export const organizer: RequestHandler = (req, _res, next) => {
  ensure(req.user?.role === 'ADMIN' || req.user?.role === 'ORGANIZER', 403, 'Apenas organizadores podem executar esta ação.');
  next();
};
export function assertOwner(actor: Actor, ownerId: string) {
  ensure(actor.role === 'ADMIN' || (actor.role === 'ORGANIZER' && actor.id === ownerId), 403, 'Você não tem permissão para alterar este recurso.');
}
export async function assertTeamManager(tx: Prisma.TransactionClient, actor: Actor, teamId: string) {
  const team = await tx.team.findUnique({ where: { id: teamId }, include: { managers: true } });
  ensure(team, 404, 'Equipe não encontrada.');
  ensure(actor.role === 'ADMIN' || (actor.role === 'ORGANIZER' && (team.ownerId === actor.id || team.managers.some(m => m.userId === actor.id))), 403, 'Você não é responsável por esta equipe.');
  return team;
}
