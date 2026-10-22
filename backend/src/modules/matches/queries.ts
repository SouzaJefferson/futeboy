import { Prisma } from '@prisma/client';
import { score } from './domain.js';
export const eventInclude = { membership: { include: { player: true } }, assistant: { include: { player: true } } } satisfies Prisma.MatchEventInclude;
export const matchInclude = { homeTeam: true, awayTeam: true, championship: { select: { id: true, name: true } }, events: { include: eventInclude, orderBy: [{ minute: 'asc' as const }, { createdAt: 'asc' as const }] } } satisfies Prisma.MatchInclude;
export type FullMatch = Prisma.MatchGetPayload<{ include: typeof matchInclude }>;
export function presentMatch(match: FullMatch) { return { ...match, score: score(match) }; }
