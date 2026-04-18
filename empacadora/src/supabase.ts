import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL      = process.env.REACT_APP_SUPABASE_URL!;
export const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY!;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// EMPRESA_ID removido — usar useEmpresaId() desde context/EmpresaContext
