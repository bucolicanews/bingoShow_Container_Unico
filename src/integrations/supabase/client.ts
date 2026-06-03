import { createClient } from '@supabase/supabase-js';

const VITE_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
// URL direta do Realtime (bypassa Kong quando Traefik não suporta WSS upgrade)
const VITE_REALTIME_URL = import.meta.env.VITE_REALTIME_URL as string | undefined;

if (!SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('Missing VITE_SUPABASE_PUBLISHABLE_KEY environment variable.');
}

function getSUPABASE_URL(): string {
  if (VITE_SUPABASE_URL && VITE_SUPABASE_URL.includes('/supabase')) {
    return VITE_SUPABASE_URL;
  }
  if (VITE_SUPABASE_URL) {
    return VITE_SUPABASE_URL;
  }
  const origin = window.location.origin;
  return `${origin}/supabase`;
}

const SUPABASE_URL = getSUPABASE_URL();

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  db: { schema: 'public' },
  ...(VITE_REALTIME_URL && {
    realtime: {
      url: VITE_REALTIME_URL,
      params: { apikey: SUPABASE_PUBLISHABLE_KEY },
    },
  }),
});