'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { api, getApiBaseUrl, setCustomApiUrl } from '../services/api';
import { forceReconnectSocket } from '../lib/socket';
import { User } from '../types';
import {
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  LogIn,
  AlertCircle,
  Sparkles,
  Loader2,
  Server,
  Check,
} from 'lucide-react';

interface LoginFormProps {
  onLoginSuccess: (user: User) => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onLoginSuccess }) => {
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showServerModal, setShowServerModal] = useState(false);
  const [customServerUrl, setCustomServerUrl] = useState('');
  const [serverSavedSuccess, setServerSavedSuccess] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCustomServerUrl(getApiBaseUrl());
    }
  }, []);

  const handleSaveServerUrl = () => {
    if (customServerUrl && customServerUrl.trim()) {
      setCustomApiUrl(customServerUrl.trim());
      forceReconnectSocket();
      setServerSavedSuccess(true);
      setTimeout(() => {
        setServerSavedSuccess(false);
        setShowServerModal(false);
      }, 1200);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameOrEmail.trim() || !password) {
      setError('يرجى إدخال اسم المستخدم أو البريد الإلكتروني وكلمة المرور');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await api.login({
        usernameOrEmail: usernameOrEmail.trim(),
        password,
      });
      onLoginSuccess(res.user);
    } catch (err: any) {
      if (err.message === 'Failed to fetch' || err.message?.includes('NetworkError') || err.message?.includes('Load failed')) {
        setError('تعذر الاتصال بالخادم. يرجى التأكد من تشغيل السيرفر وكتابة عنوان IP الصحيح في (إعدادات اتصال السيرفر) بالأسفل.');
      } else {
        setError(err.message || 'اسم المستخدم أو كلمة المرور غير صحيحة، يرجى المحاولة مجدداً');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] w-full flex flex-col justify-center items-center py-6 px-3.5 sm:p-6 lg:p-8 relative overflow-x-hidden overflow-y-auto bg-[#031814] font-sans selection:bg-[#d4af37]/30 selection:text-[#d4af37]">

      {/* Background Lighting & Nautical Patterns */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Ambient Radial Lights */}
        <div className="absolute -top-36 -right-36 w-[650px] h-[650px] rounded-full bg-gradient-to-br from-[#0c3e35]/70 via-[#05261e]/40 to-transparent blur-3xl opacity-80" />
        <div className="absolute -bottom-40 -left-40 w-[750px] h-[750px] rounded-full bg-gradient-to-tr from-[#0c3e35]/80 via-[#d4af37]/15 to-transparent blur-3xl opacity-70" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[950px] h-[950px] rounded-full bg-radial from-[#0c3e35]/20 via-transparent to-transparent blur-2xl" />

        {/* Decorative Grid Mesh */}
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.035] text-[#d4af37]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="nautical-grid" width="44" height="44" patternUnits="userSpaceOnUse">
              <path d="M 44 0 L 0 0 0 44" fill="none" stroke="currentColor" strokeWidth="0.8" />
              <circle cx="22" cy="22" r="1" fill="currentColor" opacity="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#nautical-grid)" />
        </svg>

        {/* Ambient bottom golden sheen */}
        <div className="absolute bottom-0 inset-x-0 h-40 opacity-[0.08] bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-[#d4af37] via-transparent to-transparent" />
      </div>

      {/* Main Streamlined Luxury Card */}
      <div className="w-full max-w-[440px] rounded-[32px] border border-[#d4af37]/35 shadow-[0_25px_70px_-15px_rgba(0,0,0,0.85)] backdrop-blur-2xl bg-gradient-to-b from-[#062c23]/95 via-[#041f19]/95 to-[#02130f]/95 p-6 sm:p-8 text-white relative z-10 animate-fadeIn my-auto space-y-6">

        {/* Ambient Corner Glow */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-[#d4af37]/15 via-transparent to-transparent pointer-events-none blur-2xl rounded-tr-[32px]" />

        {/* Header Branding */}
        <div className="text-center flex flex-col items-center justify-center space-y-3 relative z-10">

          {/* Sovereign Country Pill */}
          <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-bold bg-[#0c3e35]/80 text-[#d4af37] border border-[#d4af37]/30 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-[#d4af37] animate-ping" />
            الجمهورية العربية السورية
          </span>

          {/* Syrian Emblem Capsule */}
          <div className="relative pt-0.5">
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-tr from-[#d4af37]/35 via-[#d4af37]/15 to-transparent blur-xs" />
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-b from-[#0c3e35] to-[#05261e] border-2 border-[#d4af37] flex items-center justify-center p-3 shadow-xl relative">
              <Image
                src="/assets/Syrian_logo_icon_gold.svg"
                alt="شعار الجمهورية العربية السورية"
                width={56}
                height={56}
                className="object-contain drop-shadow-[0_4px_10px_rgba(212,175,55,0.35)] w-11 h-11"
                priority
              />
            </div>
          </div>

          {/* Directorate Title */}
          <div className="space-y-1">
            <h1 className="text-2xl font-black text-white tracking-tight leading-tight">
              المديرية العامة للموانئ
            </h1>
            <p className="text-xs font-semibold text-[#d4af37] flex items-center justify-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#d4af37] shrink-0" />
              <span>منظومة متابعة الخطط الصباحية والإنجاز اليومي</span>
            </p>
          </div>

        </div>

        {/* Error Message */}
        {error && (
          <div className="p-3 rounded-2xl bg-red-950/70 border border-red-500/50 text-red-200 text-xs flex items-start gap-2.5 animate-fadeIn shadow-md font-medium">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4 relative z-10">

          {/* Username Field */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-white/90">
              اسم المستخدم <span className="text-[#d4af37]">*</span>
            </label>
            <div className="relative group">
              <input
                type="text"
                required
                autoComplete="username"
                placeholder="اسم المستخدم أو البريد الإلكتروني"
                value={usernameOrEmail}
                onChange={(e) => setUsernameOrEmail(e.target.value)}
                disabled={loading}
                className="w-full pl-4 pr-11 py-3.5 rounded-2xl bg-black/40 border border-white/15 text-white text-xs sm:text-sm placeholder-[#8daaa2]/50 focus:outline-none focus:border-[#d4af37] focus:ring-4 focus:ring-[#d4af37]/15 transition duration-200 font-medium shadow-inner group-hover:border-[#d4af37]/40 disabled:opacity-60"
              />
              <div className="absolute right-3.5 top-3.5 w-5 h-5 flex items-center justify-center text-[#8daaa2] group-focus-within:text-[#d4af37] transition">
                <UserIcon className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Password Field */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-white/90">
              كلمة المرور <span className="text-[#d4af37]">*</span>
            </label>
            <div className="relative group">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full pl-11 pr-11 py-3.5 rounded-2xl bg-black/40 border border-white/15 text-white text-xs sm:text-sm placeholder-[#8daaa2]/50 focus:outline-none focus:border-[#d4af37] focus:ring-4 focus:ring-[#d4af37]/15 transition duration-200 font-medium shadow-inner group-hover:border-[#d4af37]/40 disabled:opacity-60"
              />
              <div className="absolute right-3.5 top-3.5 w-5 h-5 flex items-center justify-center text-[#8daaa2] group-focus-within:text-[#d4af37] transition">
                <Lock className="w-4 h-4" />
              </div>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3.5 top-3.5 text-[#8daaa2] hover:text-[#d4af37] p-0.5 rounded-lg hover:bg-white/10 transition cursor-pointer"
                tabIndex={-1}
                title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                aria-label="إظهار وإخفاء كلمة المرور"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Action Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 sm:py-4 px-5 rounded-2xl bg-gradient-to-r from-[#d4af37] via-[#e2c15c] to-[#c5a059] hover:brightness-105 active:scale-[0.98] text-[#031814] font-black text-xs sm:text-sm shadow-lg shadow-[#d4af37]/20 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer border border-[#f5e3a3]/50 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none group"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#031814]" />
                  <span>جاري التحقق والدخول...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4 text-[#031814] group-hover:translate-x-[-2px] transition-transform duration-200" />
                  <span>تسجيل الدخول</span>
                </>
              )}
            </button>
          </div>

        </form>

        {/* Minimal Actions & Support Row */}
        <div className="flex items-center justify-between text-[11px] text-[#8daaa2] pt-2 border-t border-white/10 relative z-10">
          <button
            type="button"
            onClick={() => {
              setCustomServerUrl(getApiBaseUrl());
              setShowServerModal(true);
            }}
            className="inline-flex items-center gap-1.5 hover:text-[#d4af37] transition cursor-pointer"
          >
            <Server className="w-3.5 h-3.5 text-[#d4af37]" />
            <span>إعدادات السيرفر</span>
          </button>

          <span className="text-[#8daaa2]/60 text-[10.5px]">
            الدعم الفني: قسم المعلوماتية
          </span>
        </div>

        {/* Subtle Copyright */}
        <div className="text-center pt-1 text-[10px] text-[#8daaa2]/50 font-medium">
          المديرية العامة للموانئ © {new Date().getFullYear()}
        </div>

      </div>

      {/* Server Config Modal */}
      {showServerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-md rounded-2xl bg-[#062921] border border-[#d4af37]/40 shadow-2xl p-5 sm:p-6 text-right space-y-4 text-white">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#0c3e35] text-[#d4af37] border border-[#d4af37]/30">
                  <Server className="w-5 h-5 text-[#d4af37]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">عنوان خادم المنظومة (Server URL)</h3>
                  <p className="text-[11px] text-[#8daaa2]">حدد عنوان الـ IP أو الدومين للربط مع السيرفر</p>
                </div>
              </div>
              <button
                onClick={() => setShowServerModal(false)}
                className="text-white/50 hover:text-white p-1 rounded-lg text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-white/90">رابط الخادم المباشر (API URL)</label>
              <input
                type="text"
                value={customServerUrl}
                onChange={(e) => setCustomServerUrl(e.target.value)}
                placeholder="مثال: http://192.168.1.50:4000 أو https://api.ports.gov.sy"
                className="w-full px-3.5 py-2.5 text-xs font-mono rounded-xl bg-black/40 border border-white/15 focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20 outline-none text-left text-white"
                dir="ltr"
              />
              <p className="text-[10.5px] text-[#8daaa2] leading-relaxed">
                * عند استخدام التطبيق على الهاتف المحمول، أدخل عنوان IP السيرفر المحلي أو الدومين الخارجي (وليس localhost).
              </p>
            </div>

            {serverSavedSuccess && (
              <div className="p-2.5 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 text-xs font-semibold flex items-center justify-center gap-2">
                <Check className="w-4 h-4 text-emerald-400" />
                تم حفظ عنوان السيرفر بنجاح!
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowServerModal(false)}
                className="px-4 py-2 rounded-xl border border-white/15 text-xs font-semibold text-[#8daaa2] hover:text-white hover:bg-white/5 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveServerUrl}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#d4af37] to-[#c5a059] text-[#031814] text-xs font-black hover:brightness-105 transition shadow-md cursor-pointer"
              >
                حفظ وتطبيق
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
