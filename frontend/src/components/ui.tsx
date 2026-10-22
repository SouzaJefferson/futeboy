import { useEffect, useRef, useState, createContext, useContext, type ReactNode, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, ChevronRight, LoaderCircle, MapPin, Plus, Search, Shield, Trophy, X, AlertCircle } from 'lucide-react';
import type { Team, Match, Player, Standing } from '../types';

export const date = (value: string, options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' }) => new Intl.DateTimeFormat('pt-BR', options).format(new Date(value));
export const time = (value: string) => date(value, { hour: '2-digit', minute: '2-digit' });
export const datetime = (value: string) => { const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
export const iso = (value: string) => new Date(value).toISOString();
export const positions: Record<string, string> = { GOALKEEPER: 'Goleiro', DEFENDER: 'Zagueiro', FULLBACK: 'Lateral', MIDFIELDER: 'Meio-campo', FORWARD: 'Atacante' };
export const roles: Record<string, string> = { ADMIN: 'Administrador', ORGANIZER: 'Organizador', PLAYER: 'Jogador' };
export function Brand() { return <span className="brand"><span className="brand-icon">f<span>↗</span></span>futeboy<span className="brand-dot">.</span></span>; }
export function Badge({ team, size = 'md' }: { team: Team; size?: 'sm' | 'md' | 'lg' }) {
  return <span className={`team-badge badge-${size}`} style={{ '--team-color': team.color } as React.CSSProperties}>{team.crestUrl ? <img src={team.crestUrl} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} /> : <Shield strokeWidth={1.4} />}<span>{team.shortName}</span></span>;
}
export function Avatar({ name, photoUrl, size = '' }: { name: string; photoUrl?: string | null; size?: string }) {
  return <span className={`avatar ${size}`}>{photoUrl ? <img src={photoUrl} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} /> : null}<span>{name.split(' ').map(p => p[0]).slice(0, 2).join('')}</span></span>;
}
export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}<span className="text-green">.</span></h1><p>{description}</p></div>{action}</div>;
}
export function AddButton({ children, onClick }: { children: ReactNode; onClick: () => void }) { return <button className="button primary" onClick={onClick}><Plus size={18} />{children}</button>; }
export function SectionTitle({ title, subtitle, link, to }: { title: string; subtitle?: string; link?: string; to?: string }) { return <div className="section-title"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{to && <Link className="text-link" to={to}>{link || 'Ver todos'}<ArrowUpRight size={16} /></Link>}</div>; }
export function SearchBox({ value, onChange, placeholder = 'Buscar…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) { return <label className="search-box"><Search size={18} /><input aria-label={placeholder} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />{value && <button aria-label="Limpar busca" onClick={() => onChange('')}><X size={16} /></button>}</label>; }
export function Empty({ title = 'Nada por aqui, por enquanto', description = 'Os registros aparecerão aqui quando forem cadastrados.', action }: { title?: string; description?: string; action?: ReactNode }) { return <div className="empty"><span><Trophy size={27} /></span><h3>{title}</h3><p>{description}</p>{action}</div>; }
export function ResourceState({ loading, error, reload, children }: { loading: boolean; error: string; reload: () => void; children: ReactNode }) {
  if (loading) return <div className="loading" role="status"><LoaderCircle className="spin" size={26} /><span>Carregando o jogo…</span></div>;
  if (error) return <div className="error-state" role="alert"><AlertCircle /><h3>Não foi possível carregar</h3><p>{error}</p><button className="button secondary" onClick={reload}>Tentar novamente</button></div>;
  return children;
}
const statusLabels = { SCHEDULED: 'Agendada', LIVE: 'Ao vivo', FINISHED: 'Encerrada', CANCELLED: 'Cancelada' };
export function Status({ status }: { status: Match['status'] }) { return <span className={`status status-${status.toLowerCase()}`}>{status === 'LIVE' && <i />}{statusLabels[status]}</span>; }
export function MatchCard({ match, compact = false }: { match: Match; compact?: boolean }) {
  const scheduled = match.status === 'SCHEDULED';
  return <Link to={`/partidas/${match.id}`} className={`match-card ${compact ? 'compact' : ''}`}><div className="match-card-top"><span>{match.championship?.name || 'Amistoso'}{match.round ? ` · ${match.round}ª rodada` : ''}</span><Status status={match.status} /></div><div className="match-duel"><div className="match-team"><Badge team={match.homeTeam} /><strong>{match.homeTeam.name}</strong><small>Mandante</small></div><div className="match-score">{scheduled ? <><strong className="scheduled-time">{time(match.startsAt)}</strong><small>{date(match.startsAt)}</small></> : <><strong>{match.score.home}<span>:</span>{match.score.away}</strong><small>{match.status === 'LIVE' ? 'Em andamento' : date(match.startsAt)}</small></>}</div><div className="match-team"><Badge team={match.awayTeam} /><strong>{match.awayTeam.name}</strong><small>Visitante</small></div></div><div className="match-card-bottom"><span><MapPin size={13} />{match.location}</span><ChevronRight size={16} /></div></Link>;
}
export function StandingsTable({ rows }: { rows: Standing[] }) {
  if (!rows.length) return <Empty title="As inscrições estão abertas" description="Adicione equipes para começar a classificação." />;
  return <div className="table-scroll"><table className="standings"><thead><tr><th>POS</th><th>Equipe</th><th>PTS</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th></tr></thead><tbody>{rows.map((row, i) => <tr key={row.team.id}><td><span className={i === 0 ? 'rank first' : 'rank'}>{i + 1}</span></td><td><Link to={`/equipes/${row.team.id}`} className="team-cell"><Badge team={row.team} size="sm" /><strong>{row.team.name}</strong></Link></td><td className="points">{row.points}</td><td>{row.played}</td><td>{row.won}</td><td>{row.drawn}</td><td>{row.lost}</td><td>{row.goalsFor}</td><td>{row.goalsAgainst}</td><td>{row.goalDifference > 0 ? '+' : ''}{row.goalDifference}</td></tr>)}</tbody></table></div>;
}
export function Scorers({ players, limit = 5 }: { players: Player[]; limit?: number }) {
  const ranked = [...players].filter(p => p.stats.goals > 0).sort((a, b) => b.stats.goals - a.stats.goals || b.stats.assists - a.stats.assists || a.name.localeCompare(b.name)).slice(0, limit);
  if (!ranked.length) return <Empty title="A rede ainda não balançou" description="A artilharia aparece após as primeiras partidas finalizadas." />;
  return <div className="scorers">{ranked.map((player, index) => <Link to={`/jogadores/${player.id}`} className="scorer" key={player.id}><span className="scorer-rank">{String(index + 1).padStart(2, '0')}</span><Avatar name={player.name} photoUrl={player.photoUrl} /><span className="scorer-name"><strong>{player.nickname || player.name}</strong><small>{player.memberships.find(m => !m.endedAt)?.team?.name || 'Sem equipe'}</small></span><span className="scorer-goals"><strong>{player.stats.goals}</strong><small>gols</small></span></Link>)}</div>;
}

type Toast = { message: string; error: boolean } | null;
const ToastContext = createContext<(message: string, error?: boolean) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast>(null);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(null), 5000); return () => clearTimeout(timer); } }, [toast]);
  return <ToastContext.Provider value={(message, error = false) => setToast({ message, error })}>{children}{toast && <div role={toast.error ? 'alert' : 'status'} className={`toast ${toast.error ? 'toast-error' : ''}`}>{toast.error ? <AlertCircle size={20} /> : <Check size={20} />}{toast.message}<button aria-label="Fechar aviso" onClick={() => setToast(null)}><X size={16} /></button></div>}</ToastContext.Provider>;
}
export const useToast = () => useContext(ToastContext);
export function Modal({ title, description, children, onClose }: { title: string; description?: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="modal" aria-labelledby="modal-title" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal-inner"><div className="modal-heading"><div><h2 id="modal-title">{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" aria-label="Fechar" onClick={onClose}><X size={22} /></button></div>{children}</div></dialog>;
}
export type Values = Record<string, string>;
export type Field = { name: string; label: string; type?: string; required?: boolean; options?: { value: string; label: string }[]; min?: string | number; max?: string | number; maxLength?: number; hint?: string; wide?: boolean; disabled?: boolean };
export function FormDialog({ title, description, fields, initial = {}, onSave, onClose, submit = 'Salvar' }: { title: string; description?: string; fields: Field[] | ((values: Values) => Field[]); initial?: Values; onSave: (values: Values) => Promise<void>; onClose: () => void; submit?: string }) {
  const [values, setValues] = useState<Values>(initial);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const resolved = typeof fields === 'function' ? fields(values) : fields;
  async function save(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { await onSave(values); onClose(); } catch (e) { setError(e instanceof Error ? e.message : 'Erro ao salvar.'); setBusy(false); } }
  return <Modal title={title} description={description} onClose={() => { if (!busy) onClose(); }}><form onSubmit={save}><div className="form-grid">{resolved.map(field => <label key={field.name} className={`field ${field.wide ? 'field-wide' : ''}`}><span>{field.label}{field.required && <span className="required"> *</span>}</span>{field.options ? <select disabled={busy || field.disabled} required={field.required} value={values[field.name] ?? ''} onChange={e => setValues(v => ({ ...v, [field.name]: e.target.value }))}><option value="">Selecione…</option>{field.options.map(o => <option value={o.value} key={o.value}>{o.label}</option>)}</select> : field.type === 'textarea' ? <textarea rows={3} disabled={busy} required={field.required} maxLength={field.maxLength ?? 1000} value={values[field.name] ?? ''} onChange={e => setValues(v => ({ ...v, [field.name]: e.target.value }))} /> : <input disabled={busy || field.disabled} type={field.type || 'text'} required={field.required} min={field.min} max={field.max} maxLength={field.maxLength ?? 100} value={values[field.name] ?? ''} onChange={e => setValues(v => ({ ...v, [field.name]: e.target.value }))} />}{field.hint && <small>{field.hint}</small>}</label>)}</div>{error && <div className="form-error" role="alert"><AlertCircle size={17} />{error}</div>}<div className="modal-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancelar</button><button className="button primary" disabled={busy}>{busy && <LoaderCircle className="spin" size={16} />}{busy ? 'Salvando…' : submit}</button></div></form></Modal>;
}
export function ConfirmButton({ label, title, description, onConfirm, className = 'button danger', children }: { label: string; title: string; description: string; onConfirm: () => Promise<void>; className?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <><button className={className} onClick={() => { setError(''); setOpen(true); }}>{children}{label}</button>{open && <Modal title={title} description={description} onClose={() => { if (!busy) setOpen(false); }}>{error && <div className="form-error" role="alert">{error}</div>}<div className="modal-actions"><button className="button secondary" disabled={busy} onClick={() => setOpen(false)}>Voltar</button><button className="button primary" disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(); setOpen(false); } catch (e) { setError(e instanceof Error ? e.message : 'Falha na operação.'); } finally { setBusy(false); } }}>{busy ? 'Aguarde…' : 'Confirmar'}</button></div></Modal>}</>;
}
