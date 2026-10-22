import { score, type ScoredMatch } from '../matches/domain.js';
export function standings<T extends { id: string; name: string }>(teams: T[], matches: ScoredMatch[]) {
  const rows = new Map(teams.map(team => [team.id, { team, points: 0, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 }]));
  for (const match of matches.filter(m => m.status === 'FINISHED')) {
    const home = rows.get(match.homeTeamId), away = rows.get(match.awayTeamId);
    if (!home || !away) continue;
    const result = score(match);
    home.played++; away.played++;
    home.goalsFor += result.home; home.goalsAgainst += result.away;
    away.goalsFor += result.away; away.goalsAgainst += result.home;
    if (result.home > result.away) { home.won++; home.points += 3; away.lost++; }
    else if (result.home < result.away) { away.won++; away.points += 3; home.lost++; }
    else { home.drawn++; away.drawn++; home.points++; away.points++; }
  }
  return [...rows.values()].map(row => ({ ...row, goalDifference: row.goalsFor - row.goalsAgainst }))
    .sort((a, b) => b.points - a.points || b.won - a.won || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.team.name.localeCompare(b.team.name, 'pt-BR'));
}
/** Método circular: cada equipe enfrenta todas as outras uma vez, com folgas para número ímpar. */
export function roundRobin(teamIds: string[]) {
  const rotation: (string | null)[] = [...teamIds];
  if (rotation.length % 2) rotation.push(null);
  const fixtures: { homeTeamId: string; awayTeamId: string; round: number }[] = [];
  for (let round = 1; round < rotation.length; round++) {
    for (let i = 0; i < rotation.length / 2; i++) {
      const first = rotation[i], second = rotation[rotation.length - 1 - i];
      if (first && second) fixtures.push({ homeTeamId: round % 2 ? first : second, awayTeamId: round % 2 ? second : first, round });
    }
    rotation.splice(1, 0, rotation.pop()!);
  }
  return fixtures;
}
