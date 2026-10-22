import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../config/db.js';
import { organizer } from '../../middlewares/auth.js';
import { id } from '../shared/contracts.js';
import { ensure } from '../shared/errors.js';
import { transaction } from '../shared/transaction.js';
export const userRoutes = Router();
userRoutes.get('/', organizer, async (req, res) => {
  // Dados pessoais completos somente para administradores; responsáveis veem organizadores.
  res.json(await db.user.findMany({ where: req.user!.role === 'ADMIN' ? {} : { role: { in: ['ADMIN', 'ORGANIZER'] } }, select: { id: true, name: true, email: true, role: true }, orderBy: { name: 'asc' }, take: 200 }));
});
userRoutes.patch('/:id/role', async (req, res) => {
  ensure(req.user!.role === 'ADMIN', 403, 'Somente administradores alteram permissões.');
  const userId = id.parse(req.params.id), input = z.object({ role: z.enum(['ADMIN', 'ORGANIZER', 'PLAYER']) }).parse(req.body);
  ensure(userId !== req.user!.id, 422, 'Você não pode alterar a própria permissão.');
  const user = await transaction(async tx => {
    const updated = await tx.user.update({ where: { id: userId }, data: input, select: { id: true, name: true, email: true, role: true } });
    await tx.session.deleteMany({ where: { userId } });
    return updated;
  }); res.json(user);
});
