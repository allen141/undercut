import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Command, CommandRequest } from '@undercut/contracts';
import type { State } from '@undercut/game-core';
import { Game } from './Game.js';

export type Campaign = { id: string; name: string; revision: number; state: State };
type Summary = Pick<Campaign, 'id' | 'name' | 'revision'>;
type User = { id: string; name: string; email: string };
type AuthLink = { mode: 'invite' | 'reset' | 'login'; token: string; email: string };
type NewCampaign = { id: string; name: string };

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function api<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      ...(body === undefined ? {} : {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      }),
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }
  const data = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new ApiError(response.status, data?.message ?? data?.error ?? 'The request could not be completed.');
  }
  if (data === undefined) throw new Error('The server returned an unexpected response. Try again.');
  return data;
}

function readAuthLink(): AuthLink {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const query = new URLSearchParams(location.search);
  const mode = location.pathname === '/invite' ? 'invite' : location.pathname === '/reset' ? 'reset' : 'login';
  return { mode, token: fragment.get('token') ?? query.get('token') ?? '', email: fragment.get('email') ?? '' };
}

function readPending<T>(key: string): T | null {
  const value = localStorage.getItem(key);
  return value ? JSON.parse(value) : null;
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [list, setList] = useState<Summary[]>([]);
  const [pending, setPending] = useState(false);
  const [newCampaign, setNewCampaign] = useState<NewCampaign | null>(null);
  const [link, setLink] = useState(readAuthLink);
  const lock = useRef(false);
  const accountKey = `undercut:${user?.id}`;
  const newCampaignKey = `${accountKey}:new`;
  const pendingKey = (id: string) => `${accountKey}:${id}:pending`;
  const authScreen = !user || link.mode !== 'login';

  function showLogin() {
    history.replaceState(null, '', '/');
    setLink({ mode: 'login', token: '', email: '' });
    setError('');
  }

  async function guarded(run: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await run();
    } catch (e) {
      if (user && e instanceof ApiError && e.status === 401) {
        setUser(null);
        setCampaign(null);
        setList([]);
      }
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function loadList() {
    setList(await api<Summary[]>('/api/v1/campaigns'));
  }

  async function loadCampaign(id: string) {
    const saved = await api<Campaign>(`/api/v1/campaigns/${id}`);
    setCampaign(saved);
    setPending(!!localStorage.getItem(pendingKey(id)));
  }

  useEffect(() => {
    if (link.token) history.replaceState(null, '', location.pathname);
  }, [link.token]);

  useEffect(() => {
    let mounted = true;
    api<{ user: User } | null>('/api/auth/get-session')
      .then(session => { if (mounted) setUser(session?.user ?? null); })
      .catch(() => { if (mounted) setError('Cannot reach the server. Check your connection and reload.'); })
      .finally(() => { if (mounted) setLoading(false); });
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      mounted = false;
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  useEffect(() => {
    if (user) {
      void guarded(async () => {
        setNewCampaign(readPending<NewCampaign>(newCampaignKey));
        await loadList();
      });
    }
  }, [user?.id]);

  useEffect(() => {
    if (!campaign) return;
    const key = pendingKey(campaign.id);
    const onStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) setPending(!!localStorage.getItem(key));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [user?.id, campaign?.id]);

  async function send(command?: Command) {
    if (!campaign || !online) return;
    await guarded(async () => {
      const key = pendingKey(campaign.id);
      const previous = readPending<CommandRequest>(key);
      if (previous && command) {
        setPending(true);
        return;
      }
      const request = previous ?? (command && {
        actionId: crypto.randomUUID(), expectedRevision: campaign.revision, command,
      });
      if (!request) {
        await loadCampaign(campaign.id);
        return;
      }
      localStorage.setItem(key, JSON.stringify(request));
      setPending(true);

      function clearPending() {
        const latest = readPending<CommandRequest>(key);
        if (latest?.actionId === request?.actionId) localStorage.removeItem(key);
        setPending(!!localStorage.getItem(key));
      }

      try {
        const saved = await api<Campaign>(`/api/v1/campaigns/${campaign.id}/commands`, request);
        setCampaign(saved);
        clearPending();
      } catch (e) {
        if (e instanceof ApiError && [400, 404, 409, 422].includes(e.status)) {
          if (e.status === 409) await loadCampaign(campaign.id);
          clearPending();
        }
        throw e;
      }
    });
  }

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();
    await guarded(async () => {
      const input = readPending<NewCampaign>(newCampaignKey) ?? { id: crypto.randomUUID(), name };
      if (!input.name) throw new Error('Enter a shop name to create your campaign.');
      localStorage.setItem(newCampaignKey, JSON.stringify(input));
      setNewCampaign(input);
      try {
        const saved = await api<Campaign>('/api/v1/campaigns', input);
        setCampaign(saved);
        setPending(false);
      } catch (e) {
        if (!(e instanceof ApiError && [400, 409, 422].includes(e.status))) throw e;
        localStorage.removeItem(newCampaignKey);
        setNewCampaign(null);
        throw e;
      }
      localStorage.removeItem(newCampaignKey);
      setNewCampaign(null);
    });
  }

  async function signOut() {
    await guarded(async () => {
      await api('/api/auth/sign-out', {});
      setUser(null);
      setCampaign(null);
      setList([]);
    });
  }

  async function submitAuth(body: unknown, headers?: Record<string, string>) {
    await guarded(async () => {
      setMessage('');
      if (link.mode === 'reset') {
        await api('/api/auth/reset-password', body);
        setUser(null);
        setCampaign(null);
        setList([]);
        showLogin();
        setMessage('Password updated. Sign in with your new password.');
        return;
      }
      await api(`/api/auth/${link.mode === 'invite' ? 'sign-up/email' : 'sign-in/email'}`, body, headers);
      const session = await api<{ user: User } | null>('/api/auth/get-session');
      if (!session?.user) throw new Error('The session could not be saved. Allow cookies and sign in again.');
      showLogin();
      setUser(session.user);
    });
  }

  if (loading) return <main className="loading">Opening the shop…</main>;
  if (campaign && !authScreen) return <Game key={campaign.id} campaign={campaign} busy={busy} online={online}
    pending={pending} error={error} send={send} back={() => guarded(async () => { await loadList(); setCampaign(null); })} />;
  return <>
    <header className="topbar">
      <a className="brand" href="/" aria-label="Undercut home"><span className="brand-symbol">u</span>undercut</a>
      {user && !authScreen && <div className="account">
        <span title={user.name}>{user.name}</span>
        <button className="text-button" onClick={signOut} disabled={busy || !online}>Sign out</button>
      </div>}
    </header>
    <main>
      {!online && <div className="notice" role="status">You’re offline. Reconnect to continue trading.</div>}
      {error && <div className="notice error" role="alert">{error}</div>}
      {message && <div className="notice" role="status">{message}</div>}
      {authScreen ? <section className="welcome">
        <div>
          <span className="eyebrow">INVITATION-ONLY PLAYTEST</span>
          <h1>A different town.<br />A new day’s trade.</h1>
          <p>Choose a town, stock your shelves, and find your margin.</p>
          <div className="welcome-dial" aria-hidden="true"><span>M</span><span>F</span><span>H</span><b>u</b></div>
        </div>
        <div className="panel auth-panel">
          <h2>{link.mode === 'invite' ? 'Create your account' : link.mode === 'reset' ? 'Set a new password' : 'Sign in to Undercut'}</h2>
          {link.mode === 'login' || link.token ? <AuthForm key={link.mode} link={link} disabled={busy || !online} submit={submitAuth} /> :
            <p className="muted">Open the original link from the playtest operator.</p>}
          {link.mode === 'login' ? <p className="muted small">Ask the operator for an invitation or a password-reset link.</p> :
            <button className="text-button" onClick={showLogin} disabled={busy}>Back to sign in</button>}
        </div>
      </section> : <section className="lobby">
        <div className="section-heading">
          <h1>Your campaigns</h1>
          <p className="muted">Pick up where you left off, or start a new shop with its own stock and gold.</p>
        </div>
        <div className="campaign-grid">
          {list.map(saved => <button className="panel campaign-card" key={saved.id}
            onClick={() => guarded(() => loadCampaign(saved.id))} disabled={busy || !online}>
            <h2>{saved.name}</h2><span className="accent">Resume campaign</span>
          </button>)}
          <form className="panel new-campaign" onSubmit={createCampaign}>
            <h2>New campaign</h2>
            {newCampaign ? <p role="status">Confirm creation of <strong>{newCampaign.name}</strong> with the server.</p> :
              <label>Shop name<input name="name" placeholder="The little shop" required maxLength={60} /></label>}
            <button className="primary" disabled={busy || !online}>{newCampaign ? 'Confirm campaign' : 'Create campaign'}</button>
          <p className="muted small">100 gold. Four displays. Your choice of town.</p>
          </form>
        </div>
      </section>}
    </main>
    <footer><span>Undercut</span><span>{user ? 'Progress saved after every action' : 'A shop between towns'}</span></footer>
  </>;
}

function AuthForm({ link, disabled, submit }: {
  link: AuthLink;
  disabled: boolean;
  submit: (body: unknown, headers?: Record<string, string>) => void;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = data.get('password');
    if (link.mode === 'reset') submit({ token: link.token, newPassword: password });
    else if (link.mode === 'invite') submit({ email: data.get('email'), password, name: data.get('name') }, { 'x-invite-token': link.token });
    else submit({ email: data.get('email'), password });
  }
  return <form onSubmit={handleSubmit}>
    {link.mode === 'invite' && <label>Your name<input name="name" autoComplete="name" required maxLength={60} /></label>}
    {link.mode !== 'reset' && <label>Email<input type="email" name="email" autoComplete="email" defaultValue={link.email}
      readOnly={link.mode === 'invite' && !!link.email} required /></label>}
    <label>{link.mode === 'reset' ? 'New password' : 'Password'}<input name="password" type="password" minLength={12}
      autoComplete={link.mode === 'login' ? 'current-password' : 'new-password'} required /></label>
    {link.mode !== 'login' && <p className="small muted">Use at least 12 characters.</p>}
    <button className="primary" disabled={disabled}>{link.mode === 'login' ? 'Sign in' : link.mode === 'invite' ? 'Create account' : 'Save password'}</button>
  </form>;
}
