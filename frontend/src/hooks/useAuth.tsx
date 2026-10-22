import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { User } from '../types';
import { api, send } from '../services/api';
type Auth = { user: User | null; loading: boolean; setUser: (user: User | null) => void; logout: () => Promise<void> };
const AuthContext = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api<User>('/auth/me').then(setUser).catch(() => setUser(null)).finally(() => setLoading(false)); }, []);
  async function logout() { await send('/auth/logout', 'POST'); setUser(null); }
  return <AuthContext.Provider value={{ user, loading, setUser, logout }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider ausente.');
  return context;
}
export function canManage(user: User | null, ownerId?: string) { return !!user && (user.role === 'ADMIN' || (user.role === 'ORGANIZER' && user.id === ownerId)); }
export function canManageTeam(user: User | null, team: { ownerId: string; managers?: { userId: string }[] }) {
  return canManage(user, team.ownerId) || !!(user?.role === 'ORGANIZER' && team.managers?.some(m => m.userId === user.id));
}
