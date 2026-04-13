// ============================================
// MyMatchPlayPal - Role-Aware Navigation
// ============================================

// SVG icon set (20x20 Heroicons solid)
var NAV_ICONS = {
  home: '<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/></svg>',
  star: '<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>',
  user: '<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>',
  cog: '<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/></svg>',
  flag: '<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 7l2.55 2.4A1 1 0 0116 11H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clip-rule="evenodd"/></svg>'
};

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
  var isOrg = sessionStorage.getItem('mmpIsOrg') === 'true';
  var home = role === 'organiser' ? 'organiser.html' : 'golfer.html';
  var homeLabel = role === 'organiser' ? 'Manage' : 'Home';
  var homeIcon = role === 'organiser' ? NAV_ICONS.cog : NAV_ICONS.home;

  var nav = document.getElementById('bottom-nav');
  if (!nav) return;

  var html = '';
  html += '<a href="' + home + '" class="' + (activePage === 'home' ? 'active' : '') + '"><span class="nav-icon">' + homeIcon + '</span>' + homeLabel + '</a>';
  html += '<a href="results.html" class="' + (activePage === 'results' ? 'active' : '') + '"><span class="nav-icon">' + NAV_ICONS.star + '</span>Results</a>';
  html += '<a href="profile.html" class="' + (activePage === 'profile' ? 'active' : '') + '"><span class="nav-icon">' + NAV_ICONS.user + '</span>Profile</a>';

  // Switch role link
  if (role === 'organiser') {
    html += '<a href="golfer.html" onclick="setRole(\'golfer\')"><span class="nav-icon">' + NAV_ICONS.flag + '</span>Golfer</a>';
  } else if (isOrg) {
    html += '<a href="organiser.html" onclick="setRole(\'organiser\')"><span class="nav-icon">' + NAV_ICONS.cog + '</span>Manage</a>';
  }

  nav.innerHTML = html;
}

// Build top nav links based on current role
function renderTopNavLinks(activePage) {
  var role = getRole();
  var isOrg = sessionStorage.getItem('mmpIsOrg') === 'true';
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
  } else if (isOrg) {
    html += '<a href="organiser.html" onclick="setRole(\'organiser\')">Organiser View</a>';
  }

  container.innerHTML = html;
}

// Check if user is organiser and offer role switch
async function checkAndOfferOrgSwitch() {
  // Deprecated, logic moved to synchronous rendering in renderBottomNav / renderTopNavLinks.
}
