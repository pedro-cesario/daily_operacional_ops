import { useState, type FormEvent } from 'react';
import { Lock, Moon, ShieldCheck, Sun } from 'lucide-react';
import type { AuthStatusResponse, AuthUser } from '../types';
import { api, setAuthToken } from '../services/api';

interface LoginPageProps {
  authStatus: AuthStatusResponse;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onAuthenticated: (user: AuthUser) => void;
}

export function LoginPage({
  authStatus,
  theme,
  onToggleTheme,
  onAuthenticated,
}: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFirstRun = authStatus.needsFirstRunSetup;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isFirstRun) {
      if (password !== confirmPassword) {
        setError('As senhas digitadas não conferem.');
        return;
      }
      if (password.length < 6) {
        setError('A senha inicial deve ter ao menos 6 caracteres.');
        return;
      }
      setSubmitting(true);
      try {
        const res = await api.setupInitialAdmin({
          username: username.trim(),
          displayName: displayName.trim() || username.trim(),
          password,
        });
        setAuthToken(res.token);
        onAuthenticated(res.user);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao configurar acesso inicial.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.login({ username: username.trim(), password });
      setAuthToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na autenticação.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-between bg-slate-50 px-4 py-8 dark:bg-slate-950">
      <div className="mx-auto flex w-full max-w-md justify-end">
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
        >
          {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>
      </div>

      <main className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-sky-700 dark:text-sky-400">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          <span>HEAL Ops · Autenticação</span>
        </div>

        <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
          DAILY OPERACIONAL — TI HEAL
        </h1>

        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {isFirstRun
            ? 'Primeiro acesso do servidor BFF: defina o usuário e senha iniciais do operador para proteger o painel.'
            : authStatus.upstreamConfigured
              ? 'Entre com suas credenciais do ecossistema HEAL Ops.'
              : 'Entre com as credenciais de operador validadas pelo BFF.'}
        </p>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="login-username"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Usuário ou e-mail
            </label>
            <input
              id="login-username"
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="operacao@heal.org.br"
              className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          {isFirstRun && (
            <div>
              <label
                htmlFor="login-display-name"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Nome de exibição
              </label>
              <input
                id="login-display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Coordenação TI HEAL"
                className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="login-password"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Senha
            </label>
            <input
              id="login-password"
              type="password"
              required
              autoComplete={isFirstRun ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          {isFirstRun && (
            <div>
              <label
                htmlFor="login-confirm"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Confirmar senha
              </label>
              <input
                id="login-confirm"
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-sky-800 disabled:opacity-60 dark:bg-sky-600 dark:hover:bg-sky-500"
          >
            <Lock className="h-4 w-4" aria-hidden="true" />
            <span>
              {submitting
                ? 'Validando sessão...'
                : isFirstRun
                  ? 'Configurar acesso e entrar'
                  : 'Entrar no painel'}
            </span>
          </button>
        </form>
      </main>

      <footer className="mx-auto w-full max-w-md text-center text-xs text-slate-500 dark:text-slate-400">
        HEAL Daily Operacional · Sessão validada pelo backend BFF
      </footer>
    </div>
  );
}
