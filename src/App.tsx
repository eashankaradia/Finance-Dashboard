import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { BottomNav } from './components/layout/BottomNav';
import { LoadingSpinner } from './components/ui/LoadingSpinner';
import { LoginForm } from './components/auth/LoginForm';
import { DashboardPage } from './pages/DashboardPage';
import { PotsPage } from './pages/PotsPage';
import { SharesPage } from './pages/SharesPage';
import { CreditCardsPage } from './pages/CreditCardsPage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <LoadingSpinner fullScreen message="Loading..." />;
  if (!session) return <LoginForm />;

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/pots" element={<PotsPage />} />
          <Route path="/shares" element={<SharesPage />} />
          <Route path="/cards" element={<CreditCardsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}
