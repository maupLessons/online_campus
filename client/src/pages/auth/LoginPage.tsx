import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuthStore } from '../../store/authStore';
import { loginSchema, type LoginFormData } from '../../schemas/authSchema';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../../components/LanguageSwitcher';

export default function LoginPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const {
    login: doLogin,
    isAuthenticated,
    isAuthChecked,
    isLoading,
    error,
  } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      login: '',
      password: '',
    },
  });

  useEffect(() => {
    if (isAuthChecked && isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthChecked, isAuthenticated, navigate]);

  const onSubmit = async (values: LoginFormData) => {
    try {
      await doLogin(values.login, values.password);
      navigate('/dashboard');
    } catch {
      // помилка вже обробляється в authStore
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 bg-cover bg-no-repeat"
      style={{
        backgroundImage:
          "linear-gradient(rgba(10,25,47,0.30), rgba(10,25,47,0.30)), url('/login-bg.webp')",
        backgroundPosition: 'center 5%',
      }}>
      <div className="absolute top-4 right-4 z-20">
        <LanguageSwitcher showLabel={false} />
      </div>

      <div className="relative z-10 w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden grid lg:grid-cols-2">
        <div className="hidden lg:flex flex-col justify-between bg-blue-900 text-white p-10">
          <div>
            <div className="flex items-center gap-4 mb-8">
              <div className="w-20 h-20 rounded-lg bg-white flex items-center justify-center shadow-lg">
                <img
                  src="/maup_logo.svg"
                  alt={t('login.logoAlt')}
                  className="w-16 h-16 object-contain"
                />
              </div>

              <div>
                <h1 className="text-2xl font-bold tracking-wide">
                  {t('login.logoAlt')}
                </h1>

                <p className="text-sm text-slate-300 leading-snug mt-1 max-w-xs whitespace-pre-line">
                  {t('login.left.academyFull')}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-blue-100 text-base leading-relaxed">
                {t('login.left.tagline1')}
              </p>

              <p className="text-blue-100 text-base leading-relaxed">
                {t('login.left.tagline2')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="group rounded-2xl bg-white/10 p-4 transition-all duration-300 hover:-translate-y-1 hover:bg-white/20 hover:shadow-xl cursor-pointer">
              <div className="text-2xl font-bold transition-transform duration-300 group-hover:scale-110">
                10 000+
              </div>
              <div className="text-xs text-blue-100 mt-1">
                {t('login.stats.students')}
              </div>
            </div>

            <div className="group rounded-2xl bg-white/10 p-4 transition-all duration-300 hover:-translate-y-1 hover:bg-white/20 hover:shadow-xl cursor-pointer">
              <div className="text-2xl font-bold transition-transform duration-300 group-hover:scale-110">
                24/7
              </div>
              <div className="text-xs text-blue-100 mt-1">
                {t('login.stats.access')}
              </div>
            </div>

            <div className="group rounded-2xl bg-white/10 p-4 transition-all duration-300 hover:-translate-y-1 hover:bg-white/20 hover:shadow-xl cursor-pointer">
              <div className="text-2xl font-bold transition-transform duration-300 group-hover:scale-110">
                450+
              </div>
              <div className="text-xs text-blue-100 mt-1">
                {t('login.stats.courses')}
              </div>
            </div>
          </div>
        </div>

        <div className="p-8 sm:p-10">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">
              {t('auth.title')}
            </h2>

            <p className="text-gray-500 mt-2">{t('auth.subtitle')}</p>
          </div>

          {error && (
            <div className=" mb-5 text-red-600 text-sm bg-red-50 border border-red-100 p-3 rounded-xl">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('auth.loginLabel')}
              </label>
              <input
                type="text"
                {...register('login')}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder={t('auth.loginPlaceholder')}
              />
              {errors.login && (
                <p className="text-sm text-red-600 mt-1">
                  {errors.login.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('auth.passwordLabel')}
              </label>

              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  {...register('password')}
                  className="w-full px-4 py-3 pr-20 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder={t('auth.passwordPlaceholder')}
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-700 transition-colors">
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>

              {errors.password && (
                <p className="text-sm text-red-600 mt-1">
                  {errors.password.message}
                </p>
              )}
            </div>

            <div className="flex justify-end">
              <Link
                to="/forgot-password"
                className="text-sm text-blue-700 hover:text-blue-900 hover:underline transition-colors">
                {t('auth.forgotPassword')}
              </Link>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-700 text-white py-3 rounded-xl hover:bg-blue-800 transition-colors disabled:opacity-50 font-medium">
              {isLoading ? t('auth.loading') : t('auth.submit')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
