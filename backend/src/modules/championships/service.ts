import type { z } from 'zod';
import { db } from '../../config/db.js';
import { assertOwner, type Actor } from '../../middlewares/auth.js';
import { transaction } from '../shared/transaction.js';
import { ensure } from '../shared/errors.js';
import type { championshipInput } from '../shared/contracts.js';
import { matchInclude, presentMatch } from '../matches/queries.js';
import { playersWithStats } from '../teams/service.js';
import { standings, roundRobin } from './domain.js';

export async function saveChampionship(actor: Actor, input: z.infer<typeof championshipInput>, id?: string) {
  return transaction(async tx => {
    const data = { ...input, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt) };
    if (id) {
      const championship = await tx.championship.findUnique({ where: { id }, include: { _count: { select: { matches: true } } } });
      ensure(championship, 404, 'Campeonato não encontrado.');
      assertOwner(actor, championship.ownerId);
      ensure(!championship._count.matches || (data.startsAt.getTime() === championship.startsAt.getTime() && data.endsAt.getTime() === championship.endsAt.getTime()), 409, 'O calendário já existe. As datas do campeonato estão bloqueadas.');
      return tx.championship.update({ where: { id }, data });
    }
    return tx.championship.create({ data: { ...data, ownerId: actor.id } });
  });
}
export async function championshipDetail(id: string) {
  const championship = await db.championship.findUnique({ where: { id }, include: { teams: { include: { team: true } }, matches: { include: matchInclude, orderBy: { startsAt: 'asc' } } } });
  ensure(championship, 404, 'Campeonato não encontrado.');
  const scorers = (await playersWithStats(id)).filter(p => p.stats.goals > 0).sort((a, b) => b.stats.goals - a.stats.goals || b.stats.assists - a.stats.assists || a.name.localeCompare(b.name));
  return { ...championship, matches: championship.matches.map(presentMatch), standings: standings(championship.teams.map(t => t.team), championship.matches), scorers };
}
export async function enrollTeam(actor: Actor, championshipId: string, teamId: string, remove = false) {
  return transaction(async tx => {
    const championship = await tx.championship.findUnique({ where: { id: championshipId }, include: { _count: { select: { matches: true } } } });
    ensure(championship, 404, 'Campeonato não encontrado.');
    assertOwner(actor, championship.ownerId);
    ensure(!championship._count.matches, 409, 'Inscrições bloqueadas porque o calendário já existe.');
    ensure(await tx.team.findUnique({ where: { id: teamId } }), 404, 'Equipe não encontrada.');
    if (remove) await tx.championshipTeam.delete({ where: { championshipId_teamId: { championshipId, teamId } } });
    else await tx.championshipTeam.create({ data: { championshipId, teamId } });
  });
}
export async function generateSchedule(actor: Actor, id: string, input: { startsAt: string; intervalDays: number; location: string }) {
  return transaction(async tx => {
    const championship = await tx.championship.findUnique({ where: { id }, include: { teams: { orderBy: { teamId: 'asc' } }, _count: { select: { matches: true } } } });
    ensure(championship, 404, 'Campeonato não encontrado.');
    assertOwner(actor, championship.ownerId);
    ensure(!championship._count.matches, 409, 'Este campeonato já possui calendário.');
    ensure(championship.teams.length >= 2, 422, 'Inscreva ao menos duas equipes.');
    const schedule = roundRobin(championship.teams.map(t => t.teamId)).map(fixture => ({ ...fixture, startsAt: new Date(new Date(input.startsAt).getTime() + (fixture.round - 1) * input.intervalDays * 86400000), championshipId: id, ownerId: actor.id, location: input.location }));
    ensure(schedule.every(m => m.startsAt >= championship.startsAt && m.startsAt <= championship.endsAt), 422, 'O calendário não cabe no período do campeonato. Ajuste a primeira rodada ou o intervalo.');
    await tx.match.createMany({ data: schedule });
    return { created: schedule.length };
  });
}
