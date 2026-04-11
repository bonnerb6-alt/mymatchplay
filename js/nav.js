// ============================================
// MyMatchPlayPal - Role-Aware Navigation
// Keeps you in golfer or organiser context
// ============================================

function setRole(role) {
  sessionStorage.setItem('mmpRole', role);
}

function getRole() {
  return sessionStorage.getItem('mmpRole') || 'golfer';
}

function getHomePage() {
  return getRole() === 'organiser' ? 'organiser.html' : 'golfer.html';
}

// Build bottom nav based on current role and active page
function renderBottomNav(activePage) {
  var role = getRole();
  var home = role === 'organiser' ? 'organiser.html' : 'golfer.html';
  var homeLabel = role === 'organiser' ? 'Manage' : 'Home';
  var homeIcon = role === 'organiser' ? '&#128274;' : '&#127968;';
  var switchHref = role === 'organiser' ? 'golfer.html' : null;

  var nav = document.getElementById('bottom-nav');
  if (!nav) return;

  var html = '';
  html += '<a href="' + home + '" class="' + (activePage === 'home' ? 'active' : '') + '"><span class="nav-icon">' + homeIcon + '</span>' + homeLabel + '</a>';
  html += '<a href="results.html" class="' + (activePage === 'results' ? 'active' : '') + '"><span class="nav-icon">&#127941;</span>Results</a>';
  html += '<a href="profile.html" class="' + (activePage === 'profile' ? 'active' : '') + '"><span class="nav-icon">&#128100;</span>Profile</a>';

  // Switch role link
  if (switchHref) {
    html += '<a href="' + switchHref + '" onclick="setRole(\'golfer\')"><span class="nav-icon">&#9971;</span>Golfer</a>';
  }

  nav.innerHTML = html;
}

// Build top nav links based on current role
function renderTopNavLinks(activePage) {
  var role = getRole();
  var container = document.querySelector('.top-nav-links');
  if (!container) return;

  var home = role === 'organiser' ? 'organiser.html' : 'golfer.html';
  var homeLabel = role === 'organiser' ? 'Manage' : 'Dashboard';

  var html = '';
  html += '<a href="' + home + '" class="' + (activePage === 'home' ? 'active' : '') + '">' + homeLabel + '</a>';
  html += '<a href="results.html" class="' + (activePage === 'results' ? 'active' : '') + '">Results</a>';
  html += '<a href="profile.html" class="' + (activePage === 'profile' ? 'active' : '') + '">Profile</a>';

  // Switch role
  if (role === 'organiser') {
    html += '<a href="golfer.html" onclick="setRole(\'golfer\')">Golfer View</a>';
  }

  container.innerHTML = html;
}

// Check if user is organiser and offer role switch
async function checkAndOfferOrgSwitch() {
  var member = await getCurrentMember();
  if (!member) return;

  var isOrg = member.role === 'organiser' || member.is_admin;
  if (!isOrg) {
    var { data: memberships } = await supabase.from('club_memberships').select('role').eq('member_id', member.id);
    isOrg = (memberships || []).some(function(m) { return m.role === 'organiser'; });
  }

  if (isOrg && getRole() === 'golfer') {
    // Add organiser link to bottom nav
    var nav = document.getElementById('bottom-nav');
    if (nav && !nav.querySelector('[data-switch="organiser"]')) {
      var a = document.createElement('a');
      a.href = 'organiser.html';
      a.setAttribute('data-switch', 'organiser');
      a.onclick = function() { setRole('organiser'); };
      a.innerHTML = '<span class="nav-icon">&#128274;</span>Organiser';
      nav.appendChild(a);
    }

    // Add to top nav
    var topLinks = document.querySelector('.top-nav-links');
    if (topLinks && !topLinks.querySelector('[data-switch="organiser"]')) {
      var a2 = document.createElement('a');
      a2.href = 'organiser.html';
      a2.setAttribute('data-switch', 'organiser');
      a2.onclick = function() { setRole('organiser'); };
      a2.textContent = 'Organiser';
      topLinks.appendChild(a2);
    }
  }
}
