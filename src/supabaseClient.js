import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || "https://cywgxsocudepyejqnuuc.supabase.co";
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5d2d4c29jdWRlcHllanFudXVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MzUyNzEsImV4cCI6MjA5NTMxMTI3MX0._2vdjm3nTsqcU4tebLKn33xm5HUPMQB1WpWhKZUP3tM";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
