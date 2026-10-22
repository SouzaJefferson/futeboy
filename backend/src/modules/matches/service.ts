import type { z } from 'zod';
import type { Actor } from '../../middlewares/auth.js';
import { assertOwner, assertTeamManager } from '../../middlewares/auth.js';
import { db } from '../../config/db.js';
import { transaction } from '../shared/transaction.js';
import { ensure } from '../shared/errors.js';
import type { eventInput, matchInput } from '../shared/contracts.js';
import { assertTransition, assertMembership, type Status } from './domain.js';
import { matchInclude, presentMatch } from './queries.js';

export async function saveMatch(actor: Actor, input: z.infer<typeof matchInput>, id?: string) {
  return transaction(async tx => {
    if (id) {
      await tx.$queryRaw`SELECT id FROM "Match" WHERE id = ${id}::uuid FOR UPDATE`;
      const match = await tx.match.findUnique({ where: { id } });
      ensure(match, 404, 'Partida não encontrada.');
      assertOwner(actor, match.ownerId);
      ensure(match.status === 'SCHEDULED', 409, 'Somente partidas agendadas podem ser editadas.');
    }
    const startsAt = new Date(input.startsAt);
    if (input.championshipId) {
      const championship = await tx.championship.findUnique({ where: { id: input.championshipId }, include: { teams: true } });
      ensure(championship, 404, 'Campeonato não encontrado.');
      assertOwner(actor, championship.ownerId);
      ensure(championship.teams.some(t => t.teamId === input.homeTeamId) && championship.teams.some(t => t.teamId === input.awayTeamId), 422, 'As duas equipes precisam estar inscritas no campeonato.');
      ensure(startsAt >= championship.startsAt && startsAt <= championship.endsAt, 422, 'A partida deve estar no período do campeonato.');
      const existing = await tx.match.findFirst({ where: { championshipId: championship.id, ...(id ? { id: { not: id } } : {}), OR: [{ homeTeamId: input.homeTeamId, awayTeamId: input.awayTeamId }, { homeTeamId: input.awayTeamId, awayTeamId: input.homeTeamId }] } });
      ensure(!existing, 409, 'Este confronto já existe no campeonato de turno único.');
    } else {
      await assertTeamManager(tx, actor, input.homeTeamId);
      await assertTeamManager(tx, actor, input.awayTeamId);
    }
    const data = { ...input, championshipId: input.championshipId ?? null, startsAt };
    const match = id ? await tx.match.update({ where: { id }, data, include: matchInclude }) : await tx.match.create({ data: { ...data, ownerId: actor.id }, include: matchInclude });
    return presentMatch(match);
  });
}
export async function transitionMatch(actor: Actor, id: string, status: Status) {
  return transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Match" WHERE id = ${id}::uuid FOR UPDATE`;
    const match = await tx.match.findUnique({ where: { id } });
    ensure(match, 404, 'Partida não encontrada.');
    assertOwner(actor, match.ownerId);
    assertTransition(match.status, status);
    return presentMatch(await tx.match.update({ where: { id }, data: { status }, include: matchInclude }));
  });
}
export async function addEvent(actor: Actor, id: string, input: z.infer<typeof eventInput>) {
  return transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Match" WHERE id = ${id}::uuid FOR UPDATE`;
    const match = await tx.match.findUnique({ where: { id } });
    ensure(match, 404, 'Partida não encontrada.');
    assertOwner(actor, match.ownerId);
    ensure(match.status === 'LIVE', 409, 'Registre eventos apenas em partidas em andamento.');
    ensure(input.teamId === match.homeTeamId || input.teamId === match.awayTeamId, 422, 'Equipe não participa desta partida.');
    for (const memberId of [input.membershipId, input.assistantId].filter((v): v is string => !!v)) {
      const member = await tx.membership.findUnique({ where: { id: memberId } });
      ensure(member, 422, 'Vínculo do jogador não encontrado.');
      assertMembership(member, input.teamId, match.startsAt);
    }
    return tx.matchEvent.create({ data: { ...input, matchId: id } });
  });
}
export async function removeEvent(actor: Actor, matchId: string, eventId: string) {
  return transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Match" WHERE id = ${matchId}::uuid FOR UPDATE`;
    const match = await tx.match.findUnique({ where: { id: matchId } });
    ensure(match, 404, 'Partida não encontrada.');
    assertOwner(actor, match.ownerId);
    ensure(match.status === 'LIVE', 409, 'A súmula está bloqueada.');
    const event = await tx.matchEvent.findUnique({ where: { id: eventId } });
    ensure(event?.matchId === matchId, 404, 'Evento não encontrado nesta partida.');
    await tx.matchEvent.delete({ where: { id: eventId } });
  });
}
export async function matchDetail(id: string) {
  const match = await db.match.findUnique({ where: { id }, include: matchInclude });
  ensure(match, 404, 'Partida não encontrada.');
  const roster = await db.membership.findMany({ where: { teamId: { in: [match.homeTeamId, match.awayTeamId] }, startedAt: { lte: match.startsAt }, OR: [{ endedAt: null }, { endedAt: { gt: match.startsAt } }] }, include: { player: true }, orderBy: { shirtNumber: 'asc' } });
  return { ...presentMatch(match), roster };
}
