import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { AppLayout } from '../layouts/AppLayout';
import { Login } from '../pages/Login';
import { Dashboard } from '../pages/Dashboard';
import { Teams, TeamDetail, PlayerDetail } from '../pages/Teams';
import { Matches, MatchDetail } from '../pages/Matches';
import { Championships, ChampionshipDetail } from '../pages/Championships';
import { Profile, Help, NotFound } from '../pages/Profile';
function AuthGate() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading full-height">Preparando o campo…</div>;
  return user ? <Outlet /> : <Navigate to="/entrar" replace />;
}
export const router = createBrowserRouter([
  { path: '/entrar', element: <Login /> },
  { element: <AuthGate />, children: [{ element: <AppLayout />, children: [
    { path: '/', element: <Dashboard /> },
    { path: '/equipes', element: <Teams /> },
    { path: '/equipes/:id', element: <TeamDetail /> },
    { path: '/jogadores/:id', element: <PlayerDetail /> },
    { path: '/partidas', element: <Matches /> },
    { path: '/partidas/:id', element: <MatchDetail /> },
    { path: '/campeonatos', element: <Championships /> },
    { path: '/campeonatos/:id', element: <ChampionshipDetail /> },
    { path: '/perfil', element: <Profile /> },
    { path: '/ajuda', element: <Help /> },
    { path: '*', element: <NotFound /> },
  ] }] },
]);
