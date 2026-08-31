'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { api } from '../services/api';
import { User } from '../types';
import { Lock, User as UserIcon, Eye, EyeOff, LogIn, AlertCircle, Sparkles, Shield, ChevronDown, ChevronUp } from 'lucide-react';

interface LoginFormProps {
  onLoginSuccess: (user: User) => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onLoginSuccess }) => {
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDemoDrawer, setShowDemoDrawer] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameOrEmail.trim() || !password) {
      setError('يرجى إدخال اسم المستخدم وكلمة المرور');
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
      setError(err.message || 'اسم المستخدم أو كلمة المرور غير صحيحة');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = (user: string, pass: string) => {
    setUsernameOrEmail(user);
    setPassword(pass);
    setError(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#f4f3ed] font-sans">
      <div className="w-full max-w-md space-y-6">

        {/* Main Login Card */}
        <div className="bg-[#edece4] border border-[#d2d1c9] rounded-[28px] shadow-brand-card overflow-hidden">

          {/* Header Banner */}
          <div className="bg-[#05261e] p-8 text-center text-white border-b border-[#0c3e35] relative">
            <div className="w-16 h-16 rounded-2xl bg-[#0c3e35] border border-[#d4af37] mx-auto mb-3 flex items-center justify-center p-2.5 shadow-md">
              <Image
                src="/assets/Syrian_logo_icon_gold.svg"
                alt="شعار المديرية العامة للموانئ"
                width={44}
                height={44}
                className="object-contain"
              />
            </div>
            <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-[#0c3e35] text-[#d4af37] border border-[#d4af37]/30 inline-block mb-1">
              الجمهورية العربية السورية
            </span>
            <h2 className="text-xl font-black text-white tracking-tight mt-1">
              المديرية العامة للموانئ
            </h2>
            <p className="text-xs text-[#8daaa2] mt-0.5 font-medium">
              منظومة متابعة الخطط والإنجاز اليومي
            </p>
          </div>

          {/* Form Content */}
          <form onSubmit={handleSubmit} className="p-7 space-y-5">

            {error && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2 animate-fadeIn font-medium">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Username Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#0c3e35]">
                اسم المستخدم أو البريد الإلكتروني:
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="مثال: director_general أو inspection"
                  value={usernameOrEmail}
                  onChange={(e) => setUsernameOrEmail(e.target.value)}
                  className="w-full pl-4 pr-11 py-3 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] text-xs placeholder-[#8daaa2] focus:outline-none focus:border-[#0c3e35] transition font-medium"
                />
                <UserIcon className="w-4 h-4 text-[#5e736e] absolute right-3.5 top-3.5" />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#0c3e35]">
                كلمة المرور:
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-11 py-3 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] text-xs placeholder-[#8daaa2] focus:outline-none focus:border-[#0c3e35] transition font-medium"
                />
                <Lock className="w-4 h-4 text-[#5e736e] absolute right-3.5 top-3.5" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3.5 top-3.5 text-[#5e736e] hover:text-[#0c3e35] transition cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-xl bg-[#0c3e35] hover:bg-[#072923] text-white font-bold text-xs shadow-md transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              <LogIn className="w-4 h-4" />
              <span>{loading ? 'جاري التحقق والدخول...' : 'تسجيل الدخول إلى المنظومة'}</span>
            </button>

          </form>

          {/* Quick Demo Helper Drawer */}
          <div className="border-t border-[#d2d1c9] bg-white p-4">
            <button
              type="button"
              onClick={() => setShowDemoDrawer(!showDemoDrawer)}
              className="w-full flex items-center justify-between text-xs font-bold text-[#5e736e] hover:text-[#0c3e35] transition cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#d4af37]" />
                بيانات الحسابات التجريبية السريعة
              </span>
              {showDemoDrawer ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showDemoDrawer && (
              <div className="mt-3 pt-3 border-t border-[#e5e4dc] space-y-2 text-xs animate-fadeIn">
                <div
                  onClick={() => handleQuickFill('director_general', 'admin123')}
                  className="p-2.5 rounded-xl bg-[#f4f3ed] hover:bg-[#edece4] border border-[#d2d1c9] cursor-pointer flex items-center justify-between transition"
                >
                  <div>
                    <span className="font-bold text-[#0c3e35] block">المدير العام للموانئ</span>
                    <span className="text-[11px] text-[#5e736e]">اسم المستخدم: <code>director_general</code></span>
                  </div>
                  <span className="text-[11px] font-bold text-[#d4af37] bg-[#05261e] px-2.5 py-1 rounded-lg">
                    تعبئة
                  </span>
                </div>

                <div
                  onClick={() => handleQuickFill('dir_inspection', 'password123')}
                  className="p-2.5 rounded-xl bg-[#f4f3ed] hover:bg-[#edece4] border border-[#d2d1c9] cursor-pointer flex items-center justify-between transition"
                >
                  <div>
                    <span className="font-bold text-[#0c3e35] block">مديرية التفتيش البحري</span>
                    <span className="text-[11px] text-[#5e736e]">اسم المستخدم: <code>dir_inspection</code></span>
                  </div>
                  <span className="text-[11px] font-bold text-[#0c3e35] bg-[#edece4] border border-[#d2d1c9] px-2.5 py-1 rounded-lg">
                    تعبئة
                  </span>
                </div>

                <div
                  onClick={() => handleQuickFill('dir_ports', 'password123')}
                  className="p-2.5 rounded-xl bg-[#f4f3ed] hover:bg-[#edece4] border border-[#d2d1c9] cursor-pointer flex items-center justify-between transition"
                >
                  <div>
                    <span className="font-bold text-[#0c3e35] block">مديرية شؤون الموانئ</span>
                    <span className="text-[11px] text-[#5e736e]">اسم المستخدم: <code>dir_ports</code></span>
                  </div>
                  <span className="text-[11px] font-bold text-[#0c3e35] bg-[#edece4] border border-[#d2d1c9] px-2.5 py-1 rounded-lg">
                    تعبئة
                  </span>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Footer Note */}
        <p className="text-center text-[11px] text-[#5e736e] font-medium">
          الجمهورية العربية السورية • المديرية العامة للموانئ © 2026
        </p>

      </div>
    </div>
  );
};
