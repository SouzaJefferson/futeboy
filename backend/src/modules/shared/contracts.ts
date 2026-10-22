import { z } from 'zod';
export const id = z.uuid();
export const name = z.string().trim().min(2, 'Informe ao menos 2 caracteres.').max(100);
export const photoUrl = z.union([z.url().max(2000).refine(url => new URL(url).protocol === 'https:', 'Use uma URL HTTPS.'), z.literal('')]).nullable().optional().transform(v => v || null);
export const teamInput = z.object({
  name, shortName: z.string().trim().min(2).max(5).transform(v => v.toUpperCase()),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#236b49'), crestUrl: photoUrl,
  description: z.string().trim().max(1000).default(''), city: z.string().trim().max(100).default(''),
});
export const playerInput = z.object({
  name, nickname: z.string().trim().max(50).nullable().optional(), photoUrl,
  position: z.enum(['GOALKEEPER', 'DEFENDER', 'FULLBACK', 'MIDFIELDER', 'FORWARD']),
  userId: id.nullable().optional(),
});
export const membershipInput = z.object({
  playerId: id, shirtNumber: z.number().int().min(1).max(99), isCaptain: z.boolean().default(false),
});
export const membershipEdit = membershipInput.omit({ playerId: true });
export const matchInput = z.object({
  homeTeamId: id, awayTeamId: id, championshipId: id.nullable().optional(),
  startsAt: z.iso.datetime({ offset: true }), location: z.string().trim().min(2).max(200),
}).refine(v => v.homeTeamId !== v.awayTeamId, { message: 'Uma equipe não pode enfrentar a si mesma.', path: ['awayTeamId'] });
export const eventInput = z.object({
  teamId: id, kind: z.enum(['GOAL', 'YELLOW_CARD', 'RED_CARD', 'NOTE']), minute: z.number().int().min(0).max(150),
  membershipId: id.nullable().optional(), assistantId: id.nullable().optional(), note: z.string().trim().max(500).nullable().optional(),
}).superRefine((v, ctx) => {
  if (v.kind !== 'NOTE' && !v.membershipId) ctx.addIssue({ code: 'custom', path: ['membershipId'], message: 'Selecione o jogador.' });
  if (v.kind === 'NOTE' && !v.note) ctx.addIssue({ code: 'custom', path: ['note'], message: 'Descreva o evento.' });
  if (v.assistantId && (v.kind !== 'GOAL' || v.assistantId === v.membershipId)) ctx.addIssue({ code: 'custom', path: ['assistantId'], message: 'Assistência exige um gol e outro jogador.' });
});
export const championshipInput = z.object({
  name, description: z.string().trim().max(1000).default(''),
  startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }),
}).refine(v => new Date(v.endsAt) >= new Date(v.startsAt), { message: 'Encerramento deve ser posterior ao início.', path: ['endsAt'] });
