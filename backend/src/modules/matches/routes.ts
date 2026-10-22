import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../config/db.js';
import { organizer } from '../../middlewares/auth.js';
import { id, matchInput, eventInput } from '../shared/contracts.js';
import { saveMatch, matchDetail, transitionMatch, addEvent, removeEvent } from './service.js';
import { matchInclude, presentMatch } from './queries.js';
export const matchRoutes = Router();
matchRoutes.get('/', async (req, res) => {
  const query = z.object({ teamId: id.optional(), championshipId: id.optional(), status: z.enum(['SCHEDULED', 'LIVE', 'FINISHED', 'CANCELLED']).optional() }).parse(req.query);
  res.json((await db.match.findMany({ where: { ...(query.teamId ? { OR: [{ homeTeamId: query.teamId }, { awayTeamId: query.teamId }] } : {}), championshipId: query.championshipId, status: query.status }, include: matchInclude, orderBy: { startsAt: 'desc' }, take: 200 })).map(presentMatch));
});
matchRoutes.post('/', organizer, async (req, res) => { res.status(201).json(await saveMatch(req.user!, matchInput.parse(req.body))); });
matchRoutes.get('/:id', async (req, res) => { res.json(await matchDetail(id.parse(req.params.id))); });
matchRoutes.put('/:id', organizer, async (req, res) => { res.json(await saveMatch(req.user!, matchInput.parse(req.body), id.parse(req.params.id))); });
matchRoutes.patch('/:id/status', organizer, async (req, res) => {
  const input = z.object({ status: z.enum(['LIVE', 'FINISHED', 'CANCELLED']) }).parse(req.body);
  res.json(await transitionMatch(req.user!, id.parse(req.params.id), input.status));
});
matchRoutes.post('/:id/events', organizer, async (req, res) => { res.status(201).json(await addEvent(req.user!, id.parse(req.params.id), eventInput.parse(req.body))); });
matchRoutes.delete('/:id/events/:eventId', organizer, async (req, res) => { await removeEvent(req.user!, id.parse(req.params.id), id.parse(req.params.eventId)); res.status(204).end(); });
