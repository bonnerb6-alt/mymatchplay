// ============================================
// MyMatchPlayPal - Golfer Dashboard (Rebuilt)
// ============================================

var currentMember = null;
var myClubs = [];
var myClubIds = [];

async function initGolferDashboard() {
  try {
    currentMember = await getCurrentMember();
    if (!currentMember) { window.location.href = 'login.html'; return; }

    // Load club memberships
    var { data: memberships } = await supabase
      .from('club_memberships')
      .select('*, clubs(id, name)')
      .eq('member_id', currentMember.id);

    if (memberships && memberships.length > 0) {
      myClubs = memberships;
    } else {
      myClubs = [{ club_id: currentMember.club_id, role: currentMember.role, handicap: currentMember.handicap, clubs: currentMember.clubs }];
    }
    myClubIds = myClubs.map(function(c) { return c.club_id; });

    // Update UI
    var initials = currentMember.first_name[0] + currentMember.last_name[0];
    document.getElementById('nav-avatar').textContent = initials;
    document.getElementById('greeting').textContent = 'Hi, ' + currentMember.first_name;

    // Show organiser link if applicable
    var isOrg = myClubs.some(function(c) { return c.role === 'organiser'; }) || currentMember.role === 'organiser' || currentMember.is_admin;
    console.log('[MMP] Is organiser:', isOrg, 'Role:', currentMember.role, 'Admin:', currentMember.is_admin);
    if (isOrg) {
      var orgLink = document.getElementById('org-link');
      if (orgLink) orgLink.style.display = 'flex';
      var orgLinkDesktop = document.getElementById('org-link-desktop');
      if (orgLinkDesktop) orgLinkDesktop.style.display = 'inline-flex';
    }

    // Club logo
    if (myClubIds.length > 0) {
      var { data: club } = await supabase.from('clubs').select('logo_url').eq('id', myClubIds[0]).single();
      if (club && club.logo_url) {
        document.getElementById('nav-logo').innerHTML = '<img src="' + club.logo_url + '" alt="">';
      }
    }

    // Load sections
    await Promise.all([
      loadStats(),
      loadMatches(),
      loadMyTournaments(),
      loadOpenTournaments(),
      populateScoreForm()
    ].map(function(p) { return p.catch(function(e) { console.error('[MMP]', e); }); }));

  } catch (err) {
    console.error('[MMP] Init error:', err);
  }
}

// ---- Stats ----
async function loadStats() {
  var id = currentMember.id;

  var { data: entries } = await supabase.from('tournament_entries').select('tournament_id').eq('member_id', id);
  var tCount = (entries || []).length;

  var { data: pending } = await supabase.from('matches').select('id')
    .or('player1_id.eq.' + id + ',player2_id.eq.' + id).in('status', ['pending', 'in_progress']);

  var { data: won } = await supabase.from('matches').select('id').eq('winner_id', id).eq('status', 'completed');
  var { data: played } = await supabase.from('matches').select('id')
    .or('player1_id.eq.' + id + ',player2_id.eq.' + id).eq('status', 'completed');

  var w = (won || []).length;
  var p = (played || []).length;

  var el;
  el = document.getElementById('s-tournaments'); if (el) el.textContent = tCount;
  el = document.getElementById('s-matches'); if (el) el.textContent = (pending || []).length;
  el = document.getElementById('s-record'); if (el) el.textContent = w + '-' + (p - w);
  el = document.getElementById('s-streak'); if (el) el.textContent = '0'; // simplified
}

// ---- My Matches (Action Cards) ----
async function loadMatches() {
  var id = currentMember.id;
  var container = document.getElementById('matches-list');
  if (!container) return;

  var { data: matches } = await supabase.from('matches')
    .select('id, round, status, deadline, scheduled_at, tournaments(id, name, whatsapp_group_link, clubs(name)), player1:members!matches_player1_id_fkey(id, first_name, last_name, handicap, phone, email, contact_preference), player2:members!matches_player2_id_fkey(id, first_name, last_name, handicap, phone, email, contact_preference)')
    .or('player1_id.eq.' + id + ',player2_id.eq.' + id)
    .in('status', ['pending', 'in_progress'])
    .order('deadline', { ascending: true });

  if (!matches || matches.length === 0) {
    container.innerHTML = '<div class="card-empty">No matches to play right now</div>';
    return;
  }

  var roundNames = { 1: 'Round 1', 2: 'R16', 3: 'QF', 4: 'SF', 5: 'Final' };

  container.innerHTML = matches.map(function(m) {
    var opp = m.player1?.id === id ? m.player2 : m.player1;
    if (!opp) return '';

    var initials = opp.first_name[0] + opp.last_name[0];
    var round = roundNames[m.round] || 'R' + m.round;
    var scheduled = m.scheduled_at ? new Date(m.scheduled_at) : null;
    var schedStr = scheduled
      ? scheduled.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + scheduled.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })
      : null;
    var deadline = m.deadline ? new Date(m.deadline).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' }) : '';
    var isScheduled = !!scheduled;

    // Contact
    var msg = encodeURIComponent('Hi ' + opp.first_name + ', we\'re matched in ' + (m.tournaments?.name || 'the tournament') + ' (' + round + '). When suits you to play?');
    var phone = opp.phone ? opp.phone.replace(/\s/g, '') : '';
    var pref = opp.contact_preference || 'whatsapp';

    var contactBtn = '';
    if (pref === 'whatsapp' && phone) contactBtn = '<a href="https://wa.me/' + phone + '?text=' + msg + '" target="_blank" class="btn btn-sm btn-whatsapp">WhatsApp</a>';
    else if (pref === 'sms' && phone) contactBtn = '<a href="sms:' + phone + '?body=' + msg + '" class="btn btn-sm btn-primary">SMS</a>';
    else if (opp.email) contactBtn = '<a href="mailto:' + opp.email + '?subject=' + encodeURIComponent((m.tournaments?.name || '') + ' - ' + round) + '&body=' + msg + '" class="btn btn-sm btn-primary">Email</a>';
    else if (phone) contactBtn = '<a href="https://wa.me/' + phone + '?text=' + msg + '" target="_blank" class="btn btn-sm btn-whatsapp">WhatsApp</a>';

    var groupBtn = m.tournaments?.whatsapp_group_link ? '<a href="' + m.tournaments.whatsapp_group_link + '" target="_blank" class="btn btn-sm btn-secondary">Group</a>' : '';

    return '<div class="action-card' + (isScheduled ? ' scheduled' : '') + '">' +
      '<div class="match-header">' +
        '<div><div class="tournament-name">' + (m.tournaments?.name || '') + '</div>' +
          '<div class="round-name">' + round + (m.tournaments?.clubs?.name ? ' &bull; ' + m.tournaments.clubs.name : '') + '</div></div>' +
        '<span class="badge ' + (isScheduled ? 'badge-green' : 'badge-gold') + '">' + (isScheduled ? 'Record Score' : 'Arrange Match') + '</span>' +
      '</div>' +
      '<div class="opponent-row">' +
        '<div class="opponent-avatar">' + initials + '</div>' +
        '<div><div class="opponent-name">' + opp.first_name + ' ' + opp.last_name + '</div>' +
          '<div class="opponent-detail">Hcp ' + opp.handicap + ' &bull; Prefers ' + pref + '</div></div>' +
      '</div>' +
      '<div class="match-footer">' +
        '<div class="match-meta">' + (deadline ? 'Due: ' + deadline : '') + (schedStr ? ' &bull; <strong>' + schedStr + '</strong>' : '') + '</div>' +
        '<div class="match-actions">' + contactBtn + groupBtn +
          (!isScheduled ? '<button class="btn btn-sm btn-primary" onclick="toggleSchedule(\'' + m.id + '\')">Set Date</button>' : '') +
        '</div>' +
      '</div>' +
      '<div id="sched-' + m.id + '" class="hidden mt-1"><input type="datetime-local" class="form-input" value="' + (m.scheduled_at ? m.scheduled_at.substring(0, 16) : '') + '" onchange="saveSchedule(\'' + m.id + '\',this.value)"></div>' +
    '</div>';
  }).join('');
}

function toggleSchedule(matchId) {
  var el = document.getElementById('sched-' + matchId);
  if (el) el.classList.toggle('hidden');
}

async function saveSchedule(matchId, val) {
  if (!val) return;
  await supabase.from('matches').update({ scheduled_at: new Date(val).toISOString(), status: 'in_progress' }).eq('id', matchId);
  loadMatches();
  loadStats();
}

// ---- My Tournaments ----
async function loadMyTournaments() {
  var container = document.getElementById('my-tournaments');
  if (!container) return;

  var { data: entries } = await supabase.from('tournament_entries')
    .select('tournament_id, seed, tournaments(id, name, status, bracket_size, clubs(name))')
    .eq('member_id', currentMember.id);

  if (!entries || entries.length === 0) {
    container.innerHTML = '<div class="card-empty">Not in any tournaments yet</div>';
    return;
  }

  var statusLabel = { entries_open: 'Open', in_progress: 'Live', completed: 'Done', scheduled: 'Upcoming' };
  var statusColor = { entries_open: 'badge-gold', in_progress: 'badge-green', completed: 'badge-gray', scheduled: 'badge-blue' };

  container.innerHTML = entries.map(function(e) {
    var t = e.tournaments;
    if (!t) return '';
    return '<div class="tournament-card">' +
      '<div class="t-info"><h3>' + t.name + '</h3>' +
        '<div class="t-meta">' + (t.clubs?.name || '') + ' &bull; ' + t.bracket_size + ' players' +
        (e.seed ? ' &bull; Seed ' + e.seed : '') + '</div></div>' +
      '<div class="t-actions">' +
        '<span class="badge ' + (statusColor[t.status] || 'badge-gray') + '">' + (statusLabel[t.status] || t.status) + '</span>' +
        (t.status === 'in_progress' || t.status === 'completed' ? '<button class="btn btn-sm btn-secondary" onclick="viewBracket(\'' + t.id + '\',\'' + t.name.replace(/'/g, "\\'") + '\')">Bracket</button>' : '') +
        '<button class="btn btn-sm btn-secondary" onclick="viewEntrants(\'' + t.id + '\',\'' + t.name.replace(/'/g, "\\'") + '\')">Entrants</button>' +
      '</div></div>';
  }).join('');
}

// ---- View Bracket Modal ----
async function viewBracket(tournamentId, name) {
  document.getElementById('bracketModalTitle').textContent = name;
  document.getElementById('bracketModalContent').innerHTML = '<div class="card-empty">Loading...</div>';
  document.getElementById('bracketModal').classList.add('active');

  var { data: matches } = await supabase.from('matches')
    .select('*, player1:members!matches_player1_id_fkey(id, first_name, last_name), player2:members!matches_player2_id_fkey(id, first_name, last_name), winner:members!matches_winner_id_fkey(id, first_name, last_name)')
    .eq('tournament_id', tournamentId).order('round').order('position');
  var { data: t } = await supabase.from('tournaments').select('bracket_size').eq('id', tournamentId).single();

  if (!matches || matches.length === 0) {
    document.getElementById('bracketModalContent').innerHTML = '<div class="card-empty">Draw not generated yet</div>';
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

  var html = '';
  var curRound = 0;
  matches.forEach(function(m) {
    if (m.status === 'bye') return;
    if (m.round !== curRound) {
      curRound = m.round;
      html += '<div class="bracket-round-label" style="display:inline-block;margin:0.6rem 0 0.3rem;">' + (rNames[m.round] || 'Round ' + m.round) + '</div>';
    }
    var p1 = m.player1 ? m.player1.first_name[0] + '. ' + m.player1.last_name : 'TBD';
    var p2 = m.player2 ? m.player2.first_name[0] + '. ' + m.player2.last_name : 'TBD';
    var w1 = m.winner_id === m.player1?.id;
    var w2 = m.winner_id === m.player2?.id;

    html += '<div class="bracket-match-row">' +
      '<span style="' + (w1 ? 'font-weight:700;color:var(--green-700);' : (w2 ? 'color:var(--gray-400);text-decoration:line-through;' : '')) + '">' + p1 + '</span>' +
      ' <span class="vs">vs</span> ' +
      '<span style="' + (w2 ? 'font-weight:700;color:var(--green-700);' : (w1 ? 'color:var(--gray-400);text-decoration:line-through;' : '')) + '">' + p2 + '</span>' +
      (m.score ? ' <span style="font-size:0.75rem;font-weight:600;color:var(--green-700);margin-left:0.5rem;">' + m.score + '</span>' : '') +
    '</div>';
  });

  document.getElementById('bracketModalContent').innerHTML = html;
}

// ---- View Entrants Modal ----
async function viewEntrants(tournamentId, name) {
  document.getElementById('entrantsModalTitle').textContent = name + ' — Entrants';
  document.getElementById('entrantsModalContent').innerHTML = '<div class="card-empty">Loading...</div>';
  document.getElementById('entrantsModal').classList.add('active');

  var { data: entries } = await supabase.from('tournament_entries')
    .select('seed, members(first_name, last_name, handicap)')
    .eq('tournament_id', tournamentId).order('seed');

  if (!entries || entries.length === 0) {
    document.getElementById('entrantsModalContent').innerHTML = '<div class="card-empty">No entrants</div>';
    return;
  }

  document.getElementById('entrantsModalContent').innerHTML =
    '<div class="text-sm text-muted mb-1">' + entries.length + ' entrants</div>' +
    entries.map(function(e, i) {
      return '<div style="display:flex;justify-content:space-between;padding:0.35rem 0;border-bottom:1px solid var(--gray-100);font-size:0.8rem;">' +
        '<span>' + (e.seed || (i + 1)) + '. ' + e.members.first_name + ' ' + e.members.last_name + '</span>' +
        '<span class="text-muted">Hcp ' + e.members.handicap + '</span></div>';
    }).join('');
}

// ---- Open Tournaments ----
async function loadOpenTournaments() {
  var container = document.getElementById('open-tournaments');
  if (!container) return;

  var { data: tournaments } = await supabase.from('tournaments')
    .select('*, tournament_entries(count), clubs(name)')
    .in('club_id', myClubIds)
    .in('status', ['entries_open', 'scheduled'])
    .order('entry_deadline', { ascending: true });

  var { data: myEntries } = await supabase.from('tournament_entries')
    .select('tournament_id').eq('member_id', currentMember.id);
  var enteredIds = new Set((myEntries || []).map(function(e) { return e.tournament_id; }));

  var available = (tournaments || []).filter(function(t) { return !enteredIds.has(t.id); });

  if (available.length === 0) {
    container.innerHTML = '<div class="card-empty">No new competitions available</div>';
    return;
  }

  container.innerHTML = available.map(function(t) {
    var count = t.tournament_entries?.[0]?.count || 0;
    var pct = Math.round(count / t.bracket_size * 100);
    var deadline = t.entry_deadline ? new Date(t.entry_deadline).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' }) : '';
    var isOpen = t.status === 'entries_open';

    return '<div class="tournament-card" style="flex-direction:column;align-items:stretch;">' +
      '<div style="display:flex;justify-content:space-between;align-items:start;">' +
        '<div class="t-info"><h3>' + t.name + '</h3><div class="t-meta">' + (t.clubs?.name || '') + ' &bull; ' + t.bracket_size + ' players' + (deadline ? ' &bull; Closes ' + deadline : '') + '</div></div>' +
        '<span class="badge ' + (isOpen ? 'badge-green' : 'badge-gold') + '">' + (isOpen ? 'Open' : 'Soon') + '</span>' +
      '</div>' +
      '<div style="margin-top:0.5rem;display:flex;justify-content:space-between;align-items:center;">' +
        '<span class="text-xs text-muted">' + count + ' / ' + t.bracket_size + ' entered</span>' +
        (isOpen ? '<button class="btn btn-sm btn-primary" onclick="enterTournament(\'' + t.id + '\',this)">Enter Now</button>' : '<span class="btn btn-sm btn-secondary" style="opacity:0.5;">Not Open</span>') +
      '</div>' +
      (isOpen ? '<div style="margin-top:0.4rem;background:var(--gray-200);border-radius:var(--radius-full);height:4px;overflow:hidden;"><div style="width:' + pct + '%;height:100%;background:var(--green-500);border-radius:var(--radius-full);"></div></div>' : '') +
    '</div>';
  }).join('');
}

async function enterTournament(tournamentId, btn) {
  btn.disabled = true; btn.textContent = 'Entering...';
  var { error } = await supabase.from('tournament_entries').insert({ tournament_id: tournamentId, member_id: currentMember.id });
  if (error) { alert('Error: ' + error.message); btn.disabled = false; btn.textContent = 'Enter Now'; return; }
  btn.textContent = 'Entered!';
  btn.classList.remove('btn-primary'); btn.classList.add('btn-secondary');
  loadStats(); loadMyTournaments(); loadOpenTournaments();
}

// ---- Score Submission ----
async function populateScoreForm() {
  var select = document.getElementById('score-match-select');
  if (!select) return;
  var id = currentMember.id;

  var { data: matches } = await supabase.from('matches')
    .select('id, round, tournaments(name), player1:members!matches_player1_id_fkey(id, first_name, last_name), player2:members!matches_player2_id_fkey(id, first_name, last_name)')
    .or('player1_id.eq.' + id + ',player2_id.eq.' + id)
    .in('status', ['pending', 'in_progress']);

  select.innerHTML = matches && matches.length > 0
    ? matches.map(function(m) {
        var opp = m.player1?.id === id ? m.player2 : m.player1;
        return '<option value="' + m.id + '">' + (m.tournaments?.name || '') + ' — vs ' + (opp ? opp.first_name[0] + '. ' + opp.last_name : 'TBD') + '</option>';
      }).join('')
    : '<option disabled>No matches to report</option>';
}

async function submitScore() {
  var matchId = document.getElementById('score-match-select').value;
  var result = document.getElementById('score-result').value;
  var score = document.getElementById('score-value').value.trim();
  if (!matchId || !score) { alert('Select a match and enter the score.'); return; }

  var { data: match } = await supabase.from('matches')
    .select('player1_id, player2_id, next_match_id, position, tournament_id, round')
    .eq('id', matchId).single();
  if (!match) { alert('Match not found.'); return; }

  var winnerId = result === 'won' ? currentMember.id : (match.player1_id === currentMember.id ? match.player2_id : match.player1_id);

  var { error } = await supabase.from('matches').update({ winner_id: winnerId, score: score, status: 'completed' }).eq('id', matchId);
  if (error) { alert('Error: ' + error.message); return; }

  // Advance winner
  if (match.next_match_id) {
    var field = match.position % 2 === 1 ? 'player1_id' : 'player2_id';
    await supabase.from('matches').update({ [field]: winnerId, status: 'in_progress' }).eq('id', match.next_match_id);
  }

  // Auto-advance round
  var { data: roundMatches } = await supabase.from('matches').select('status').eq('tournament_id', match.tournament_id).eq('round', match.round);
  if ((roundMatches || []).every(function(m) { return m.status === 'completed' || m.status === 'bye'; })) {
    await supabase.from('tournaments').update({ current_round: match.round + 1 }).eq('id', match.tournament_id);
  }

  // Check if tournament complete
  var { data: anyPending } = await supabase.from('matches').select('id').eq('tournament_id', match.tournament_id).in('status', ['pending', 'in_progress']).limit(1);
  if (!anyPending || anyPending.length === 0) {
    await supabase.from('tournaments').update({ status: 'completed' }).eq('id', match.tournament_id);
  }

  alert('Score submitted!');
  loadMatches(); loadStats(); loadMyTournaments(); populateScoreForm();
}

// Sidebar nav helper (desktop)
function golferSidebarNav(el) {
  document.querySelectorAll('.sidebar-link').forEach(function(a) { a.classList.remove('active'); });
  if (el) el.classList.add('active');
}

// Init
document.addEventListener('DOMContentLoaded', function() {
  if (typeof IS_PROFILE_PAGE === 'undefined') initGolferDashboard();
});
