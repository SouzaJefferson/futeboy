import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../config/db.js';
import { organizer, assertTeamManager } from '../../middlewares/auth.js';
import { id, teamInput, membershipInput, membershipEdit, playerInput } from '../shared/contracts.js';
import { transaction } from '../shared/transaction.js';
import { ensure } from '../shared/errors.js';
import { teamDetail, createMembership, updateMembership, savePlayer, playersWithStats, playerDetail, deletePlayer } from './service.js';

export const teamRoutes = Router();
teamRoutes.get('/', async (_req, res) => {
  res.json(await db.team.findMany({ include: { _count: { select: { memberships: { where: { endedAt: null } } } }, managers: { select: { userId: true } } }, orderBy: { name: 'asc' }, take: 100 }));
});
teamRoutes.post('/', organizer, async (req, res) => {
  const input = teamInput.parse(req.body);
  res.status(201).json(await db.team.create({ data: { ...input, ownerId: req.user!.id } }));
});
teamRoutes.get('/:id', async (req, res) => { res.json(await teamDetail(id.parse(req.params.id))); });
teamRoutes.put('/:id', organizer, async (req, res) => {
  const teamId = id.parse(req.params.id), input = teamInput.parse(req.body);
  res.json(await transaction(async tx => {
    await assertTeamManager(tx, req.user!, teamId);
    return tx.team.update({ where: { id: teamId }, data: input });
  }));
});
teamRoutes.delete('/:id', organizer, async (req, res) => {
  const teamId = id.parse(req.params.id);
  await transaction(async tx => {
    await assertTeamManager(tx, req.user!, teamId);
    await tx.team.delete({ where: { id: teamId } });
  });
  res.status(204).end();
});
teamRoutes.post('/:id/memberships', organizer, async (req, res) => { res.status(201).json(await createMembership(req.user!, id.parse(req.params.id), membershipInput.parse(req.body))); });
teamRoutes.patch('/:id/memberships/:memberId', organizer, async (req, res) => { res.json(await updateMembership(req.user!, id.parse(req.params.id), id.parse(req.params.memberId), membershipEdit.parse(req.body))); });
teamRoutes.delete('/:id/memberships/:memberId', organizer, async (req, res) => { await updateMembership(req.user!, id.parse(req.params.id), id.parse(req.params.memberId), null); res.status(204).end(); });
teamRoutes.post('/:id/managers', organizer, async (req, res) => {
  const teamId = id.parse(req.params.id), input = z.object({ userId: id }).parse(req.body);
  res.status(201).json(await transaction(async tx => {
    const team = await assertTeamManager(tx, req.user!, teamId);
    ensure(req.user!.role === 'ADMIN' || team.ownerId === req.user!.id, 403, 'Somente o criador da equipe pode nomear responsáveis.');
    const user = await tx.user.findUnique({ where: { id: input.userId } });
    ensure(user && user.role !== 'PLAYER', 422, 'Selecione um organizador ou administrador.');
    return tx.teamManager.create({ data: { teamId, userId: user.id } });
  }));
});
teamRoutes.delete('/:id/managers/:userId', organizer, async (req, res) => {
  const teamId = id.parse(req.params.id), userId = id.parse(req.params.userId);
  await transaction(async tx => {
    const team = await assertTeamManager(tx, req.user!, teamId);
    ensure(req.user!.role === 'ADMIN' || team.ownerId === req.user!.id, 403, 'Somente o criador da equipe pode remover responsáveis.');
    await tx.teamManager.deleteMany({ where: { teamId, userId } });
  }); res.status(204).end();
});

export const playerRoutes = Router();
playerRoutes.get('/', async (_req, res) => { res.json(await playersWithStats()); });
playerRoutes.post('/', organizer, async (req, res) => { res.status(201).json(await savePlayer(req.user!, playerInput.parse(req.body))); });
playerRoutes.get('/:id', async (req, res) => { res.json(await playerDetail(id.parse(req.params.id))); });
playerRoutes.put('/:id', async (req, res) => { res.json(await savePlayer(req.user!, playerInput.parse(req.body), id.parse(req.params.id))); });
playerRoutes.delete('/:id', organizer, async (req, res) => {
  await transaction(tx => deletePlayer(tx, req.user!, id.parse(req.params.id))); res.status(204).end();
});
