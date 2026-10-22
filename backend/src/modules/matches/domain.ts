import { ensure } from '../shared/errors.js';
export type Status = 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'CANCELLED';
export type Event = { kind: string; teamId: string; membershipId?: string | null; assistantId?: string | null; membership?: { playerId: string } | null; assistant?: { playerId: string } | null };
export type ScoredMatch = { id: string; homeTeamId: string; awayTeamId: string; status: Status; events: Event[] };
export function score(match: Pick<ScoredMatch, 'homeTeamId' | 'awayTeamId' | 'events'>) {
  return match.events.reduce((result, event) => {
    if (event.kind === 'GOAL') {
      if (event.teamId === match.homeTeamId) result.home++;
      if (event.teamId === match.awayTeamId) result.away++;
    }
    return result;
  }, { home: 0, away: 0 });
}
export function assertTransition(from: Status, to: Status) {
  const allowed: Record<Status, Status[]> = { SCHEDULED: ['LIVE', 'CANCELLED'], LIVE: ['FINISHED', 'CANCELLED'], FINISHED: [], CANCELLED: [] };
  ensure(allowed[from].includes(to), 409, 'Transição inválida. Partidas encerradas não podem ser alteradas.');
}
export function assertMembership(member: { teamId: string; startedAt: Date; endedAt: Date | null }, teamId: string, startsAt: Date) {
  ensure(member.teamId === teamId && member.startedAt <= startsAt && (!member.endedAt || member.endedAt > startsAt), 422, 'Jogador não pertencia a essa equipe na data da partida.');
}
export function playerStats(playerId: string, matches: ScoredMatch[]) {
  const totals = { goals: 0, assists: 0, yellowCards: 0, redCards: 0, matchesWithEvents: 0 };
  for (const match of matches.filter(m => m.status === 'FINISHED')) {
    let participated = false;
    for (const event of match.events) {
      if (event.membership?.playerId === playerId && event.kind !== 'NOTE') {
        participated = true;
        if (event.kind === 'GOAL') totals.goals++;
        if (event.kind === 'YELLOW_CARD') totals.yellowCards++;
        if (event.kind === 'RED_CARD') totals.redCards++;
      }
      if (event.kind === 'GOAL' && event.assistant?.playerId === playerId) { totals.assists++; participated = true; }
    }
    if (participated) totals.matchesWithEvents++;
  }
  return totals;
}
