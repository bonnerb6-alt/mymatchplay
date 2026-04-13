// ============================================
// MyMatchPlayPal - Organiser Dashboard
// ============================================

let currentOrganiser = null;
let orgClub = null;
let orgClubId = null;
let allOrgClubs = []; // All clubs this organiser manages

async function initOrganiserDashboard() {
  currentOrganiser = await getCurrentMember();
  if (!currentOrganiser) {
    window.location.href = 'login.html';
    return;
  }

  // Load all clubs where this member is an organiser
  var { data: memberships } = await supabase
    .from('club_memberships')
    .select('*, clubs(id, name)')
    .eq('member_id', currentOrganiser.id)
    .eq('role', 'organiser');

  if (!memberships || memberships.length === 0) {
    if (currentOrganiser.role === 'organiser') {
      allOrgClubs = [{ club_id: currentOrganiser.club_id, clubs: currentOrganiser.clubs }];
    } else {
      alert('You do not have organiser access. Redirecting to golfer dashboard.');
      window.location.href = 'golfer.html';
      return;
    }
  } else {
    allOrgClubs = memberships;
  }

  // Check if a club was previously selected (stored in sessionStorage)
  var savedClubId = sessionStorage.getItem('orgSelectedClub');
  var savedClub = savedClubId ? allOrgClubs.find(function(c) { return c.club_id === savedClubId; }) : null;
  orgClub = savedClub || allOrgClubs[0];
  orgClubId = orgClub.club_id;

  updateNavForAuth(currentOrganiser);
  renderOrgSidebar();
  renderClubSwitcher();
  loadSelectedClub();
}

function renderClubSwitcher() {
  var container = document.getElementById('club-switcher');
  if (!container) return;

  if (allOrgClubs.length <= 1) {
    container.style.display = 'none';
    return;
  }

  container.innerHTML = allOrgClubs.map(function(c) {
    var isActive = c.club_id === orgClubId;
    var style = isActive
      ? 'background:var(--gold);color:var(--green-900);border-color:var(--gold);'
      : 'background:var(--white);color:var(--gray-600);border-color:var(--gray-200);';
    return '<button class="btn btn-sm" style="' + style + 'font-size:0.8rem;padding:0.4rem 0.9rem;" onclick="switchClub(\'' + c.club_id + '\')">' + (c.clubs?.name || 'Club') + '</button>';
  }).join('');
}

function switchClub(clubId) {
  sessionStorage.setItem('orgSelectedClub', clubId);
  orgClub = allOrgClubs.find(function(c) { return c.club_id === clubId; });
  orgClubId = clubId;
  _resultsLoaded = false;
  renderClubSwitcher();
  loadSelectedClub();
}

async function loadSelectedClub() {
  var clubName = orgClub.clubs?.name || 'Golf Club';
  document.getElementById('org-club-name').textContent = clubName + ' — Match Secretary Panel';
  displayClubIdentity();
  await Promise.all([
    loadOrgStats(),
    loadTournaments(),
    loadMembers(),
    loadActivityLog(),
    loadRequests()
  ]);
}

function renderOrgSidebar() {
  const el = document.getElementById('org-sidebar-profile');
  if (!el) return;
  const initials = currentOrganiser.first_name[0] + currentOrganiser.last_name[0];
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:0.75rem;padding:0 0.75rem;margin-bottom:1.25rem;">
      <div class="profile-avatar organiser" style="width:48px;height:48px;font-size:1.1rem;">${initials}</div>
      <div>
        <div style="font-weight:600;font-size:0.95rem;">${currentOrganiser.first_name} ${currentOrganiser.last_name}</div>
        <div style="font-size:0.75rem;color:var(--gold);">Match Secretary</div>
      </div>
    </div>`;
}

async function loadOrgStats() {
  try {
    // Run all stat queries in parallel (4 queries → 1 round trip)
    var [tournamentsRes, membersRes] = await Promise.all([
      supabase.from('tournaments').select('id, status').eq('club_id', orgClubId),
      supabase.from('club_memberships').select('id').eq('club_id', orgClubId).eq('status', 'active')
    ]);

    var tournaments = tournamentsRes.data || [];
    var totalTournaments = tournaments.length;
    var activeTournaments = tournaments.filter(function(t) { return t.status === 'entries_open' || t.status === 'in_progress'; }).length;
    var memberCount = (membersRes.data || []).length;

    var el;
    el = document.getElementById('org-stat-total'); if (el) el.textContent = totalTournaments;
    el = document.getElementById('org-stat-active'); if (el) el.textContent = activeTournaments;
    el = document.getElementById('org-stat-members'); if (el) el.textContent = memberCount;
    el = document.getElementById('org-stat-pending'); if (el) el.textContent = '-';
  } catch (err) {
    console.error('[MMP] Stats error:', err);
  }
}

// Derive the current round display from match data
function deriveRoundDisplay(tournament, matches) {
  if (tournament.status === 'entries_open' || tournament.status === 'scheduled') {
    return '<span style="color:var(--gray-400);">Not started</span>';
  }
  if (tournament.status === 'completed') {
    return '<span class="badge badge-gray">Completed</span>';
  }

  // Find the highest round that has at least one non-completed match
  if (!matches || matches.length === 0) return '<span style="color:var(--gray-400);">Not started</span>';

  var totalRounds = Math.log2(tournament.bracket_size);
  var activeRound = 0;

  for (var r = 1; r <= totalRounds; r++) {
    var roundMatches = matches.filter(function(m) { return m.round === r; });
    var hasActive = roundMatches.some(function(m) { return m.status === 'pending' || m.status === 'in_progress'; });
    var hasCompleted = roundMatches.some(function(m) { return m.status === 'completed' || m.status === 'bye'; });
    if (hasActive || (hasCompleted && r > activeRound)) {
      activeRound = r;
    }
    if (hasActive) break; // This is the current active round
  }

  if (activeRound === 0) return '<span style="color:var(--gray-400);">Not started</span>';

  var roundName = getRoundName(activeRound, totalRounds);
  return '<span class="badge badge-green">' + roundName + '</span>';
}

// Get proper round name based on position relative to total rounds
function getRoundName(round, totalRounds) {
  if (round === totalRounds) return 'Final';
  if (round === totalRounds - 1) return 'Semi Finals';
  if (round === totalRounds - 2) return 'Quarter Finals';
  if (round === totalRounds - 3) return 'Round of 16';
  return 'Round ' + round;
}

async function loadTournaments() {
  var container = document.getElementById('tournaments-list');
  if (!container) return;

  var { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, name, status, bracket_size, entry_deadline, tournament_entries(count), whatsapp_group_link')
    .eq('club_id', orgClubId)
    .order('created_at', { ascending: false });

  if (!tournaments || tournaments.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:var(--gray-400);padding:2rem 0;">No tournaments yet. Create one!</p>';
    return;
  }

  var tournamentIds = tournaments.map(function(t) { return t.id; });
  var { data: allMatches } = await supabase
    .from('matches')
    .select('tournament_id, round, status')
    .in('tournament_id', tournamentIds);

  var chevron = '<svg class="t-card-chevron" width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>';

  container.innerHTML = tournaments.map(function(t) {
    var entryCount = t.tournament_entries && t.tournament_entries[0] ? t.tournament_entries[0].count : 0;
    var deadline = t.entry_deadline
      ? new Date(t.entry_deadline).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'None set';
    var tMatches = (allMatches || []).filter(function(m) { return m.tournament_id === t.id; });
    var roundDisplay = deriveRoundDisplay(t, tMatches);

    var badge, buttons;

    if (t.status === 'entries_open') {
      badge = '<span class="badge badge-gold">Entries Open</span>';
      var tid = t.id, tname = t.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'"), bsize = t.bracket_size;
      buttons =
        '<button class="btn btn-primary" onclick="openEnrolTournament(\'' + tid + '\',\'' + tname + '\',' + bsize + ')">Enrol Members</button>' +
        '<button class="btn btn-gold" onclick="generateDraw(\'' + tid + '\',' + bsize + ')">Generate Draw</button>' +
        '<button class="btn btn-danger" style="grid-column:1/-1" onclick="deleteTournament(\'' + tid + '\',\'' + tname + '\')">Delete</button>';

    } else if (t.status === 'in_progress') {
      badge = '<span class="badge badge-green">In Progress</span>';
      var tid = t.id, tname = t.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'"), bsize = t.bracket_size;
      buttons =
        '<button class="btn btn-secondary" onclick="viewOrgBracket(\'' + tid + '\',\'' + tname + '\')">View Draw</button>' +
        '<button class="btn btn-primary" onclick="openRoundDeadlines(\'' + tid + '\',\'' + tname + '\',' + bsize + ')">Set Deadlines</button>' +
        '<button class="btn btn-gold" onclick="redraw(\'' + tid + '\',' + bsize + ')">Re-Draw</button>' +
        '<button class="btn btn-danger" onclick="deleteTournament(\'' + tid + '\',\'' + tname + '\')">Delete</button>';

    } else if (t.status === 'completed') {
      badge = '<span class="badge badge-gray">Completed</span>';
      var tid = t.id, tname = t.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      buttons =
        '<button class="btn btn-secondary" style="grid-column:1/-1" onclick="viewOrgBracket(\'' + tid + '\',\'' + tname + '\')">View Results</button>' +
        '<button class="btn btn-danger" style="grid-column:1/-1" onclick="deleteTournament(\'' + tid + '\',\'' + tname + '\')">Delete</button>';

    } else {
      badge = '<span class="badge badge-blue">Scheduled</span>';
      var tid = t.id, tname = t.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      buttons =
        '<button class="btn btn-primary" onclick="openEntries(\'' + tid + '\')">Open Entries</button>' +
        '<button class="btn btn-danger" onclick="deleteTournament(\'' + tid + '\',\'' + tname + '\')">Delete</button>';
    }

    return '<details class="t-card">' +
      '<summary>' +
        '<div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;flex:1;min-width:0;">' +
          '<span class="t-card-title">' + t.name + '</span>' +
          badge +
        '</div>' +
        chevron +
      '</summary>' +
      '<div class="t-card-detail"><span class="t-card-detail-label">Entries</span><span>' + entryCount + ' / ' + t.bracket_size + '</span></div>' +
      '<div class="t-card-detail"><span class="t-card-detail-label">Round</span><span>' + roundDisplay + '</span></div>' +
      '<div class="t-card-detail"><span class="t-card-detail-label">Entry Deadline</span><span>' + deadline + '</span></div>' +
      '<div class="t-card-actions">' + buttons + '</div>' +
      '</details>';
  }).join('');
}

// ---- View Bracket / Results (Organiser) ----
var _currentViewTournamentId = null;
var _currentViewTournamentName = null;

async function viewOrgBracket(tournamentId, name) {
  _currentViewTournamentId = tournamentId;
  _currentViewTournamentName = name;
  document.getElementById('orgBracketModalTitle').textContent = name;
  document.getElementById('orgBracketModalContent').innerHTML = '<div class="card-empty">Loading...</div>';
  document.getElementById('orgBracketModal').classList.add('active');

  var [matchesRes, tRes] = await Promise.all([
    supabase.from('matches')
      .select('*, player1:members!matches_player1_id_fkey(id, first_name, last_name), player2:members!matches_player2_id_fkey(id, first_name, last_name), winner:members!matches_winner_id_fkey(id, first_name, last_name)')
      .eq('tournament_id', tournamentId).order('round').order('position'),
    supabase.from('tournaments').select('bracket_size, status').eq('id', tournamentId).single()
  ]);

  var matches = matchesRes.data;
  var t = tRes.data;

  if (!matches || matches.length === 0) {
    document.getElementById('orgBracketModalContent').innerHTML = '<div class="card-empty">Draw not generated yet</div>';
    return;
  }

  var totalRounds = Math.log2(t.bracket_size);
  var rNames = {};
  for (var r = 1; r <= totalRounds; r++) {
    if (r === totalRounds) rNames[r] = 'Final';
    else if (r === totalRounds - 1) rNames[r] = 'Semi Finals';
    else if (r === totalRounds - 2) rNames[r] = 'Quarter Finals';
    else if (r === totalRounds - 3) rNames[r] = 'Round of 16';
    else rNames[r] = 'Round ' + r;
  }

  var byRound = {};
  matches.forEach(function(m) {
    if (m.status === 'bye') return;
    if (!byRound[m.round]) byRound[m.round] = [];
    byRound[m.round].push(m);
  });

  var finalMatches = (byRound[totalRounds] || []);
  var champion = finalMatches.length > 0 && finalMatches[0].winner ? finalMatches[0].winner : null;

  var checkSVG = '<svg style="display:inline;vertical-align:middle;margin-right:0.25rem;" width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>';
  var starSVG = '<svg width="22" height="22" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>';

  var html = '';

  if (champion) {
    html += '<div style="background:linear-gradient(135deg,#166534,#16a34a);color:white;border-radius:var(--radius);padding:1.1rem 1.25rem;margin-bottom:1.5rem;display:flex;align-items:center;gap:1rem;">' +
      '<div style="width:48px;height:48px;background:rgba(255,255,255,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#fbbf24;">' + starSVG + '</div>' +
      '<div>' +
        '<div style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;opacity:0.75;margin-bottom:0.2rem;">Tournament Winner</div>' +
        '<div style="font-size:1.2rem;font-weight:700;line-height:1.2;">' + champion.first_name + ' ' + champion.last_name + '</div>' +
      '</div>' +
    '</div>';
  }

  Object.keys(byRound).sort(function(a, b) { return a - b; }).forEach(function(r) {
    var roundMatches = byRound[r];
    var roundName = rNames[r] || 'Round ' + r;
    var allComplete = roundMatches.every(function(m) { return m.status === 'completed'; });
    var isFinal = parseInt(r) === totalRounds;
    var useGrid = roundMatches.length > 1 && !isFinal;

    html += '<div style="margin-bottom:1.25rem;">' +
      '<div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.75rem;padding-bottom:0.5rem;border-bottom:2px solid var(--gray-100);">' +
        '<span style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--gray-600);">' + roundName + '</span>' +
        (allComplete
          ? '<span style="font-size:0.65rem;background:#dcfce7;color:#166534;padding:0.15rem 0.5rem;border-radius:99px;font-weight:600;">Complete</span>'
          : '<span style="font-size:0.65rem;background:#fef9c3;color:#854d0e;padding:0.15rem 0.5rem;border-radius:99px;font-weight:600;">In Progress</span>') +
      '</div>' +
      '<div style="display:grid;grid-template-columns:' + (useGrid ? 'repeat(auto-fill,minmax(240px,1fr))' : '1fr') + ';gap:0.65rem;">';

    roundMatches.forEach(function(m) {
      var p1Name = m.player1 ? m.player1.first_name + ' ' + m.player1.last_name : 'TBD';
      var p2Name = m.player2 ? m.player2.first_name + ' ' + m.player2.last_name : 'TBD';
      var w1 = m.winner_id && m.player1 && m.winner_id === m.player1.id;
      var w2 = m.winner_id && m.player2 && m.winner_id === m.player2.id;
      var isPending = !m.winner_id && (m.player1 || m.player2);

      html += '<div style="border:1px solid ' + (isFinal ? '#86efac' : 'var(--gray-200)') + ';border-radius:var(--radius);overflow:hidden;box-shadow:' + (isFinal ? '0 2px 8px rgba(22,163,74,0.12)' : '0 1px 3px rgba(0,0,0,0.06)') + ';">' +
        '<div style="padding:0.65rem 0.85rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--gray-100);background:' + (w1 ? '#f0fdf4' : 'white') + ';">' +
          '<div style="display:flex;align-items:center;gap:0.35rem;min-width:0;">' +
            (w1
              ? '<span style="flex-shrink:0;width:20px;height:20px;background:#16a34a;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:white;">' + checkSVG + '</span>'
              : '<span style="flex-shrink:0;width:20px;height:20px;background:' + (w2 ? 'var(--gray-200)' : 'var(--gray-100)') + ';border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:0.6rem;color:var(--gray-400);">1</span>') +
            '<span style="font-size:0.875rem;font-weight:' + (w1 ? '700' : '500') + ';color:' + (w1 ? '#166534' : (w2 ? 'var(--gray-400)' : 'var(--gray-800)')) + ';' + (w2 ? 'text-decoration:line-through;' : '') + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + p1Name + '</span>' +
          '</div>' +
          (w1 && m.score ? '<span style="flex-shrink:0;font-size:0.75rem;font-weight:700;color:#166534;background:#dcfce7;padding:0.15rem 0.5rem;border-radius:99px;margin-left:0.4rem;">' + m.score + '</span>' : '') +
        '</div>' +
        '<div style="padding:0.65rem 0.85rem;display:flex;justify-content:space-between;align-items:center;background:' + (w2 ? '#f0fdf4' : 'white') + ';">' +
          '<div style="display:flex;align-items:center;gap:0.35rem;min-width:0;">' +
            (w2
              ? '<span style="flex-shrink:0;width:20px;height:20px;background:#16a34a;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:white;">' + checkSVG + '</span>'
              : '<span style="flex-shrink:0;width:20px;height:20px;background:' + (w1 ? 'var(--gray-200)' : 'var(--gray-100)') + ';border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:0.6rem;color:var(--gray-400);">2</span>') +
            '<span style="font-size:0.875rem;font-weight:' + (w2 ? '700' : '500') + ';color:' + (w2 ? '#166534' : (w1 ? 'var(--gray-400)' : 'var(--gray-800)')) + ';' + (w1 ? 'text-decoration:line-through;' : '') + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + p2Name + '</span>' +
          '</div>' +
          (w2 && m.score ? '<span style="flex-shrink:0;font-size:0.75rem;font-weight:700;color:#166534;background:#dcfce7;padding:0.15rem 0.5rem;border-radius:99px;margin-left:0.4rem;">' + m.score + '</span>' : '') +
          (isPending && !w1 && !w2 ? '<span style="font-size:0.65rem;color:var(--gray-400);font-style:italic;flex-shrink:0;">Pending</span>' : '') +
        '</div>' +
      '</div>';
    });

    html += '</div></div>';
  });

  document.getElementById('orgBracketModalContent').innerHTML = html;
}

// ---- Results Tab ----
var _resultsLoaded = false;
async function loadResults() {
  if (_resultsLoaded) return; // Only load once per session unless forced
  _resultsLoaded = true;
  var container = document.getElementById('results-list');
  if (!container) return;
  container.innerHTML = '<div class="card-empty">Loading...</div>';

  var { data: tournaments } = await supabase.from('tournaments')
    .select('id, name, status, bracket_size, clubs(name)')
    .eq('club_id', orgClubId)
    .in('status', ['in_progress', 'completed'])
    .order('created_at', { ascending: false });

  if (!tournaments || tournaments.length === 0) {
    container.innerHTML = '<div class="card-empty">No active or completed tournaments yet.</div>';
    return;
  }

  var statusLabel = { in_progress: 'Live', completed: 'Completed' };
  var statusColor = { in_progress: 'badge-green', completed: 'badge-gray' };

  container.innerHTML = tournaments.map(function(t) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem;border:1px solid var(--gray-200);border-radius:var(--radius);margin-bottom:0.5rem;background:white;">' +
      '<div>' +
        '<div style="font-weight:600;font-size:0.9rem;">' + t.name + '</div>' +
        '<div style="font-size:0.78rem;color:var(--gray-500);">' + (t.clubs?.name || '') + ' &bull; ' + t.bracket_size + ' players</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:0.5rem;">' +
        '<span class="badge ' + (statusColor[t.status] || 'badge-gray') + '">' + (statusLabel[t.status] || t.status) + '</span>' +
        '<button class="btn btn-sm btn-secondary" onclick="viewOrgBracket(\'' + t.id + '\',\'' + t.name.replace(/'/g, "\\'") + '\')">View Results</button>' +
        (t.status === 'in_progress' ? '<button class="btn btn-sm btn-primary" style="font-size:0.72rem;" onclick="openOverrideResult(\'' + t.id + '\',\'' + t.name.replace(/'/g, "\\'") + '\')">Override Result</button>' : '') +
      '</div>' +
    '</div>';
  }).join('');
}

// ---- Match Result Override ----
async function openOverrideResult(tournamentId, name) {
  var modal = document.getElementById('overrideResultModal');
  document.getElementById('overrideTournamentName').textContent = name;
  document.getElementById('overrideMatchSelect').innerHTML = '<option disabled selected>Loading matches...</option>';
  document.getElementById('overrideScore').value = '';
  modal.classList.add('active');

  var { data: matches } = await supabase.from('matches')
    .select('id, round, score, status, player1_id, player2_id, winner_id, player1:members!matches_player1_id_fkey(id, first_name, last_name), player2:members!matches_player2_id_fkey(id, first_name, last_name), winner:members!matches_winner_id_fkey(id, first_name, last_name)')
    .eq('tournament_id', tournamentId)
    .neq('status', 'bye')
    .order('round').order('position');

  window._overrideMatches = matches || [];
  window._overrideTournamentId = tournamentId;

  var totalRounds = matches && matches.length > 0
    ? Math.max.apply(null, matches.map(function(m) { return m.round; }))
    : 1;

  var rNames = {};
  for (var r = 1; r <= totalRounds; r++) {
    if (r === totalRounds) rNames[r] = 'Final';
    else if (r === totalRounds - 1) rNames[r] = 'Semi Finals';
    else if (r === totalRounds - 2) rNames[r] = 'Quarter Finals';
    else rNames[r] = 'Round ' + r;
  }

  var select = document.getElementById('overrideMatchSelect');
  // Filter to matches where both players are assigned (use raw IDs as reliable fallback)
  var validMatches = (matches || []).filter(function(m) { return m.player1_id && m.player2_id; });
  if (validMatches.length === 0) {
    select.innerHTML = '<option disabled>No matches available</option>';
    return;
  }

  select.innerHTML = validMatches.map(function(m) {
    var p1 = m.player1 ? m.player1.first_name + ' ' + m.player1.last_name : 'Player 1';
    var p2 = m.player2 ? m.player2.first_name + ' ' + m.player2.last_name : 'Player 2';
    var label = (rNames[m.round] || 'Round ' + m.round) + ': ' + p1 + ' vs ' + p2;
    return '<option value="' + m.id + '">' + label + '</option>';
  }).join('');

  // Pre-fill winner/score when match selection changes
  select.onchange = function() {
    var m = (window._overrideMatches || []).find(function(x) { return x.id === select.value; });
    if (!m) return;
    document.getElementById('overrideScore').value = m.score || '';
    var p1Opt = document.getElementById('overrideWinnerP1');
    var p2Opt = document.getElementById('overrideWinnerP2');
    // Use raw IDs as values (reliable even if join data is unavailable)
    p1Opt.value = m.player1_id || (m.player1 && m.player1.id) || '';
    p1Opt.textContent = m.player1 ? m.player1.first_name + ' ' + m.player1.last_name : 'Player 1';
    p2Opt.value = m.player2_id || (m.player2 && m.player2.id) || '';
    p2Opt.textContent = m.player2 ? m.player2.first_name + ' ' + m.player2.last_name : 'Player 2';
    var winnerSelect = document.getElementById('overrideWinnerSelect');
    winnerSelect.value = m.winner_id || '';
  };
  select.dispatchEvent(new Event('change'));
}

async function submitOverrideResult() {
  var matchId = document.getElementById('overrideMatchSelect').value;
  var winnerId = document.getElementById('overrideWinnerSelect').value;
  var score = document.getElementById('overrideScore').value.trim();

  if (!matchId || !winnerId) { alert('Please select a match and winner.'); return; }

  var btn = document.getElementById('overrideSubmitBtn');
  btn.disabled = true; btn.textContent = 'Saving...';

  var { error } = await supabase.from('matches')
    .update({ winner_id: winnerId, score: score || null, status: 'completed' })
    .eq('id', matchId);

  btn.disabled = false; btn.textContent = 'Override Result';

  if (error) { alert('Error: ' + error.message); return; }

  // Advance winner to next match
  var { data: match } = await supabase.from('matches').select('next_match_id, position, tournament_id, round').eq('id', matchId).single();
  if (match && match.next_match_id) {
    var field = match.position % 2 === 1 ? 'player1_id' : 'player2_id';
    await supabase.from('matches').update({ [field]: winnerId, status: 'in_progress' }).eq('id', match.next_match_id);
  }

  document.getElementById('overrideResultModal').classList.remove('active');
  _resultsLoaded = false;
  loadResults();
  loadTournaments();
  alert('Result overridden successfully.');
}

async function loadMembers() {
  const container = document.getElementById('members-table-body');
  if (!container) return;

  const { data: memberships } = await supabase
    .from('club_memberships')
    .select('*, members!inner(id, first_name, last_name, phone, email)')
    .eq('club_id', orgClubId);

  const members = (memberships || []).map(function(cm) {
    return {
      id: cm.members.id,
      first_name: cm.members.first_name,
      last_name: cm.members.last_name,
      handicap: cm.handicap,
      phone: cm.members.phone,
      email: cm.members.email,
      role: cm.role,
      membership_id: cm.id,
      status: cm.status || 'active',
      member_type: cm.member_type || 'mens'
    };
  }).sort(function(a, b) { return a.last_name.localeCompare(b.last_name); });

  if (members.length === 0) {
    container.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--gray-400);">No members yet</td></tr>';
    return;
  }

  container.innerHTML = members.map(m => {
    const initials = m.first_name[0] + m.last_name[0];
    const roleBadge = m.role === 'organiser'
      ? '<span class="badge badge-gold">Organiser</span>'
      : '<span class="badge badge-green">Golfer</span>';
    const typeBadge = m.member_type === 'ladies'
      ? '<span class="badge badge-blue" style="font-size:0.6rem;">Ladies</span>'
      : '<span class="badge badge-gray" style="font-size:0.6rem;">Mens</span>';
    const statusBadge = m.status === 'paused'
      ? '<span class="badge badge-red">Paused</span>'
      : '';
    const pauseBtn = m.status === 'paused'
      ? `<button class="btn btn-sm btn-primary" onclick="toggleMemberStatus('${m.membership_id}','active')" style="font-size:0.7rem;">Activate</button>`
      : `<button class="btn btn-sm btn-danger" onclick="toggleMemberStatus('${m.membership_id}','paused')" style="font-size:0.7rem;">Pause</button>`;
    return `
      <tr style="${m.status === 'paused' ? 'opacity:0.5;' : ''}">
        <td data-label="Name">
          <div style="display:flex;align-items:center;gap:0.5rem;">
            <div style="width:28px;height:28px;border-radius:50%;background:var(--green-100);color:var(--green-700);display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:600;">${initials}</div>
            <strong>${m.first_name} ${m.last_name}</strong> ${typeBadge} ${statusBadge}
          </div>
        </td>
        <td data-label="Handicap">${m.handicap}</td>
        <td data-label="Phone">${m.phone || '-'}</td>
        <td data-label="Email">${m.email}</td>
        <td data-label="Role">${roleBadge}</td>
        <td data-label="Actions">
          <div style="display:flex;gap:0.3rem;flex-wrap:wrap;">
            <button class="btn btn-sm btn-secondary" onclick="editMember('${m.id}','${m.first_name}','${m.last_name.replace(/'/g, "\\'")}',${m.handicap},'${m.phone || ''}','${m.email}','${m.role}','${m.member_type}','${m.membership_id}')" style="font-size:0.7rem;">Edit</button>
            ${pauseBtn}
          </div>
        </td>
      </tr>`;
  }).join('');
}

async function loadActivityLog() {
  const clubId = currentOrganiser.club_id;
  const container = document.getElementById('activity-log');
  if (!container) return;

  const { data: recentMatches } = await supabase
    .from('matches')
    .select(`
      id, score, status, created_at,
      tournaments!inner(name, club_id),
      winner:members!matches_winner_id_fkey(first_name, last_name),
      player1:members!matches_player1_id_fkey(first_name, last_name),
      player2:members!matches_player2_id_fkey(first_name, last_name)
    `)
    .eq('tournaments.club_id', clubId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(10);

  if (!recentMatches || recentMatches.length === 0) {
    container.innerHTML = '<p style="padding:1rem;text-align:center;color:var(--gray-400);">No activity yet</p>';
    return;
  }

  container.innerHTML = recentMatches.map(m => {
    const loser = m.winner?.last_name === m.player1?.last_name ? m.player2 : m.player1;
    const timeAgo = getOrgTimeAgo(new Date(m.created_at));
    return `
      <div class="notification-item">
        <div class="notification-icon" style="background:var(--green-100);color:var(--green-700);"><svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg></div>
        <div class="notification-content">
          <h4>Score Reported</h4>
          <p>${m.winner?.first_name?.[0]}. ${m.winner?.last_name} beat ${loser?.first_name?.[0]}. ${loser?.last_name} ${m.score || ''} in ${m.tournaments?.name || ''}</p>
        </div>
        <span class="notification-time">${timeAgo}</span>
      </div>`;
  }).join('');
}

// Re-Draw
async function redraw(tournamentId, bracketSize) {
  var confirmation = prompt('This will delete all current matches and results, and generate a new random draw.\n\nType REDRAW to confirm:');
  if (confirmation !== 'REDRAW') {
    if (confirmation !== null) alert('Cancelled. You must type REDRAW exactly.');
    return;
  }
  // Reset tournament status so generateDraw works
  await supabase.from('tournaments').update({ status: 'entries_open' }).eq('id', tournamentId);
  await generateDraw(tournamentId, bracketSize);
}

// Delete Tournament
async function deleteTournament(tournamentId, tournamentName) {
  var confirmation = prompt('To delete "' + tournamentName + '", type DELETE below:');
  if (confirmation !== 'DELETE') {
    if (confirmation !== null) alert('Deletion cancelled. You must type DELETE exactly.');
    return;
  }

  // Delete matches first (cascade should handle it but be explicit)
  await supabase.from('matches').delete().eq('tournament_id', tournamentId);
  await supabase.from('tournament_entries').delete().eq('tournament_id', tournamentId);
  var { error } = await supabase.from('tournaments').delete().eq('id', tournamentId);

  if (error) {
    alert('Error deleting: ' + error.message);
    return;
  }

  alert('"' + tournamentName + '" has been deleted.');
  loadTournaments();
  loadOrgStats();
}

// Round Deadlines
async function openRoundDeadlines(tournamentId, tournamentName, bracketSize) {
  var totalRounds = Math.log2(bracketSize);
  var modal = document.getElementById('deadlinesModal');
  document.getElementById('deadlinesTournamentName').textContent = tournamentName;
  document.getElementById('deadlinesTournamentId').value = tournamentId;

  // Fetch current deadlines
  var { data: tournament } = await supabase.from('tournaments').select('round_deadlines').eq('id', tournamentId).single();
  var deadlines = tournament?.round_deadlines || {};

  var html = '';
  for (var r = 1; r <= totalRounds; r++) {
    var rName = getRoundName(r, totalRounds);
    var val = deadlines[r] || '';
    html += '<div class="form-group" style="display:flex;align-items:center;gap:0.75rem;">' +
      '<label style="min-width:120px;font-weight:600;font-size:0.85rem;">' + rName + '</label>' +
      '<input type="date" class="form-input" id="deadline-round-' + r + '" value="' + val + '" style="flex:1;">' +
    '</div>';
  }

  document.getElementById('deadlines-fields').innerHTML = html;
  modal.classList.add('active');
}

async function saveRoundDeadlines() {
  var tournamentId = document.getElementById('deadlinesTournamentId').value;

  // Get bracket size to know how many rounds
  var { data: tournament } = await supabase.from('tournaments').select('bracket_size').eq('id', tournamentId).single();
  var totalRounds = Math.log2(tournament.bracket_size);

  var deadlines = {};
  for (var r = 1; r <= totalRounds; r++) {
    var input = document.getElementById('deadline-round-' + r);
    if (input && input.value) deadlines[r] = input.value;
  }

  // Save to tournament
  var { error } = await supabase.from('tournaments').update({ round_deadlines: deadlines }).eq('id', tournamentId);
  if (error) { alert('Error: ' + error.message); return; }

  // Also update match deadlines per round
  for (var r in deadlines) {
    await supabase.from('matches')
      .update({ deadline: deadlines[r] })
      .eq('tournament_id', tournamentId)
      .eq('round', parseInt(r));
  }

  document.getElementById('deadlinesModal').classList.remove('active');
  alert('Round deadlines saved!');
  loadTournaments();
}

// Enrol members in a tournament
async function openEnrolTournament(tournamentId, tournamentName, bracketSize) {
  document.getElementById('enrolTournamentId').value = tournamentId;
  document.getElementById('enrolTournamentName').textContent = tournamentName + ' (' + bracketSize + ' player bracket)';
  document.getElementById('enrolTournamentModal').classList.add('active');

  var container = document.getElementById('enrol-member-list');
  container.innerHTML = '<p style="text-align:center;color:var(--gray-400);">Loading...</p>';

  // Get club members
  var { data: memberships } = await supabase
    .from('club_memberships')
    .select('*, members!inner(id, first_name, last_name, handicap)')
    .eq('club_id', orgClubId)
    .eq('status', 'active');

  // Get existing entries
  var { data: entries } = await supabase
    .from('tournament_entries')
    .select('member_id')
    .eq('tournament_id', tournamentId);

  var enteredIds = new Set((entries || []).map(function(e) { return e.member_id; }));
  var entryCount = enteredIds.size;

  var members = (memberships || []).map(function(cm) {
    return { id: cm.members.id, name: cm.members.first_name + ' ' + cm.members.last_name, handicap: cm.members.handicap };
  }).sort(function(a, b) { return a.name.localeCompare(b.name); });

  container.innerHTML = '<div style="font-size:0.8rem;color:var(--gray-500);margin-bottom:0.75rem;">' + entryCount + ' / ' + bracketSize + ' entered</div>' +
    members.map(function(m) {
      var isEntered = enteredIds.has(m.id);
      var btn = isEntered
        ? '<button class="btn btn-sm btn-danger" style="font-size:0.7rem;" onclick="removeTournamentEntry(\'' + tournamentId + '\',\'' + m.id + '\',\'' + tournamentName.replace(/'/g, "\\'") + '\',' + bracketSize + ')">Remove</button>'
        : '<button class="btn btn-sm btn-primary" style="font-size:0.7rem;" onclick="addTournamentEntry(\'' + tournamentId + '\',\'' + m.id + '\',\'' + tournamentName.replace(/'/g, "\\'") + '\',' + bracketSize + ')">Enrol</button>';
      var badge = isEntered ? '<span class="badge badge-green" style="font-size:0.6rem;">Entered</span>' : '';
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0.75rem;border-bottom:1px solid var(--gray-100);">' +
        '<div><strong style="font-size:0.85rem;">' + m.name + '</strong> ' + badge + '<br><span style="font-size:0.75rem;color:var(--gray-500);">Handicap ' + m.handicap + '</span></div>' +
        btn + '</div>';
    }).join('');
}

async function addTournamentEntry(tournamentId, memberId, tournamentName, bracketSize) {
  var { error } = await supabase.from('tournament_entries').insert({
    tournament_id: tournamentId,
    member_id: memberId
  });
  if (error) { alert('Error: ' + error.message); return; }
  openEnrolTournament(tournamentId, tournamentName, bracketSize);
  loadTournaments();
}

async function removeTournamentEntry(tournamentId, memberId, tournamentName, bracketSize) {
  var { error } = await supabase.from('tournament_entries')
    .delete()
    .eq('tournament_id', tournamentId)
    .eq('member_id', memberId);
  if (error) { alert('Error: ' + error.message); return; }
  openEnrolTournament(tournamentId, tournamentName, bracketSize);
  loadTournaments();
}

// Club logo
async function displayClubIdentity() {
  var nameEl = document.getElementById('club-display-name');
  var logoEl = document.getElementById('club-logo-display');
  var removeBtn = document.getElementById('removeLogo');

  // Fetch fresh club data with logo_url
  var { data: club } = await supabase.from('clubs').select('name, logo_url').eq('id', orgClubId).single();
  if (!club) return;

  if (nameEl) nameEl.textContent = club.name;

  if (club.logo_url) {
    logoEl.innerHTML = '<img src="' + club.logo_url + '" alt="Club Logo" style="width:100%;height:100%;object-fit:cover;">';
    if (removeBtn) removeBtn.style.display = 'inline-flex';
    // Also update navbar brand icon
    var brandIcon = document.querySelector('.navbar-brand .brand-icon');
    if (brandIcon) brandIcon.innerHTML = '<img src="' + club.logo_url + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius);">';
  } else {
    logoEl.innerHTML = '<img src="logo.png" alt="Club Logo" style="width:100%;height:100%;object-fit:cover;">';
    if (removeBtn) removeBtn.style.display = 'none';
  }
}

async function uploadClubLogo(input) {
  var file = input.files[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    alert('Logo must be under 2MB.');
    return;
  }

  var ext = file.name.split('.').pop().toLowerCase();
  if (!['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) {
    alert('Please upload an image file (JPG, PNG, GIF, SVG, or WebP).');
    return;
  }

  var fileName = orgClubId + '.' + ext;

  // Upload to Supabase Storage
  var { error: uploadErr } = await supabase.storage
    .from('club-logos')
    .upload(fileName, file, { upsert: true, contentType: file.type });

  if (uploadErr) {
    alert('Upload error: ' + uploadErr.message);
    return;
  }

  // Get the public URL
  var { data: urlData } = supabase.storage.from('club-logos').getPublicUrl(fileName);
  var logoUrl = urlData.publicUrl;

  // Save to clubs table
  var { error: updateErr } = await supabase.from('clubs').update({ logo_url: logoUrl }).eq('id', orgClubId);
  if (updateErr) {
    alert('Error saving logo URL: ' + updateErr.message);
    return;
  }

  alert('Logo uploaded!');
  displayClubIdentity();
}

async function removeClubLogo() {
  if (!confirm('Remove the club logo?')) return;

  await supabase.from('clubs').update({ logo_url: null }).eq('id', orgClubId);

  // Try to delete from storage (non-critical if fails)
  var { data: files } = await supabase.storage.from('club-logos').list('', { search: orgClubId });
  if (files && files.length > 0) {
    await supabase.storage.from('club-logos').remove(files.map(function(f) { return f.name; }));
  }

  displayClubIdentity();
}

function openCreateTournament() {
  document.getElementById('createModal').classList.add('active');
}

// Tournament management actions
async function createTournament() {
  const name = document.getElementById('newTournamentName').value.trim();
  const bracketSize = parseInt(document.getElementById('newBracketSize').value);
  const deadline = document.getElementById('newEntryDeadline').value;
  const roundDays = parseInt(document.getElementById('newRoundDays').value);
  const description = document.getElementById('newDescription').value.trim();
  const clubId = orgClubId;

  if (!name) { alert('Please enter a tournament name.'); return; }

  const byeMode = document.getElementById('newByeMode')?.value || 'handicap';

  const { error } = await supabase
    .from('tournaments')
    .insert({
      club_id: clubId,
      created_by: currentOrganiser.id,
      name: name,
      bracket_size: bracketSize,
      status: 'entries_open',
      entry_deadline: deadline || null,
      round_days: roundDays,
      description: description || null,
      bye_mode: byeMode
    });

  if (error) { alert('Error: ' + error.message); return; }

  document.getElementById('createModal').classList.remove('active');
  alert('Tournament created! Members will see it in their dashboard.');
  await Promise.all([loadTournaments(), loadOrgStats()]);
}

async function openEntries(tournamentId) {
  await supabase.from('tournaments').update({ status: 'entries_open' }).eq('id', tournamentId);
  loadTournaments();
  loadOrgStats();
}

async function closeEntries(tournamentId) {
  if (!confirm('Close entries for this tournament? No more players can enter.')) return;
  await supabase.from('tournaments').update({ status: 'in_progress' }).eq('id', tournamentId);
  alert('Entries closed. You can now generate the draw.');
  loadTournaments();
  loadOrgStats();
}

async function generateDraw(tournamentId, bracketSize) {
  if (!confirm('Generate the draw? This will create the bracket.')) return;

  // Get entries with handicap data
  var { data: entries } = await supabase
    .from('tournament_entries')
    .select('member_id, members(id, first_name, last_name, handicap)')
    .eq('tournament_id', tournamentId);

  if (!entries || entries.length < 2) {
    alert('Need at least 2 entries to generate a draw.');
    return;
  }

  // Get tournament bye_mode
  var { data: tournament } = await supabase.from('tournaments').select('bye_mode').eq('id', tournamentId).single();
  var byeMode = tournament?.bye_mode || 'handicap';

  // Build player array
  var players = entries.map(function(e) {
    return { id: e.members.id, handicap: e.members.handicap || 99, first_name: e.members.first_name, last_name: e.members.last_name };
  });

  // Use the draw engine
  var result = await generateTournamentDraw(tournamentId, players, bracketSize, byeMode);

  if (result.error) {
    alert('Error generating draw: ' + result.error.message);
  } else {
    alert('Draw generated! ' + result.players + ' players, ' + result.byes + ' byes, ' + result.bracketSize + '-player bracket.');
  }

  await Promise.all([loadTournaments(), loadOrgStats()]);
}

// ---- Print Draw Modal ----

var _printCurrentType = 'draw'; // 'draw' or 'names'
var _printCurrentContent = '';

// Print from the View Draw modal (uses the currently open tournament)
async function printFromViewDraw(type) {
  if (!_currentViewTournamentId) return;
  document.getElementById('orgBracketModal').classList.remove('active');
  await openPrintModal(_currentViewTournamentId, type);
}

async function openPrintDrawModal() {
  try {
    await openPrintModal(null, 'draw');
  } catch(err) {
    console.error(err);
    alert('Error opening print modal: ' + err.message);
  }
}

async function openPrintModal(preSelectId, type) {
  var modal = document.getElementById('printDrawModal');
  var select = document.getElementById('printTournamentSelect');
  var preview = document.getElementById('printDrawPreview');
  var printBtn = document.getElementById('doPrintBtn');

  preview.innerHTML = '<p style="text-align:center;color:var(--gray-400);padding:2rem 0;">Loading...</p>';
  printBtn.disabled = true;
  _printCurrentType = type || 'draw';
  _printCurrentContent = '';
  modal.classList.add('active');

  // Load tournaments
  var { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, name, status, bracket_size')
    .eq('club_id', orgClubId)
    .in('status', ['in_progress', 'completed', 'entries_open'])
    .order('created_at', { ascending: false });

  if (!tournaments || tournaments.length === 0) {
    select.innerHTML = '<option value="">No tournaments available</option>';
    preview.innerHTML = '<p style="text-align:center;color:var(--gray-400);padding:2rem 0;">No tournaments found.</p>';
    return;
  }

  var statusLabel = { in_progress: 'Live', completed: 'Completed', entries_open: 'Open' };
  select.innerHTML = tournaments.map(function(t) {
    return '<option value="' + t.id + '">' +
      t.name + ' (' + (statusLabel[t.status] || t.status) + ')' +
      '</option>';
  }).join('');

  // Auto-select: prefer the passed ID, then first in_progress, then first
  var autoId = preSelectId ||
    (tournaments.find(function(t) { return t.status === 'in_progress'; }) || tournaments[0]).id;
  select.value = autoId;

  // Sync button highlights then load preview
  document.getElementById('previewDrawBtn').classList.toggle('btn-primary', _printCurrentType === 'draw');
  document.getElementById('previewDrawBtn').classList.toggle('btn-secondary', _printCurrentType !== 'draw');
  document.getElementById('previewNamesBtn').classList.toggle('btn-primary', _printCurrentType === 'names');
  document.getElementById('previewNamesBtn').classList.toggle('btn-secondary', _printCurrentType !== 'names');

  await loadPrintPreview();
}

async function loadPrintPreview(type) {
  var select = document.getElementById('printTournamentSelect');
  var preview = document.getElementById('printDrawPreview');
  var printBtn = document.getElementById('doPrintBtn');
  var drawBtn = document.getElementById('previewDrawBtn');
  var namesBtn = document.getElementById('previewNamesBtn');

  if (type) _printCurrentType = type;

  // Highlight selected choice button
  var selStyle = 'border:2px solid var(--green-600);border-radius:var(--radius);padding:0.75rem;background:#f0fdf4;cursor:pointer;text-align:left;';
  var defStyle = 'border:2px solid var(--gray-200);border-radius:var(--radius);padding:0.75rem;background:white;cursor:pointer;text-align:left;';
  drawBtn.setAttribute('style', _printCurrentType === 'draw' ? selStyle : defStyle);
  namesBtn.setAttribute('style', _printCurrentType === 'names' ? selStyle : defStyle);

  var tournamentId = select.value;
  if (!tournamentId) {
    preview.style.display = 'block';
    preview.innerHTML = '<p style="text-align:center;color:var(--gray-400);padding:2rem 0;">No tournaments available to print.</p>';
    printBtn.disabled = true;
    return;
  }

  preview.style.display = 'block';
  preview.innerHTML = '<p style="text-align:center;color:var(--gray-400);padding:2rem 0;">Loading...</p>';
  printBtn.disabled = true;

  // Get club logo
  var clubName = 'Golf Club';
  var logoHTML = '';
  try {
    var { data: clubData } = await supabase.from('clubs').select('logo_url, name').eq('id', orgClubId).single();
    clubName = clubData?.name || (currentOrganiser?.clubs?.name) || 'Golf Club';
    logoHTML = clubData?.logo_url ? '<img src="' + clubData.logo_url + '" alt="">' : '';
  } catch(e) { console.error('Error fetching club data for print:', e); }
  var dateStr = new Date().toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });

  if (_printCurrentType === 'draw') {
    // Load matches
    var [matchesRes, tRes] = await Promise.all([
      supabase.from('matches')
        .select('*, player1:members!matches_player1_id_fkey(first_name, last_name), player2:members!matches_player2_id_fkey(first_name, last_name), winner:members!matches_winner_id_fkey(first_name, last_name)')
        .eq('tournament_id', tournamentId)
        .order('round').order('position'),
      supabase.from('tournaments').select('bracket_size, name').eq('id', tournamentId).single()
    ]);

    var matches = matchesRes.data || [];
    var bracketSize = tRes.data?.bracket_size || 0;
    var tName = tRes.data?.name || '';
    var totalRounds = bracketSize > 0 ? Math.log2(bracketSize) : 0;

    var rNames = {};
    for (var r = 1; r <= totalRounds; r++) {
      if (r === totalRounds) rNames[r] = 'Final';
      else if (r === totalRounds - 1) rNames[r] = 'Semi Finals';
      else if (r === totalRounds - 2) rNames[r] = 'Quarter Finals';
      else if (r === totalRounds - 3) rNames[r] = 'Round of 16';
      else rNames[r] = 'Round ' + r;
    }

    var matchRows = '';
    var curRound = 0;
    matches.forEach(function(m) {
      if (m.round !== curRound) {
        curRound = m.round;
        matchRows += '<tr class="round-row"><td colspan="4">' + (rNames[m.round] || 'Round ' + m.round) + '</td></tr>';
      }
      if (m.status === 'bye') return;
      var p1 = m.player1 ? m.player1.first_name[0] + '. ' + m.player1.last_name : 'TBD';
      var p2 = m.player2 ? m.player2.first_name[0] + '. ' + m.player2.last_name : 'TBD';
      var result = m.status === 'completed'
        ? (m.winner ? m.winner.first_name[0] + '. ' + m.winner.last_name + (m.score ? ' (' + m.score + ')' : '') : '—')
        : (m.status === 'in_progress' ? 'In Progress' : '—');
      matchRows += '<tr><td>M' + m.position + '</td><td>' + p1 + '</td><td>' + p2 + '</td><td>' + result + '</td></tr>';
    });

    if (!matchRows) matchRows = '<tr><td colspan="4" style="text-align:center;color:#999;">Draw not generated yet</td></tr>';

    _printCurrentContent =
      '<div class="print-draw-header">' + logoHTML +
        '<h1>' + tName + '</h1>' +
        '<p>' + clubName + ' &bull; ' + bracketSize + ' Players &bull; Draw Sheet</p>' +
        '<p>Printed: ' + dateStr + '</p>' +
      '</div>' +
      '<div class="print-section-title">Draw</div>' +
      '<table class="print-table">' +
        '<thead><tr><th>Match</th><th>Player 1</th><th>Player 2</th><th>Result</th></tr></thead>' +
        '<tbody>' + matchRows + '</tbody>' +
      '</table>' +
      '<div class="print-footer">Generated by MyMatchPlayPal</div>';

  } else {
    // Load names
    var [entriesRes, tRes2] = await Promise.all([
      supabase.from('tournament_entries')
        .select('seed, members(first_name, last_name, handicap, phone, email)')
        .eq('tournament_id', tournamentId)
        .order('seed', { ascending: true }),
      supabase.from('tournaments').select('name').eq('id', tournamentId).single()
    ]);

    var entries = entriesRes.data || [];
    var tName2 = tRes2.data?.name || '';

    var rows = entries.map(function(e, i) {
      var m = e.members;
      return '<tr>' +
        '<td>' + (e.seed || (i + 1)) + '</td>' +
        '<td><strong>' + m.first_name + ' ' + m.last_name + '</strong></td>' +
        '<td>' + (m.handicap !== null ? m.handicap : '—') + '</td>' +
        '<td>' + (m.phone || '—') + '</td>' +
        '<td>' + (m.email || '—') + '</td>' +
        '</tr>';
    }).join('');

    if (!rows) rows = '<tr><td colspan="5" style="text-align:center;color:#999;">No entrants yet</td></tr>';

    _printCurrentContent =
      '<div class="print-draw-header">' + logoHTML +
        '<h1>' + tName2 + '</h1>' +
        '<p>' + clubName + ' &bull; Player List</p>' +
        '<p>Printed: ' + dateStr + '</p>' +
      '</div>' +
      '<div class="print-section-title">Entrants (' + entries.length + ')</div>' +
      '<table class="print-table">' +
        '<thead><tr><th>#</th><th>Name</th><th>Handicap</th><th>Phone</th><th>Email</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
      '<div class="print-footer">Generated by MyMatchPlayPal</div>';
  }

  preview.innerHTML = _printCurrentContent;
  printBtn.disabled = false;
}

function doPrint() {
  if (!_printCurrentContent) return;

  // Set page orientation
  var orientation = _printCurrentType === 'draw' ? 'landscape' : 'portrait';
  var styleEl = document.getElementById('printPageStyle');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'printPageStyle';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = '@page { size: A4 ' + orientation + '; margin: 12mm; }';

  // Populate the hidden print sheet
  var sheet = document.getElementById('printDrawSheet');
  sheet.innerHTML = _printCurrentContent;

  window.print();

  // Clean up after a short delay
  setTimeout(function() {
    sheet.innerHTML = '';
    styleEl.textContent = '';
  }, 1000);
}

function closePrintDrawModal() {
  document.getElementById('printDrawModal').classList.remove('active');
  _printCurrentContent = '';
  _printCurrentType = 'draw';
}

// Enrol a golfer directly
async function enrolGolfer() {
  var firstName = document.getElementById('enrolFirstName').value.trim();
  var lastName = document.getElementById('enrolLastName').value.trim();
  var email = document.getElementById('enrolEmail').value.trim();
  var phone = document.getElementById('enrolPhone').value.trim();
  var handicap = parseInt(document.getElementById('enrolHandicap').value) || 0;

  if (!firstName || !lastName || !email) {
    alert('First name, last name and email are required.');
    return;
  }

  // Check if member already exists by email
  var { data: existing } = await supabase
    .from('members')
    .select('id')
    .eq('email', email)
    .limit(1);

  var memberId;

  if (existing && existing.length > 0) {
    // Member exists, just add club membership
    memberId = existing[0].id;
  } else {
    // Create new member record (no auth_id — they haven't signed up yet)
    var { data: newMember, error: memberErr } = await supabase
      .from('members')
      .insert({
        club_id: orgClubId,
        first_name: firstName,
        last_name: lastName,
        email: email,
        phone: phone || null,
        handicap: handicap,
        role: 'golfer'
      })
      .select('id')
      .single();

    if (memberErr) {
      alert('Error creating member: ' + memberErr.message);
      return;
    }
    memberId = newMember.id;
  }

  var memberType = document.getElementById('enrolMemberType').value;

  // Create club membership
  var { error: cmErr } = await supabase
    .from('club_memberships')
    .insert({
      member_id: memberId,
      club_id: orgClubId,
      role: 'golfer',
      handicap: handicap,
      status: 'active',
      member_type: memberType
    });

  if (cmErr) {
    if (cmErr.message.indexOf('duplicate') !== -1 || cmErr.message.indexOf('unique') !== -1) {
      alert('This golfer is already a member of this club.');
    } else {
      alert('Error: ' + cmErr.message);
    }
    return;
  }

  // Send invite email for new members to set up their account
  if (!(existing && existing.length > 0)) {
    // Use Supabase magic link as invite — they click it to create their account
    var { error: inviteErr } = await supabase.auth.signInWithOtp({
      email: email,
      options: {
        shouldCreateUser: true,
        data: { first_name: firstName, last_name: lastName },
        emailRedirectTo: window.location.origin + '/mymatchplay/login.html'
      }
    });

    if (!inviteErr) {
      // Link will be sent. When they click it, they'll be signed in and can set a password.
      alert(firstName + ' ' + lastName + ' has been added!\n\nAn email invitation has been sent to ' + email + ' with a link to set up their account.');
    } else {
      alert(firstName + ' ' + lastName + ' has been added to the club!\n\nNote: Could not send invite email (' + inviteErr.message + '). Ask them to sign up at the login page with this email.');
    }
  }

  document.getElementById('enrolMemberModal').classList.remove('active');
  ['enrolFirstName','enrolLastName','enrolEmail','enrolPhone','enrolHandicap'].forEach(function(id) {
    document.getElementById(id).value = '';
  });
  alert(firstName + ' ' + lastName + ' has been added to the club!');
  loadMembers();
  loadOrgStats();
}

// Pause/Activate membership
async function toggleMemberStatus(membershipId, newStatus) {
  var action = newStatus === 'paused' ? 'pause' : 'activate';
  if (!confirm('Are you sure you want to ' + action + ' this membership?')) return;

  var { error } = await supabase
    .from('club_memberships')
    .update({ status: newStatus })
    .eq('id', membershipId);

  if (error) { alert('Error: ' + error.message); return; }
  loadMembers();
  loadOrgStats();
}

// Membership Requests
async function loadRequests() {
  var container = document.getElementById('requests-list');
  if (!container) return;

  var { data: requests } = await supabase
    .from('membership_requests')
    .select('*, members(first_name, last_name, phone, email), clubs(name)')
    .eq('club_id', orgClubId)
    .order('requested_at', { ascending: false });

  var pending = (requests || []).filter(function(r) { return r.status === 'pending'; });
  var resolved = (requests || []).filter(function(r) { return r.status !== 'pending'; });

  // Update badge count
  var badge = document.getElementById('request-count-badge');
  if (badge) badge.innerHTML = pending.length > 0 ? '<span class="badge badge-red" style="margin-left:0.25rem;">' + pending.length + '</span>' : '';

  if (!requests || requests.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:var(--gray-400);">No membership requests</p>';
    return;
  }

  var html = '';

  if (pending.length > 0) {
    html += '<h4 style="font-size:0.85rem;font-weight:600;color:var(--gray-600);margin-bottom:0.5rem;">Pending Requests</h4>';
    html += pending.map(function(r) {
      var name = r.members ? r.members.first_name + ' ' + r.members.last_name : 'Unknown';
      var phone = r.members?.phone || 'No phone';
      var email = r.members?.email || '';
      var date = new Date(r.requested_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' });
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem;border:1.5px solid var(--gold);border-radius:var(--radius);background:#fef3c7;margin-bottom:0.5rem;flex-wrap:wrap;gap:0.5rem;">' +
        '<div><strong>' + name + '</strong><br><span style="font-size:0.8rem;color:var(--gray-500);">' + email + ' &bull; ' + phone + ' &bull; ' + (r.message || '') + '</span><br><span style="font-size:0.7rem;color:var(--gray-400);">Requested ' + date + '</span></div>' +
        '<div style="display:flex;gap:0.4rem;">' +
          '<button class="btn btn-sm btn-primary" onclick="approveRequest(\'' + r.id + '\',\'' + r.member_id + '\',\'' + r.club_id + '\',\'' + (r.message || '').replace(/[^0-9]/g, '') + '\')">Approve</button>' +
          '<button class="btn btn-sm btn-danger" onclick="rejectRequest(\'' + r.id + '\')">Reject</button>' +
        '</div></div>';
    }).join('');
  }

  if (resolved.length > 0) {
    html += '<h4 style="font-size:0.85rem;font-weight:600;color:var(--gray-600);margin:1rem 0 0.5rem;">Recent Decisions</h4>';
    html += resolved.slice(0, 10).map(function(r) {
      var name = r.members ? r.members.first_name + ' ' + r.members.last_name : 'Unknown';
      var badge = r.status === 'approved' ? '<span class="badge badge-green">Approved</span>' : '<span class="badge badge-red">Rejected</span>';
      var date = r.reviewed_at ? new Date(r.reviewed_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' }) : '';
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0.75rem;background:var(--gray-100);border-radius:var(--radius);margin-bottom:0.35rem;font-size:0.85rem;">' +
        '<span>' + name + '</span><span>' + badge + ' ' + date + '</span></div>';
    }).join('');
  }

  container.innerHTML = html;
}

async function approveRequest(requestId, memberId, clubId, handicap) {
  // Create club membership
  var { error: membershipError } = await supabase
    .from('club_memberships')
    .insert({
      member_id: memberId,
      club_id: clubId,
      role: 'golfer',
      handicap: parseInt(handicap) || 0,
      status: 'active'
    });

  if (membershipError) {
    alert('Error creating membership: ' + membershipError.message);
    return;
  }

  // Update request status
  await supabase
    .from('membership_requests')
    .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: currentOrganiser.id })
    .eq('id', requestId);

  alert('Membership approved!');
  loadRequests();
  loadMembers();
  loadOrgStats();
}

async function rejectRequest(requestId) {
  if (!confirm('Reject this membership request?')) return;

  await supabase
    .from('membership_requests')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: currentOrganiser.id })
    .eq('id', requestId);

  alert('Request rejected.');
  loadRequests();
}

// WhatsApp Group for Tournament
async function createWhatsAppGroup(tournamentId, tournamentName) {
  var clubName = currentOrganiser.clubs?.name || 'Golf Club';
  var groupName = clubName + ' / ' + tournamentName;

  // Get all entered players with phone numbers
  var { data: entries } = await supabase
    .from('tournament_entries')
    .select('member_id, members(first_name, last_name, phone)')
    .eq('tournament_id', tournamentId);

  // If no entries yet, get all club members
  if (!entries || entries.length === 0) {
    var { data: members } = await supabase
      .from('members')
      .select('first_name, last_name, phone')
      .eq('club_id', orgClubId)
      .eq('role', 'golfer');
    entries = (members || []).map(function(m) { return { members: m }; });
  }

  var players = (entries || []).map(function(e) { return e.members; }).filter(function(m) { return m && m.phone; });
  var phoneList = players.map(function(m) { return m.first_name + ' ' + m.last_name + ': ' + m.phone; }).join('\n');
  var phoneNumbers = players.map(function(m) { return m.phone; }).join(', ');

  var modal = document.getElementById('whatsappGroupModal');
  document.getElementById('waGroupName').textContent = groupName;
  document.getElementById('waPlayerList').textContent = phoneList || 'No players with phone numbers found.';
  document.getElementById('waPhoneNumbers').value = phoneNumbers;
  document.getElementById('waGroupTournamentId').value = tournamentId;

  // Build the WhatsApp message for group creation
  var msg = '👋 Welcome to ' + groupName + '!\n\nThis is the official group for the ' + tournamentName + ' matchplay competition.\n\nPlayers:\n' + players.map(function(m) { return '⛳ ' + m.first_name + ' ' + m.last_name; }).join('\n') + '\n\nGood luck everyone! 🏆';
  document.getElementById('waGroupMessage').value = msg;

  modal.classList.add('active');
}

function copyPhoneNumbers() {
  var el = document.getElementById('waPhoneNumbers');
  el.select();
  document.execCommand('copy');
  alert('Phone numbers copied to clipboard!');
}

function copyGroupMessage() {
  var el = document.getElementById('waGroupMessage');
  el.select();
  document.execCommand('copy');
  alert('Group message copied to clipboard!');
}

async function saveGroupLink() {
  var tournamentId = document.getElementById('waGroupTournamentId').value;
  var link = document.getElementById('waGroupLink').value.trim();

  if (!link) {
    alert('Please paste the WhatsApp group invite link.');
    return;
  }

  var { error } = await supabase
    .from('tournaments')
    .update({ whatsapp_group_link: link })
    .eq('id', tournamentId);

  if (error) {
    alert('Error: ' + error.message);
    return;
  }

  document.getElementById('whatsappGroupModal').classList.remove('active');
  alert('Group link saved! Players and organisers can now join from the dashboard.');
  loadTournaments();
}

// Edit Member
function editMember(id, firstName, lastName, handicap, phone, email, role, memberType, membershipId) {
  document.getElementById('editMemberId').value = id;
  document.getElementById('editMemberFirstName').value = firstName;
  document.getElementById('editMemberLastName').value = lastName;
  document.getElementById('editMemberHandicap').value = handicap;
  document.getElementById('editMemberPhone').value = phone;
  document.getElementById('editMemberEmail').value = email;
  document.getElementById('editMemberRole').value = role;
  document.getElementById('editMemberType').value = memberType || 'mens';
  document.getElementById('editMemberId').dataset.membershipId = membershipId || '';

  // Only admin can change roles — hide role field for non-admins
  var roleGroup = document.getElementById('editMemberRoleGroup');
  if (roleGroup) {
    roleGroup.style.display = (currentOrganiser && currentOrganiser.is_admin) ? 'block' : 'none';
  }

  document.getElementById('editMemberModal').classList.add('active');
}

async function saveMember() {
  var id = document.getElementById('editMemberId').value;
  var membershipId = document.getElementById('editMemberId').dataset.membershipId;
  var firstName = document.getElementById('editMemberFirstName').value.trim();
  var lastName = document.getElementById('editMemberLastName').value.trim();
  var handicap = parseInt(document.getElementById('editMemberHandicap').value) || 0;
  var phone = document.getElementById('editMemberPhone').value.trim();
  var email = document.getElementById('editMemberEmail').value.trim();
  var role = document.getElementById('editMemberRole').value;
  var memberType = document.getElementById('editMemberType').value;

  if (!firstName || !lastName || !email) {
    alert('Name and email are required.');
    return;
  }

  // Update member record
  var { error } = await supabase
    .from('members')
    .update({ first_name: firstName, last_name: lastName, phone: phone, email: email })
    .eq('id', id);

  if (error) { alert('Error saving member: ' + error.message); return; }

  // Update club_membership (handicap, member_type, and role if admin)
  if (membershipId) {
    var cmUpdate = { handicap: handicap, member_type: memberType };
    // Only admin can change roles
    if (currentOrganiser && currentOrganiser.is_admin) {
      cmUpdate.role = role;
    }
    await supabase
      .from('club_memberships')
      .update(cmUpdate)
      .eq('id', membershipId);
  }

  document.getElementById('editMemberModal').classList.remove('active');
  loadMembers();
  loadOrgStats();
  alert('Member updated!');
}

function getOrgTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  return Math.floor(seconds / 86400) + 'd ago';
}

document.addEventListener('DOMContentLoaded', initOrganiserDashboard);
