import { createClient } from '@supabase/supabase-js';

const VITE_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('Missing VITE_SUPABASE_PUBLISHABLE_KEY environment variable.');
}

// Determina a URL do Supabase: usa a variável se tiver /supabase/ (proxy path),
// caso contrário tenta usar a mesma origem do navegador
function getSUPABASE_URL(): string {
  if (VITE_SUPABASE_URL && VITE_SUPABASE_URL.includes('/supabase')) {
    // URL de produção em LAN mobile: http://bingo.up/supabase
    return VITE_SUPABASE_URL;
  }

  if (VITE_SUPABASE_URL) {
    // URL absoluta já configurada
    return VITE_SUPABASE_URL;
  }

  // Fallback: usar a mesma origem do navegador + /supabase
  // Funciona para localhost:8082 quando não tem DNS configurado
  const origin = window.location.origin;
  return `${origin}/supabase`;
}

const SUPABASE_URL = getSUPABASE_URL();

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  db: {
    schema: 'public',
  },
});