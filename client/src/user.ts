import { useEffect, useState } from 'react';
import { apiFetch, goToLogin } from './auth';
import { browserAgent } from './monitoring';

/** The logged-in user as `/api/shell/me` gives it: OpenID Connect fields and the Shell's roles. */
export interface ShopUser {
  sub: string;
  preferred_username: string;
  name?: string;
  roles: string[];
}

/** Keeps every tab of the shop in step on login and logout. Messages carry no token. */
export const AUTH_CHANNEL = 'shop-auth';

type AuthMessage = { type: 'logged-in'; sub: string } | { type: 'logged-out' };

const channel =
  typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(AUTH_CHANNEL);

function isUser(value: unknown): value is ShopUser {
  return typeof value === 'object' && value !== null && typeof (value as ShopUser).sub === 'string';
}

/** The Shell FES marks the page when login is on (MVP-2); otherwise nothing is asked (MVP-1). */
function loginIsOn(): boolean {
  return document.querySelector('meta[name="shop-login"]') !== null;
}

async function loadUser(): Promise<ShopUser | null> {
  if (!loginIsOn()) return null;
  const res = await apiFetch('/api/shell/me');
  if (!res.ok) return null; // 404: login is off (MVP-1)
  const body: unknown = await res.json();
  return isUser(body) ? body : null;
}

/**
 * The user this page shows, kept only in page memory: `undefined` while loading, `null` when login is
 * off. The page reloads if another user logs in, in this tab or another, so it never sends a request
 * as someone other than the user it shows.
 */
export function useUser(): ShopUser | null | undefined {
  const [user, setUser] = useState<ShopUser | null>();

  useEffect(() => {
    let shown: string | undefined;

    const show = (next: ShopUser | null) => {
      if (!next) {
        setUser(null);
        return;
      }
      if (shown && shown !== next.sub) {
        window.location.reload();
        return;
      }
      shown = next.sub;
      browserAgent?.setUserId(next.sub);
      channel?.postMessage({ type: 'logged-in', sub: next.sub } satisfies AuthMessage);
      setUser(next);
    };
    const refresh = () => {
      loadUser().then(show, () => undefined);
    };

    // A tab that becomes visible checks again: the session may have ended while it was hidden.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && shown) refresh();
    };
    const onMessage = (event: MessageEvent<AuthMessage>) => {
      if (!shown) return;
      if (event.data.type === 'logged-out') goToLogin();
      else if (event.data.sub !== shown) window.location.reload();
    };

    refresh();
    document.addEventListener('visibilitychange', onVisible);
    channel?.addEventListener('message', onMessage);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      channel?.removeEventListener('message', onMessage);
    };
  }, []);

  return user;
}

/**
 * Before the logout form is sent: stop tagging events with the user. The other tabs are told by the
 * Shell FES's `/auth/logged-out` page, once the IdP's session has really ended.
 */
export function announceLogout(): void {
  browserAgent?.setUserId(null);
}
