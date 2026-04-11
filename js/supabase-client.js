// ============================================
// MyMatchPlayPal - Supabase Client
// ============================================

var SUPABASE_URL = 'https://kjlnfhriagwiqqbvvbhg.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqbG5maHJpYWd3aXFxYnZ2YmhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDM4MzMsImV4cCI6MjA5MTQxOTgzM30.rK4_dawPeERbRsAXkZmYq8n8ikDYkgEBrLut0I6rUrc';

// The CDN exposes window.supabase with createClient
var _sb = window.supabase;
console.log('[MMP] window.supabase:', _sb ? 'loaded' : 'MISSING');
if (!_sb || !_sb.createClient) {
  console.error('[MMP] Supabase JS library not loaded. Check CDN script tag in HTML <head>.');
  var supabase = null;
} else {
  var supabase = _sb.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log('[MMP] Supabase client created for:', SUPABASE_URL);
}

// Get the current authenticated user
async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// Get the member record for the current authenticated user
async function getCurrentMember() {
  const user = await getCurrentUser();
  console.log('[MMP] Auth user:', user ? user.email : 'not logged in');
  if (!user) return null;

  const { data, error } = await supabase
    .from('members')
    .select('*, clubs(name)')
    .eq('auth_id', user.id)
    .single();

  console.log('[MMP] Member lookup:', data ? data.email : 'not found', 'Error:', error);
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

// Check if user is also an organiser at any club
async function checkIsOrganiser(memberId) {
  var { data: memberships } = await supabase
    .from('club_memberships')
    .select('role')
    .eq('member_id', memberId);
  return (memberships || []).some(function(m) { return m.role === 'organiser'; });
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
    const isOnOrganiserPage = window.location.pathname.indexOf('organiser') !== -1;
    const avatarStyle = isOnOrganiserPage
      ? 'background:var(--gold);color:var(--green-900);border-color:var(--gold-light);'
      : '';

    actionsEl.innerHTML = `
      <div class="nav-avatar" style="${avatarStyle}">${initials}</div>
      <a href="#" onclick="signOut();return false;" class="btn btn-sm" style="background:rgba(255,255,255,0.15);color:var(--white);font-size:0.75rem;padding:0.3rem 0.6rem;">Sign Out</a>
    `;
    if (menuToggle) actionsEl.appendChild(menuToggle);

    // Add admin link if superuser
    if (member.is_admin) {
      var navLinks = document.querySelector('.navbar-links');
      var isAdminPage = window.location.pathname.indexOf('admin') !== -1;
      if (navLinks && !isAdminPage) {
        var adminLi = document.createElement('li');
        adminLi.innerHTML = '<a href="admin.html" style="color:#e94560;font-weight:600;">&#128272; Admin</a>';
        navLinks.appendChild(adminLi);
      }
    }

    // Add role switcher to sidebar AND mobile nav
    checkIsOrganiser(member.id).then(function(isOrg) {
      var hasOrgRole = isOrg || member.role === 'organiser';

      // Sidebar switcher (desktop)
      var sidebarSwitcher = document.getElementById('sidebar-role-switcher');
      if (sidebarSwitcher && hasOrgRole && !isOnOrganiserPage) {
        sidebarSwitcher.innerHTML = '<a href="organiser.html" style="display:flex;align-items:center;gap:0.75rem;padding:0.6rem 0.75rem;border-radius:var(--radius);font-size:0.9rem;color:var(--gold);background:rgba(212,168,67,0.1);font-weight:600;transition:all 0.15s;"><span class="nav-icon" style="width:20px;text-align:center;">&#128274;</span> Switch to Organiser</a>';
      } else if (sidebarSwitcher && isOnOrganiserPage) {
        sidebarSwitcher.innerHTML = '<a href="golfer.html" style="display:flex;align-items:center;gap:0.75rem;padding:0.6rem 0.75rem;border-radius:var(--radius);font-size:0.9rem;color:var(--green-600);background:var(--green-50);font-weight:600;transition:all 0.15s;"><span class="nav-icon" style="width:20px;text-align:center;">&#9971;</span> Switch to Golfer</a>';
      }

      // Mobile nav switcher (add to hamburger menu)
      var navLinks = document.querySelector('.navbar-links');
      if (navLinks && hasOrgRole && !isOnOrganiserPage) {
        var li = document.createElement('li');
        li.innerHTML = '<a href="organiser.html" style="color:var(--gold);font-weight:600;">&#128274; Organiser View</a>';
        navLinks.appendChild(li);
      } else if (navLinks && isOnOrganiserPage) {
        var li = document.createElement('li');
        li.innerHTML = '<a href="golfer.html" style="color:var(--green-400);font-weight:600;">&#9971; Golfer View</a>';
        navLinks.appendChild(li);
      }
    });
  }
}

// Listen for auth state changes
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_OUT') {
    updateNavForAuth(null);
  }
});
