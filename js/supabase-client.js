const SUPABASE_URL = "https://pcjwzkwjsilpdrlswadp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjand6a3dqc2lscGRybHN3YWRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3MjE0NzYsImV4cCI6MjA5MzI5NzQ3Nn0.Vpa30LROe1M8HmqaLQBJkKGB81DpOY7C1j004yafINU";

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
