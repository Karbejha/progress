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
    <div className="min-h-screen w-full flex items-center justify-center p-3 sm:p-6 lg:p-8 relative overflow-hidden bg-[#031814] font-sans selection:bg-[#d4af37]/30 selection:text-[#d4af37]">

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

      {/* Main Luxury Card Container */}
      <div className="w-full max-w-5xl rounded-[28px] sm:rounded-[36px] border border-[#d4af37]/35 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.75)] backdrop-blur-2xl bg-[#05261e]/90 overflow-hidden grid grid-cols-1 lg:grid-cols-12 relative z-10 animate-fadeIn my-auto">

        {/* ======================================================== */}
        {/* RIGHT COLUMN: Institutional Showcase Hero (7 Cols) */}
        {/* ======================================================== */}
        <div className="lg:col-span-7 p-6 sm:p-10 lg:p-12 flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-[#05261e] via-[#072f26] to-[#031814] text-white border-b lg:border-b-0 lg:border-l border-[#d4af37]/25">

          {/* Subtle Ambient Light Corner Glow */}
          <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-bl from-[#d4af37]/15 via-transparent to-transparent pointer-events-none blur-2xl" />

          {/* Top Empty Placeholder for spacing balance */}
          <div className="hidden lg:block h-2" />

          {/* Centered Institutional Branding Section */}
          <div className="my-auto py-6 lg:py-8 text-center flex flex-col items-center justify-center space-y-4 relative z-10">

            {/* Unified Institutional Badge */}
            <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-bold bg-[#0c3e35] text-[#d4af37] border border-[#d4af37]/40 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-[#d4af37] animate-ping" />
              الجمهورية العربية السورية
            </span>

            {/* Emblem Capsule */}
            <div className="relative pt-1">
              <div className="absolute -inset-1.5 rounded-3xl bg-gradient-to-tr from-[#d4af37]/40 via-[#d4af37]/20 to-transparent blur-sm" />
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl sm:rounded-3xl bg-gradient-to-b from-[#0c3e35] to-[#05261e] border-2 border-[#d4af37] flex items-center justify-center p-3.5 sm:p-4 shadow-2xl relative">
                <Image
                  src="/assets/Syrian_logo_icon_gold.svg"
                  alt="شعار الجمهورية العربية السورية"
                  width={68}
                  height={68}
                  className="object-contain drop-shadow-[0_4px_12px_rgba(212,175,55,0.4)] w-auto h-auto"
                  priority
                />
              </div>
            </div>

            {/* Main Institutional Header Titles */}
            <div className="space-y-1.5 max-w-md mx-auto pt-1">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight leading-tight">
                المديرية العامة للموانئ
              </h1>
              <p className="text-xs sm:text-sm font-bold text-[#d4af37] flex items-center justify-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#d4af37] shrink-0" />
                <span>منظومة متابعة الخطط الصباحية والإنجاز اليومي</span>
              </p>

            </div>

          </div>

          {/* Bottom Security / Trust Seal */}
          <div className="pt-4 mt-auto border-t border-white/[0.08] flex items-center justify-center text-[11px] text-[#8daaa2] relative z-10">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="font-semibold text-white/90">بوابة الاتصال الحكومية الموحدة</span>
            </div>
          </div>

        </div>

        {/* ======================================================== */}
        {/* LEFT COLUMN: Modern Executive Login Form Card (5 Cols) */}
        {/* ======================================================== */}
        <div className="lg:col-span-5 p-6 sm:p-8 lg:p-9 flex flex-col justify-between bg-[#f4f3ed] relative">

          <div className="space-y-5">

            {/* Form Header */}
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-[#edece4] border border-[#d2d1c9] text-[#0c3e35] text-xs font-bold mb-1">
                <Lock className="w-3.5 h-3.5 text-[#0c3e35]" />
                <span>الوصول المصرح به</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-[#0c3e35] tracking-tight">
                تسجيل الدخول
              </h2>
              <p className="text-xs text-[#5e736e] font-medium leading-relaxed">
                أدخل بيانات الاعتماد الخاصة بحسابك للوصول إلى المنظومة.
              </p>
            </div>

            {/* Error Message Box */}
            {error && (
              <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200/90 text-red-900 text-xs flex items-start gap-2.5 animate-fadeIn shadow-xs font-medium">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Username / Email Field */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#0c3e35]">
                  اسم المستخدم أو البريد الإلكتروني <span className="text-red-500">*</span>
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
                    className="w-full pl-4 pr-11 py-3.5 rounded-2xl bg-white border border-[#d2d1c9] text-[#0c3e35] text-xs placeholder-[#8daaa2] focus:outline-none focus:border-[#d4af37] focus:ring-4 focus:ring-[#d4af37]/15 transition duration-200 font-medium shadow-2xs group-hover:border-[#0c3e35]/50 disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  <div className="absolute right-3.5 top-3.5 w-5 h-5 flex items-center justify-center text-[#5e736e] group-focus-within:text-[#0c3e35] transition">
                    <UserIcon className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#0c3e35]">
                  كلمة المرور <span className="text-red-500">*</span>
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
                    className="w-full pl-11 pr-11 py-3.5 rounded-2xl bg-white border border-[#d2d1c9] text-[#0c3e35] text-xs placeholder-[#8daaa2] focus:outline-none focus:border-[#d4af37] focus:ring-4 focus:ring-[#d4af37]/15 transition duration-200 font-medium shadow-2xs group-hover:border-[#0c3e35]/50 disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  <div className="absolute right-3.5 top-3.5 w-5 h-5 flex items-center justify-center text-[#5e736e] group-focus-within:text-[#0c3e35] transition">
                    <Lock className="w-4 h-4" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3.5 top-3.5 text-[#5e736e] hover:text-[#0c3e35] p-0.5 rounded-lg hover:bg-black/5 transition cursor-pointer"
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
                  className="w-full py-3.5 sm:py-4 px-5 rounded-2xl bg-gradient-to-r from-[#0c3e35] via-[#0e483e] to-[#05261e] hover:from-[#165b4f] hover:to-[#0c3e35] text-white font-bold text-xs sm:text-[13px] shadow-lg shadow-[#0c3e35]/25 hover:shadow-xl hover:shadow-[#0c3e35]/35 transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2 cursor-pointer border border-[#d4af37]/35 group"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-[#d4af37]" />
                      <span>جاري التحقق والدخول...</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4 text-[#d4af37] group-hover:translate-x-[-2px] transition-transform duration-200" />
                      <span>تسجيل الدخول</span>
                    </>
                  )}
                </button>
              </div>

            </form>

            {/* Help & IT Support Note */}
            <div className="p-3 sm:p-3.5 rounded-2xl bg-[#edece4] border border-[#d2d1c9] text-[10.5px] sm:text-[11px] text-[#5e736e] leading-relaxed">
              <p className="font-semibold text-[#0c3e35] mb-0.5">ملاحظة هامة للمستخدمين:</p>
              في حال تعثر تسجيل الدخول أو الحاجة لتحديث بيانات الحساب، يرجى مراجعة إدارة المنظومة وقسم المعلوماتية.
            </div>

            {/* Server Settings Link for Mobile App */}
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => {
                  setCustomServerUrl(getApiBaseUrl());
                  setShowServerModal(true);
                }}
                className="inline-flex items-center gap-1.5 text-[11px] text-[#5e736e] hover:text-[#0c3e35] transition py-1 px-3 rounded-lg hover:bg-black/5 cursor-pointer font-medium"
              >
                <Server className="w-3.5 h-3.5 text-[#d4af37]" />
                <span>إعدادات اتصال السيرفر</span>
              </button>
            </div>

          </div>

          {/* Institutional Footer */}
          <div className="pt-4 mt-4 border-t border-[#d2d1c9] text-center">
            <p className="text-[10.5px] text-[#5e736e] font-semibold">
              الجمهورية العربية السورية • المديرية العامة للموانئ
            </p>
            <p className="text-[10px] text-[#8daaa2] mt-0.5 font-medium">
              جميع الحقوق محفوظة © {new Date().getFullYear()}
            </p>
          </div>

        </div>

      </div>

      {/* Server Config Modal */}
      {showServerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md rounded-2xl bg-[#ffffff] border border-[#d4af37]/40 shadow-2xl p-6 text-right space-y-4">
            <div className="flex items-center justify-between border-b border-[#d2d1c9] pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-[#0c3e35]/10 text-[#0c3e35]">
                  <Server className="w-5 h-5 text-[#d4af37]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#0c3e35]">عنوان خادم المنظومة (Server URL)</h3>
                  <p className="text-[11px] text-[#5e736e]">حدد عنوان الـ IP أو الدومين للربط مع قاعدة البيانات</p>
                </div>
              </div>
              <button
                onClick={() => setShowServerModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[#0c3e35]">رابط الخادم المباشر (API URL)</label>
              <input
                type="text"
                value={customServerUrl}
                onChange={(e) => setCustomServerUrl(e.target.value)}
                placeholder="مثال: http://192.168.1.50:4000 أو https://api.ports.gov.sy"
                className="w-full px-3.5 py-2.5 text-xs font-mono rounded-xl border border-[#d2d1c9] focus:border-[#0c3e35] focus:ring-1 focus:ring-[#0c3e35] outline-none text-left"
                dir="ltr"
              />
              <p className="text-[10px] text-[#5e736e] leading-relaxed">
                * عند استخدام التطبيق على الهاتف المحمول، أدخل عنوان IP السيرفر المحلي أو الدومين الخارجي (وليس localhost).
              </p>
            </div>

            {serverSavedSuccess && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-center gap-2">
                <Check className="w-4 h-4 text-emerald-600" />
                تم حفظ عنوان السيرفر بنجاح!
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowServerModal(false)}
                className="px-4 py-2 rounded-xl border border-[#d2d1c9] text-xs font-semibold text-[#5e736e] hover:bg-gray-50 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveServerUrl}
                className="px-5 py-2 rounded-xl bg-[#0c3e35] text-white text-xs font-bold hover:bg-[#165b4f] transition shadow-md cursor-pointer"
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
