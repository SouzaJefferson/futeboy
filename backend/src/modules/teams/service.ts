import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import type { Actor } from '../../middlewares/auth.js';
import { assertOwner, assertTeamManager } from '../../middlewares/auth.js';
import { db } from '../../config/db.js';
import { transaction } from '../shared/transaction.js';
import { ensure } from '../shared/errors.js';
import type { membershipInput, membershipEdit, playerInput } from '../shared/contracts.js';
import { matchInclude, presentMatch } from '../matches/queries.js';
import { playerStats } from '../matches/domain.js';
import { standings } from '../championships/domain.js';

export async function teamDetail(id: string) {
  const team = await db.team.findUnique({ where: { id }, include: {
    managers: { include: { user: { select: { id: true, name: true, email: true } } } },
    memberships: { where: { endedAt: null }, include: { player: true }, orderBy: { shirtNumber: 'asc' } },
    championships: { include: { championship: true } },
  } });
  ensure(team, 404, 'Equipe não encontrada.');
  const matches = await db.match.findMany({ where: { OR: [{ homeTeamId: id }, { awayTeamId: id }] }, include: matchInclude, orderBy: { startsAt: 'desc' } });
  const opponents = [...new Map(matches.flatMap(m => [m.homeTeam, m.awayTeam]).map(t => [t.id, t])).values()];
  const stats = standings([team, ...opponents.filter(t => t.id !== id)], matches).find(r => r.team.id === id)!;
  return { ...team, matches: matches.map(presentMatch), stats: { ...stats, team: undefined } };
}
export async function createMembership(actor: Actor, teamId: string, input: z.infer<typeof membershipInput>) {
  return transaction(async tx => {
    await assertTeamManager(tx, actor, teamId);
    const player = await tx.player.findUnique({ where: { id: input.playerId } });
    ensure(player, 404, 'Jogador não encontrado.');
    assertOwner(actor, player.createdById);
    ensure(!await tx.membership.findFirst({ where: { playerId: player.id, endedAt: null } }), 409, 'Encerre o vínculo atual antes de transferir o jogador.');
    if (input.isCaptain) await tx.membership.updateMany({ where: { teamId, endedAt: null, isCaptain: true }, data: { isCaptain: false } });
    return tx.membership.create({ data: { ...input, teamId }, include: { player: true } });
  });
}
export async function updateMembership(actor: Actor, teamId: string, id: string, input: z.infer<typeof membershipEdit> | null) {
  return transaction(async tx => {
    await assertTeamManager(tx, actor, teamId);
    const member = await tx.membership.findUnique({ where: { id } });
    ensure(member && member.teamId === teamId && !member.endedAt, 404, 'Vínculo ativo não encontrado.');
    if (input?.isCaptain) await tx.membership.updateMany({ where: { teamId, endedAt: null, isCaptain: true, id: { not: id } }, data: { isCaptain: false } });
    return tx.membership.update({ where: { id }, data: input ?? { endedAt: new Date(), isCaptain: false } });
  });
}
export async function savePlayer(actor: Actor, input: z.infer<typeof playerInput>, id?: string) {
  return transaction(async tx => {
    if (id) {
      const player = await tx.player.findUnique({ where: { id } });
      ensure(player, 404, 'Jogador não encontrado.');
      if (actor.id !== player.userId) assertOwner(actor, player.createdById);
    } else ensure(actor.role !== 'PLAYER', 403, 'Apenas organizadores cadastram jogadores.');
    if ('userId' in input && actor.role !== 'ADMIN') {
      const existing = id ? await tx.player.findUnique({ where: { id } }) : null;
      ensure((input.userId ?? null) === (existing?.userId ?? null), 403, 'Somente administradores vinculam contas a jogadores.');
    }
    return id ? tx.player.update({ where: { id }, data: input }) : tx.player.create({ data: { ...input, createdById: actor.id } });
  });
}
export async function playersWithStats(championshipId?: string) {
  const [players, matches] = await Promise.all([
    db.player.findMany({ include: { memberships: { where: { endedAt: null }, include: { team: true } } }, orderBy: { name: 'asc' }, take: 500 }),
    db.match.findMany({ where: { status: 'FINISHED', ...(championshipId ? { championshipId } : {}) }, include: matchInclude }),
  ]);
  return players.map(player => ({ ...player, stats: playerStats(player.id, matches) }));
}
export async function playerDetail(id: string) {
  const player = await db.player.findUnique({ where: { id }, include: { memberships: { include: { team: true }, orderBy: { startedAt: 'desc' } } } });
  ensure(player, 404, 'Jogador não encontrado.');
  const matches = await db.match.findMany({ where: { events: { some: { OR: [{ membership: { playerId: id } }, { assistant: { playerId: id } }] } } }, include: matchInclude, orderBy: { startsAt: 'desc' } });
  return { ...player, stats: playerStats(id, matches), matches: matches.map(presentMatch) };
}
export async function deletePlayer(tx: Prisma.TransactionClient, actor: Actor, id: string) {
  const player = await tx.player.findUnique({ where: { id } });
  ensure(player, 404, 'Jogador não encontrado.');
  assertOwner(actor, player.createdById);
  ensure(!player.userId, 409, 'Jogadores vinculados a uma conta não podem ser excluídos.');
  ensure(await tx.membership.count({ where: { playerId: id } }) === 0, 409, 'O jogador possui histórico de vínculos e não pode ser excluído.');
  await tx.player.delete({ where: { id } });
}
