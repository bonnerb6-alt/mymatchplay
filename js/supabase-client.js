// ============================================
// MyMatchPlayPal - Supabase Client
// ============================================

var SUPABASE_URL = 'https://kjlnfhriagwiqqbvvbhg.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqbG5maHJpYWd3aXFxYnZ2YmhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDM4MzMsImV4cCI6MjA5MTQxOTgzM30.rK4_dawPeERbRsAXkZmYq8n8ikDYkgEBrLut0I6rUrc';

// The CDN exposes window.supabase with createClient
var _sb = window.supabase;
if (!_sb || !_sb.createClient) {
  console.error('Supabase JS library not loaded. Check CDN script tag in HTML <head>.');
  // Prevent further errors by creating a stub
  var supabase = null;
} else {
  var supabase = _sb.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Get the current authenticated user
async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// Get the member record for the current authenticated user
async function getCurrentMember() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('members')
    .select('*, clubs(name)')
    .eq('auth_id', user.id)
    .single();

  if (error) return null;
  return data;
}

// Sign in with email and password
async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Sign up with email and password
async function signUp(email, password, metadata) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: metadata }
  });
  if (error) throw error;
  return data;
}

// Sign out
async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  window.location.href = 'login.html';
}

// Update nav bar based on auth state
function updateNavForAuth(member) {
  const actionsEl = document.querySelector('.navbar-actions');
  if (!actionsEl) return;

  const menuToggle = actionsEl.querySelector('.menu-toggle');
  const initials = member
    ? (member.first_name[0] + member.last_name[0]).toUpperCase()
    : null;

  if (member) {
    const isOrganiser = member.role === 'organiser';
    const avatarStyle = isOrganiser
      ? 'background:var(--gold);color:var(--green-900);border-color:var(--gold-light);'
      : '';

    actionsEl.innerHTML = `
      <div class="nav-avatar" style="${avatarStyle}" onclick="signOut()" title="Sign Out">${initials}</div>
    `;
    if (menuToggle) actionsEl.appendChild(menuToggle);
  }
}

// Listen for auth state changes
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_OUT') {
    updateNavForAuth(null);
  }
});
