import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../config/db.js';
import { organizer, assertOwner } from '../../middlewares/auth.js';
import { id, championshipInput } from '../shared/contracts.js';
import { transaction } from '../shared/transaction.js';
import { ensure } from '../shared/errors.js';
import { saveChampionship, championshipDetail, enrollTeam, generateSchedule } from './service.js';
export const championshipRoutes = Router();
championshipRoutes.get('/', async (_req, res) => { res.json(await db.championship.findMany({ include: { _count: { select: { teams: true, matches: true } } }, orderBy: { startsAt: 'desc' }, take: 100 })); });
championshipRoutes.post('/', organizer, async (req, res) => { res.status(201).json(await saveChampionship(req.user!, championshipInput.parse(req.body))); });
championshipRoutes.get('/:id', async (req, res) => { res.json(await championshipDetail(id.parse(req.params.id))); });
championshipRoutes.put('/:id', organizer, async (req, res) => { res.json(await saveChampionship(req.user!, championshipInput.parse(req.body), id.parse(req.params.id))); });
championshipRoutes.delete('/:id', organizer, async (req, res) => {
  await transaction(async tx => {
    const championship = await tx.championship.findUnique({ where: { id: id.parse(req.params.id) } });
    ensure(championship, 404, 'Campeonato não encontrado.');
    assertOwner(req.user!, championship.ownerId);
    await tx.championship.delete({ where: { id: championship.id } });
  }); res.status(204).end();
});
championshipRoutes.post('/:id/teams', organizer, async (req, res) => { const input = z.object({ teamId: id }).parse(req.body); await enrollTeam(req.user!, id.parse(req.params.id), input.teamId); res.status(201).json({ ok: true }); });
championshipRoutes.delete('/:id/teams/:teamId', organizer, async (req, res) => { await enrollTeam(req.user!, id.parse(req.params.id), id.parse(req.params.teamId), true); res.status(204).end(); });
championshipRoutes.post('/:id/schedule', organizer, async (req, res) => {
  const input = z.object({ startsAt: z.iso.datetime({ offset: true }), intervalDays: z.number().int().min(1).max(30).default(7), location: z.string().trim().min(2).max(200) }).parse(req.body);
  res.status(201).json(await generateSchedule(req.user!, id.parse(req.params.id), input));
});
