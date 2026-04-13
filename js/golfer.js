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

    // Nav is handled by nav.js

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
  try {
    var id = currentMember.id;

    // Run all queries in parallel (4 → 1 round trip)
    var [entriesRes, pendingRes, wonRes, playedRes] = await Promise.all([
      supabase.from('tournament_entries').select('tournament_id').eq('member_id', id),
      supabase.from('matches').select('id').or('player1_id.eq.' + id + ',player2_id.eq.' + id).in('status', ['pending', 'in_progress']),
      supabase.from('matches').select('id').eq('winner_id', id).eq('status', 'completed'),
      supabase.from('matches').select('id').or('player1_id.eq.' + id + ',player2_id.eq.' + id).eq('status', 'completed')
    ]);

    var w = (wonRes.data || []).length;
    var p = (playedRes.data || []).length;

    var el;
    el = document.getElementById('s-tournaments'); if (el) el.textContent = (entriesRes.data || []).length;
    el = document.getElementById('s-matches'); if (el) el.textContent = (pendingRes.data || []).length;
    el = document.getElementById('s-record'); if (el) el.textContent = w + '-' + (p - w);
    el = document.getElementById('s-streak'); if (el) el.textContent = w > 0 ? w : '0';
  } catch (err) {
    console.error('[MMP] Stats error:', err);
  }
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

    // Contact buttons — show all available methods, highlight preferred
    var msg = encodeURIComponent('Hi ' + opp.first_name + ', we\'re matched in ' + (m.tournaments?.name || 'the tournament') + ' (' + round + '). When suits you to play?');
    var phone = opp.phone ? opp.phone.replace(/[\s\-()]/g, '') : '';
    var irishPhone = phone && phone.startsWith('0') ? '+353' + phone.slice(1) : phone;
    var pref = opp.contact_preference || 'whatsapp';
    var emailSubject = encodeURIComponent((m.tournaments?.name || 'Tournament') + ' — ' + round);

    var prefLabel = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email', call: 'Call' };
    var contactBtns = '';

    // Build all available contact buttons; preferred gets primary styling
    if (irishPhone) {
      contactBtns +=
        '<a href="tel:' + irishPhone + '" class="btn btn-sm ' + (pref === 'call' ? 'btn-primary' : 'btn-secondary') + '" title="Call' + (pref === 'call' ? ' (preferred)' : '') + '">' +
          '<svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" style="display:inline;vertical-align:middle;margin-right:0.2rem;"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/></svg>' +
          'Call' + (pref === 'call' ? ' <span style="font-size:0.6rem;opacity:0.75;">★</span>' : '') +
        '</a>';
      contactBtns +=
        '<a href="sms:' + irishPhone + '?body=' + msg + '" class="btn btn-sm ' + (pref === 'sms' ? 'btn-primary' : 'btn-secondary') + '" title="SMS' + (pref === 'sms' ? ' (preferred)' : '') + '">' +
          '<svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" style="display:inline;vertical-align:middle;margin-right:0.2rem;"><path fill-rule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clip-rule="evenodd"/></svg>' +
          'SMS' + (pref === 'sms' ? ' <span style="font-size:0.6rem;opacity:0.75;">★</span>' : '') +
        '</a>';
      contactBtns +=
        '<a href="https://wa.me/' + irishPhone + '?text=' + msg + '" target="_blank" class="btn btn-sm ' + (pref === 'whatsapp' ? 'btn-whatsapp' : 'btn-secondary') + '" title="WhatsApp' + (pref === 'whatsapp' ? ' (preferred)' : '') + '">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="display:inline;vertical-align:middle;margin-right:0.2rem;"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>' +
          'WhatsApp' + (pref === 'whatsapp' ? ' <span style="font-size:0.6rem;opacity:0.75;">★</span>' : '') +
        '</a>';
    }
    if (opp.email) {
      contactBtns +=
        '<a href="mailto:' + opp.email + '?subject=' + emailSubject + '&body=' + msg + '" class="btn btn-sm ' + (pref === 'email' ? 'btn-primary' : 'btn-secondary') + '" title="Email' + (pref === 'email' ? ' (preferred)' : '') + '">' +
          '<svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" style="display:inline;vertical-align:middle;margin-right:0.2rem;"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/></svg>' +
          'Email' + (pref === 'email' ? ' <span style="font-size:0.6rem;opacity:0.75;">★</span>' : '') +
        '</a>';
    }

    var groupBtn = m.tournaments?.whatsapp_group_link
      ? '<a href="' + m.tournaments.whatsapp_group_link + '" target="_blank" class="btn btn-sm btn-secondary">Group Chat</a>'
      : '';

    return '<div class="action-card' + (isScheduled ? ' scheduled' : '') + '">' +
      '<div class="match-header">' +
        '<div><div class="tournament-name">' + (m.tournaments?.name || '') + '</div>' +
          '<div class="round-name">' + round + (m.tournaments?.clubs?.name ? ' &bull; ' + m.tournaments.clubs.name : '') + '</div></div>' +
        '<span class="badge ' + (isScheduled ? 'badge-green' : 'badge-gold') + '">' + (isScheduled ? 'Record Score' : 'Arrange Match') + '</span>' +
      '</div>' +
      '<div class="opponent-row">' +
        '<div class="opponent-avatar">' + initials + '</div>' +
        '<div>' +
          '<div class="opponent-name">' + opp.first_name + ' ' + opp.last_name + '</div>' +
          '<div class="opponent-detail">Hcp ' + opp.handicap + (pref ? ' &bull; Prefers ' + (prefLabel[pref] || pref) : '') + '</div>' +
        '</div>' +
      '</div>' +
      (contactBtns ? '<div style="display:flex;flex-wrap:wrap;gap:0.4rem;padding:0.6rem 0 0.25rem;">' + contactBtns + '</div>' : '') +
      '<div class="match-footer">' +
        '<div class="match-meta">' + (deadline ? 'Due: ' + deadline : '') + (schedStr ? ' &bull; <strong>' + schedStr + '</strong>' : '') + '</div>' +
        '<div class="match-actions">' + groupBtn +
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

  // For completed tournaments, fetch winners from the final matches
  var completedIds = entries.filter(function(e) { return e.tournaments?.status === 'completed'; }).map(function(e) { return e.tournament_id; });
  var winners = {};
  if (completedIds.length > 0) {
    var { data: finalMatches } = await supabase.from('matches')
      .select('tournament_id, winner:members!matches_winner_id_fkey(first_name, last_name)')
      .in('tournament_id', completedIds)
      .not('winner_id', 'is', null);
    // Find the final match per tournament (highest round) — approximate by taking last winner per tournament
    (finalMatches || []).forEach(function(m) { if (m.winner) winners[m.tournament_id] = m.winner; });
  }

  var statusLabel = { entries_open: 'Open', in_progress: 'Live', completed: 'Done', scheduled: 'Upcoming' };
  var statusColor = { entries_open: 'badge-gold', in_progress: 'badge-green', completed: 'badge-gray', scheduled: 'badge-blue' };
  var starSVG = '<svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" style="display:inline;vertical-align:middle;margin-right:0.2rem;color:#fbbf24;"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>';

  container.innerHTML = entries.map(function(e) {
    var t = e.tournaments;
    if (!t) return '';
    var winner = winners[t.id];
    var winnerHTML = (t.status === 'completed' && winner)
      ? '<div style="margin-top:0.4rem;font-size:0.78rem;color:#166534;font-weight:600;">' + starSVG + 'Won by ' + winner.first_name + ' ' + winner.last_name + '</div>'
      : '';

    return '<div class="tournament-card">' +
      '<div class="t-info"><h3>' + t.name + '</h3>' +
        '<div class="t-meta">' + (t.clubs?.name || '') + ' &bull; ' + t.bracket_size + ' players' +
        (e.seed ? ' &bull; Seed ' + e.seed : '') + '</div>' +
        winnerHTML +
      '</div>' +
      '<div class="t-actions">' +
        '<span class="badge ' + (statusColor[t.status] || 'badge-gray') + '">' + (statusLabel[t.status] || t.status) + '</span>' +
        (t.status === 'in_progress' || t.status === 'completed' ? '<button class="btn btn-sm btn-secondary" onclick="viewBracket(\'' + t.id + '\',\'' + t.name.replace(/'/g, "\\'") + '\')">' + (t.status === 'completed' ? 'Results' : 'Draw') + '</button>' : '') +
        '<button class="btn btn-sm btn-secondary" onclick="viewEntrants(\'' + t.id + '\',\'' + t.name.replace(/'/g, "\\'") + '\')">Entrants</button>' +
      '</div></div>';
  }).join('');
}

// ---- View Bracket Modal ----
async function viewBracket(tournamentId, name) {
  document.getElementById('bracketModalTitle').textContent = name;
  document.getElementById('bracketModalContent').innerHTML = '<div class="card-empty">Loading...</div>';
  document.getElementById('bracketModal').classList.add('active');

  var html = await buildBracketHTML(tournamentId);
  document.getElementById('bracketModalContent').innerHTML = html;
}

// Shared bracket HTML builder used by golfer + organiser views
async function buildBracketHTML(tournamentId) {
  var [matchesRes, tRes] = await Promise.all([
    supabase.from('matches')
      .select('*, player1:members!matches_player1_id_fkey(id, first_name, last_name), player2:members!matches_player2_id_fkey(id, first_name, last_name), winner:members!matches_winner_id_fkey(id, first_name, last_name)')
      .eq('tournament_id', tournamentId).order('round').order('position'),
    supabase.from('tournaments').select('bracket_size, status').eq('id', tournamentId).single()
  ]);

  var matches = matchesRes.data;
  var t = tRes.data;

  if (!matches || matches.length === 0) {
    return '<div class="card-empty">Draw not generated yet</div>';
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

  // Group by round (skip byes)
  var byRound = {};
  matches.forEach(function(m) {
    if (m.status === 'bye') return;
    if (!byRound[m.round]) byRound[m.round] = [];
    byRound[m.round].push(m);
  });

  // Champion = winner of the final round
  var finalMatches = (byRound[totalRounds] || []);
  var champion = finalMatches.length > 0 && finalMatches[0].winner ? finalMatches[0].winner : null;

  var checkSVG = '<svg style="display:inline;vertical-align:middle;margin-right:0.25rem;" width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>';
  var starSVG = '<svg width="22" height="22" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>';

  var html = '';

  // Champion banner
  if (champion) {
    html += '<div style="background:linear-gradient(135deg,var(--green-800,#166534),var(--green-600,#16a34a));color:white;border-radius:var(--radius);padding:1.1rem 1.25rem;margin-bottom:1.5rem;display:flex;align-items:center;gap:1rem;">' +
      '<div style="width:48px;height:48px;background:rgba(255,255,255,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#fbbf24;">' + starSVG + '</div>' +
      '<div>' +
        '<div style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;opacity:0.75;margin-bottom:0.2rem;">Tournament Winner</div>' +
        '<div style="font-size:1.2rem;font-weight:700;line-height:1.2;">' + champion.first_name + ' ' + champion.last_name + '</div>' +
      '</div>' +
    '</div>';
  }

  // Rounds
  Object.keys(byRound).sort(function(a, b) { return a - b; }).forEach(function(r) {
    var roundMatches = byRound[r];
    var roundName = rNames[r] || 'Round ' + r;
    var allComplete = roundMatches.every(function(m) { return m.status === 'completed'; });
    var isFinal = parseInt(r) === totalRounds;

    // Round header
    html += '<div style="margin-bottom:1.25rem;">' +
      '<div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.75rem;padding-bottom:0.5rem;border-bottom:2px solid var(--gray-100);">' +
        '<span style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--gray-600);">' + roundName + '</span>' +
        (allComplete
          ? '<span style="font-size:0.65rem;background:#dcfce7;color:#166534;padding:0.15rem 0.5rem;border-radius:99px;font-weight:600;">Complete</span>'
          : '<span style="font-size:0.65rem;background:#fef9c3;color:#854d0e;padding:0.15rem 0.5rem;border-radius:99px;font-weight:600;">In Progress</span>') +
      '</div>';

    // Match cards in a responsive grid (2 cols for rounds with many matches)
    var useGrid = roundMatches.length > 1 && !isFinal;
    html += '<div style="display:grid;grid-template-columns:' + (useGrid ? 'repeat(auto-fill,minmax(240px,1fr))' : '1fr') + ';gap:0.65rem;">';

    roundMatches.forEach(function(m) {
      var p1Name = m.player1 ? m.player1.first_name + ' ' + m.player1.last_name : 'TBD';
      var p2Name = m.player2 ? m.player2.first_name + ' ' + m.player2.last_name : 'TBD';
      var w1 = m.winner_id && m.player1 && m.winner_id === m.player1.id;
      var w2 = m.winner_id && m.player2 && m.winner_id === m.player2.id;
      var isPending = !m.winner_id && (m.player1 || m.player2);

      // Match card
      html += '<div style="border:1px solid ' + (isFinal ? 'var(--green-300,#86efac)' : 'var(--gray-200)') + ';border-radius:var(--radius);overflow:hidden;box-shadow:' + (isFinal ? '0 2px 8px rgba(22,163,74,0.12)' : '0 1px 3px rgba(0,0,0,0.06)') + ';">';

      // Player 1
      html +=
        '<div style="padding:0.65rem 0.85rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--gray-100);background:' + (w1 ? '#f0fdf4' : 'white') + ';">' +
          '<div style="display:flex;align-items:center;gap:0.35rem;min-width:0;">' +
            (w1
              ? '<span style="flex-shrink:0;width:20px;height:20px;background:#16a34a;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:white;">' + checkSVG + '</span>'
              : '<span style="flex-shrink:0;width:20px;height:20px;background:' + (w2 ? 'var(--gray-200)' : 'var(--gray-100)') + ';border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:0.6rem;color:var(--gray-400);">1</span>') +
            '<span style="font-size:0.875rem;font-weight:' + (w1 ? '700' : '500') + ';color:' + (w1 ? '#166534' : (w2 ? 'var(--gray-400)' : 'var(--gray-800)')) + ';' + (w2 ? 'text-decoration:line-through;' : '') + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + p1Name + '</span>' +
          '</div>' +
          (w1 && m.score ? '<span style="flex-shrink:0;font-size:0.75rem;font-weight:700;color:#166534;background:#dcfce7;padding:0.15rem 0.5rem;border-radius:99px;margin-left:0.4rem;">' + m.score + '</span>' : '') +
        '</div>';

      // Player 2
      html +=
        '<div style="padding:0.65rem 0.85rem;display:flex;justify-content:space-between;align-items:center;background:' + (w2 ? '#f0fdf4' : 'white') + ';">' +
          '<div style="display:flex;align-items:center;gap:0.35rem;min-width:0;">' +
            (w2
              ? '<span style="flex-shrink:0;width:20px;height:20px;background:#16a34a;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:white;">' + checkSVG + '</span>'
              : '<span style="flex-shrink:0;width:20px;height:20px;background:' + (w1 ? 'var(--gray-200)' : 'var(--gray-100)') + ';border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:0.6rem;color:var(--gray-400);">2</span>') +
            '<span style="font-size:0.875rem;font-weight:' + (w2 ? '700' : '500') + ';color:' + (w2 ? '#166534' : (w1 ? 'var(--gray-400)' : 'var(--gray-800)')) + ';' + (w1 ? 'text-decoration:line-through;' : '') + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + p2Name + '</span>' +
          '</div>' +
          (w2 && m.score ? '<span style="flex-shrink:0;font-size:0.75rem;font-weight:700;color:#166534;background:#dcfce7;padding:0.15rem 0.5rem;border-radius:99px;margin-left:0.4rem;">' + m.score + '</span>' : '') +
          (isPending && !w1 && !w2 ? '<span style="font-size:0.65rem;color:var(--gray-400);font-style:italic;">Pending</span>' : '') +
        '</div>';

      html += '</div>'; // end match card
    });

    html += '</div></div>'; // end grid + round
  });

  return html;
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

  // Advance winner to next match
  console.log('[MMP] Score submitted. next_match_id:', match.next_match_id, 'position:', match.position);
  if (match.next_match_id) {
    var field = match.position % 2 === 1 ? 'player1_id' : 'player2_id';
    console.log('[MMP] Advancing winner to', field, 'of match', match.next_match_id);
    var { error: advErr } = await supabase.from('matches').update({ [field]: winnerId, status: 'in_progress' }).eq('id', match.next_match_id);
    if (advErr) console.error('[MMP] Advance error:', advErr.message);
  } else {
    console.warn('[MMP] No next_match_id — winner cannot advance. This may be the final.');
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

// ---- Profile Functions (used by profile.html) ----

async function loadProfile() {
  var profileEl = document.getElementById('golfer-profile');
  if (!profileEl) return;

  var id = currentMember.id;
  var initials = currentMember.first_name[0] + currentMember.last_name[0];

  var { data: played } = await supabase.from('matches').select('id').or('player1_id.eq.' + id + ',player2_id.eq.' + id).eq('status', 'completed');
  var { data: won } = await supabase.from('matches').select('id').eq('winner_id', id).eq('status', 'completed');
  var w = (won || []).length;
  var p = (played || []).length;
  var winRate = p > 0 ? Math.round(w / p * 100) : 0;

  // Club logos
  var clubLogos = {};
  if (myClubIds.length > 0) {
    var { data: cl } = await supabase.from('clubs').select('id, logo_url').in('id', myClubIds);
    (cl || []).forEach(function(c) { if (c.logo_url) clubLogos[c.id] = c.logo_url; });
  }

  var clubsHTML = myClubs.map(function(c) {
    var name = c.clubs?.name || 'Golf Club';
    var logo = clubLogos[c.club_id] ? '<img src="' + clubLogos[c.club_id] + '" style="width:20px;height:20px;border-radius:3px;object-fit:cover;">' : '<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style="color:var(--green-600)"><path fill-rule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 7l2.55 2.4A1 1 0 0116 11H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clip-rule="evenodd"/></svg>';
    var roleBadge = c.role === 'organiser' ? '<span class="badge badge-gold">Organiser</span>' : '<span class="badge badge-green">Golfer</span>';
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem;background:var(--gray-100);border-radius:var(--radius-sm);font-size:0.8rem;margin-bottom:0.3rem;">' +
      '<span style="display:flex;align-items:center;gap:0.4rem;">' + logo + ' <strong>' + name + '</strong> — Hcp ' + c.handicap + '</span>' + roleBadge + '</div>';
  }).join('');

  var prefLabel = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email' };

  profileEl.innerHTML =
    '<div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem;flex-wrap:wrap;">' +
      '<div style="width:60px;height:60px;border-radius:50%;background:var(--green-600);color:white;display:flex;align-items:center;justify-content:center;font-size:1.3rem;font-weight:700;">' + initials + '</div>' +
      '<div><div style="font-size:1.1rem;font-weight:700;">' + currentMember.first_name + ' ' + currentMember.last_name + '</div>' +
        '<div style="font-size:0.8rem;color:var(--gray-500);">' + currentMember.email + '</div>' +
        '<div style="font-size:0.8rem;color:var(--gray-500);">' + (currentMember.phone || 'No phone') + ' &bull; Prefers ' + (prefLabel[currentMember.contact_preference] || 'WhatsApp') + '</div>' +
      '</div></div>' +
    '<div style="margin-bottom:1rem;">' + clubsHTML + '</div>' +
    '<div class="stat-cards">' +
      '<div class="stat-card"><div class="stat-icon blue"><svg width="22" height="22" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clip-rule="evenodd"/></svg></div><div class="stat-text"><div class="stat-value">' + p + '</div><div class="stat-label">Played</div></div></div>' +
      '<div class="stat-card"><div class="stat-icon green"><svg width="22" height="22" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg></div><div class="stat-text"><div class="stat-value">' + w + '</div><div class="stat-label">Won</div></div></div>' +
      '<div class="stat-card"><div class="stat-icon red"><svg width="22" height="22" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg></div><div class="stat-text"><div class="stat-value">' + (p - w) + '</div><div class="stat-label">Lost</div></div></div>' +
      '<div class="stat-card"><div class="stat-icon gold"><svg width="22" height="22" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg></div><div class="stat-text"><div class="stat-value">' + winRate + '%</div><div class="stat-label">Win Rate</div></div></div>' +
    '</div>';
}

async function loadClubSelector() {
  var select = document.getElementById('joinClubSelect');
  if (!select) return;

  var { data: clubs } = await supabase.from('clubs').select('id, name').order('name');
  var existing = new Set(myClubIds);

  var { data: pending } = await supabase.from('membership_requests').select('club_id').eq('member_id', currentMember.id).eq('status', 'pending');
  (pending || []).forEach(function(r) { existing.add(r.club_id); });

  var available = (clubs || []).filter(function(c) { return !existing.has(c.id); });

  select.innerHTML = available.length > 0
    ? '<option value="" disabled selected>Choose a club...</option>' + available.map(function(c) { return '<option value="' + c.id + '">' + c.name + '</option>'; }).join('')
    : '<option disabled>No new clubs available</option>';

  loadPendingRequests();
}

async function loadPendingRequests() {
  var container = document.getElementById('pending-requests');
  if (!container) return;

  var { data: requests } = await supabase.from('membership_requests').select('*, clubs(name)').eq('member_id', currentMember.id).order('requested_at', { ascending: false }).limit(5);

  if (!requests || requests.length === 0) { container.innerHTML = ''; return; }

  container.innerHTML = '<div style="font-size:0.75rem;font-weight:600;color:var(--gray-600);margin-bottom:0.3rem;">My Requests</div>' +
    requests.map(function(r) {
      var badge = r.status === 'pending' ? '<span class="badge badge-gold">Pending</span>' : (r.status === 'approved' ? '<span class="badge badge-green">Approved</span>' : '<span class="badge badge-red">Rejected</span>');
      return '<div style="display:flex;justify-content:space-between;padding:0.4rem 0.5rem;background:var(--gray-100);border-radius:var(--radius-sm);font-size:0.8rem;margin-bottom:0.25rem;">' +
        '<span>' + (r.clubs?.name || 'Club') + '</span>' + badge + '</div>';
    }).join('');
}

async function requestClubMembership() {
  var clubId = document.getElementById('joinClubSelect').value;
  var handicap = parseInt(document.getElementById('joinClubHandicap').value) || 0;
  if (!clubId) { alert('Please select a club.'); return; }

  var { error } = await supabase.from('membership_requests').insert({ member_id: currentMember.id, club_id: clubId, status: 'pending', message: 'Handicap: ' + handicap });
  if (error) { alert('Error: ' + error.message); return; }
  alert('Request sent!');
  loadClubSelector();
}

function openEditProfile() {
  if (!currentMember) return;
  document.getElementById('editFirstName').value = currentMember.first_name;
  document.getElementById('editLastName').value = currentMember.last_name;
  document.getElementById('editHandicap').value = currentMember.handicap;
  document.getElementById('editPhone').value = currentMember.phone || '';
  document.getElementById('editEmail').value = currentMember.email;
  var cpEl = document.getElementById('editContactPref');
  if (cpEl) cpEl.value = currentMember.contact_preference || 'whatsapp';
  document.getElementById('editProfileModal').classList.add('active');
}

async function saveProfile() {
  var firstName = document.getElementById('editFirstName').value.trim();
  var lastName = document.getElementById('editLastName').value.trim();
  var handicap = parseInt(document.getElementById('editHandicap').value) || 0;
  var phone = document.getElementById('editPhone').value.trim();
  var cpEl = document.getElementById('editContactPref');
  var contactPref = cpEl ? cpEl.value : 'whatsapp';

  if (!firstName || !lastName) { alert('Name is required.'); return; }

  var updateData = { first_name: firstName, last_name: lastName, handicap: handicap, phone: phone };
  if (contactPref) updateData.contact_preference = contactPref;

  var { error } = await supabase.from('members').update(updateData).eq('id', currentMember.id);
  if (error) { alert('Error: ' + error.message); return; }

  currentMember = await getCurrentMember();
  document.getElementById('editProfileModal').classList.remove('active');
  loadProfile();
  alert('Profile updated!');
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
