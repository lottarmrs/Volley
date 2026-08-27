import { createClient } from '@supabase/supabase-js';

type ViteImportMeta = ImportMeta & {
  env?: Record<string, string | undefined>;
};

const env: Record<string, string | undefined> = (import.meta as ViteImportMeta).env ?? {};
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(supabaseUrl && supabaseKey);

if (!isSupabaseConfigured && typeof window !== 'undefined') {
  console.warn(
    'Supabase environment variables are missing (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY). Cloud sync features will be disabled.',
  );
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseKey!)
  : (null as any);
