'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { User } from '../types';
import { api } from '../services/api';
import { Header } from '../components/Header';
import { LoginForm } from '../components/LoginForm';
import { ExecutiveDashboard } from '../components/ExecutiveDashboard';
import { DirectorPortal } from '../components/DirectorPortal';
import { TodosView } from '../components/TodosView';
import { initNotificationService } from '../lib/notifications';
import { initStatusBar } from '../lib/statusBar';
import { getSocket } from '../lib/socket';

export default function Home() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'DASHBOARD' | 'TODOS'>('DASHBOARD');

  useEffect(() => {
    initStatusBar();
    initNotificationService();
    initAuth();

    const handleNav = (e: any) => {
      if (e.detail?.view) {
        setActiveView(e.detail.view);
      }
    };
    window.addEventListener('ports:navigate_view', handleNav);
    return () => window.removeEventListener('ports:navigate_view', handleNav);
  }, []);

  useEffect(() => {
    const socket = currentUser ? getSocket() : null;
    const endSession = () => {
      api.logout();
      setCurrentUser(null);
    };
    const handleStatusChange = (payload: { userId: string; isActive: boolean }) => {
      if (payload.userId === currentUser?.id && !payload.isActive) endSession();
    };
    window.addEventListener('ports:session_expired', endSession);
    socket?.on('user:status-changed', handleStatusChange);
    return () => {
      window.removeEventListener('ports:session_expired', endSession);
      socket?.off('user:status-changed', handleStatusChange);
    };
  }, [currentUser?.id]);

  const initAuth = async () => {
    try {
      setLoading(true);
      const savedToken = api.getToken();
      const savedUser = api.getCurrentUser();
      
      if (savedToken && savedUser) {
        // Validate with backend
        try {
          const freshUser = await api.getMe();
          setCurrentUser(freshUser);
          api.setCurrentUser(freshUser);
        } catch {
          // Token expired
          api.logout();
          setCurrentUser(null);
        }
      } else {
        setCurrentUser(null);
      }
    } catch (err) {
      console.error('Authentication check error', err);
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
  };

  const handleLogout = () => {
    api.logout();
    setCurrentUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#05261e] text-white space-y-4 font-sans">
        <div className="w-14 h-14 rounded-2xl bg-[#0c3e35] border border-[#d4af37] flex items-center justify-center p-2 shadow-xl animate-bounce">
          <Image
            src="/assets/Syrian_logo_icon_gold.svg"
            alt="المديرية العامة للموانئ"
            width={40}
            height={40}
            className="object-contain w-auto h-auto"
          />
        </div>
        <p className="text-sm font-bold text-[#d4af37]">
          جاري التحقق من جلسة الدخول...
        </p>
      </div>
    );
  }

  // If not logged in, render the official Login screen
  if (!currentUser) {
    return <LoginForm onLoginSuccess={handleLoginSuccess} />;
  }

  const isExecutiveOrObserver =
    currentUser.role === 'GENERAL_DIRECTOR' ||
    currentUser.role === 'ASSISTANT_DIRECTOR' ||
    currentUser.role === 'OBSERVER';

  return (
    <div className="min-h-screen flex flex-col bg-[#f4f3ed] text-[#0c3e35] font-sans">
      
      {/* Navigation Header */}
      <Header
        currentUser={currentUser}
        onLogout={handleLogout}
        activeView={activeView}
        onViewChange={setActiveView}
      />

      {/* Main Content View based on Active View and Role */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-8">
        <div className={activeView === 'TODOS' ? 'block' : 'hidden'}>
          <TodosView
            currentUser={currentUser}
            onBackToDashboard={() => setActiveView('DASHBOARD')}
          />
        </div>
        <div className={activeView === 'DASHBOARD' ? 'block' : 'hidden'}>
          {isExecutiveOrObserver ? (
            <ExecutiveDashboard currentUser={currentUser} />
          ) : (
            <DirectorPortal currentUser={currentUser} />
          )}
        </div>
      </main>

    </div>
  );
}
