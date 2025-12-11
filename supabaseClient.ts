import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://vislignuaomyetdkblpc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpc2xpZ251YW9teWV0ZGtibHBjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4ODQxNTIsImV4cCI6MjA4MDQ2MDE1Mn0.lhqEqb3bamJ4--e7nn7UgqZ3J_0nLRI41lmo3Tt9tYI";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
