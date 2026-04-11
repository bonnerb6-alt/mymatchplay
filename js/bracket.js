// ============================================
// MyMatchPlayPal - Live Bracket
// ============================================

let bracketClubId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
let bracketClubIds = [];
let currentTournamentId = null;
let realtimeChannel = null;

async function initBracket() {
  try {
    const member = await getCurrentMember();
    if (member) {
      bracketClubId = member.club_id;
      updateNavForAuth(member);

      // Get all clubs the member belongs to
      var { data: memberships } = await supabase
        .from('club_memberships')
        .select('club_id, role')
        .eq('member_id', member.id);
      bracketClubIds = (memberships || []).map(function(m) { return m.club_id; });

      // Show print buttons if organiser or admin
      var isOrg = (memberships || []).some(function(m) { return m.role === 'organiser'; }) || member.role === 'organiser' || member.is_admin;
      var printBtns = document.getElementById('print-buttons');
      if (printBtns && isOrg) printBtns.style.display = 'block';
    }
    if (bracketClubIds.length === 0) bracketClubIds = [bracketClubId];
    await loadTournamentSelector();
  } catch (err) {
    console.error('[MMP] Bracket init error:', err);
    var container = document.getElementById('tournament-selector');
    if (container) container.innerHTML = '<p style="color:var(--gray-400);">Could not load tournaments.</p>';
  }
}

async function loadTournamentSelector() {
  const container = document.getElementById('tournament-selector');
  if (!container) return;

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, name, status, bracket_size, entry_deadline, current_round, created_at, clubs(name)')
    .in('club_id', bracketClubIds)
    .in('status', ['entries_open', 'in_progress', 'completed', 'scheduled'])
    .order('created_at', { ascending: false });

  if (!tournaments || tournaments.length === 0) {
    container.innerHTML = '<p style="color:var(--gray-400);">No tournaments yet.</p>';
    document.getElementById('bracket-desktop-container').innerHTML = '<p style="padding:2rem;text-align:center;color:var(--gray-400);">No tournament to display.</p>';
    document.getElementById('bracket-mobile-container').innerHTML = '<p style="padding:2rem;text-align:center;color:var(--gray-400);">No tournament to display.</p>';
    document.getElementById('tournament-info').innerHTML = '';
    document.getElementById('round-deadlines').innerHTML = '<p style="text-align:center;color:var(--gray-400);">-</p>';
    document.getElementById('bracket-results').innerHTML = '<p style="text-align:center;color:var(--gray-400);">-</p>';
    return;
  }

  var statusColors = {
    'entries_open': 'background:var(--gold);border-color:var(--gold);color:var(--green-900);',
    'in_progress': 'background:var(--green-600);border-color:var(--green-600);color:var(--white);',
    'completed': 'background:var(--gray-400);border-color:var(--gray-400);color:var(--white);'
  };
  var statusLabels = { 'entries_open': 'Open', 'in_progress': 'Live', 'completed': 'Done' };

  container.innerHTML = tournaments.map(function(t, i) {
    var chipStyle = i === 0 ? statusColors[t.status] || '' : '';
    var clubName = t.clubs?.name ? '<span style="font-size:0.65rem;display:block;opacity:0.7;">' + t.clubs.name + '</span>' : '';
    var statusDot = '<span style="font-size:0.6rem;opacity:0.8;">[' + (statusLabels[t.status] || t.status) + ']</span>';
    return '<button class="tournament-chip ' + (i === 0 ? 'active' : '') + '" style="' + chipStyle + '" data-id="' + t.id + '" onclick="selectBracketTournament(this, \'' + t.id + '\')">' +
      t.name + ' ' + statusDot + clubName + '</button>';
  }).join('');

  // Load the first tournament
  await selectBracketTournament(container.querySelector('.tournament-chip'), tournaments[0].id);
}

async function selectBracketTournament(btn, tournamentId) {
  document.querySelectorAll('.tournament-chip').forEach(function(c) {
    c.classList.remove('active');
    c.style.background = '';
    c.style.borderColor = '';
    c.style.color = '';
  });
  if (btn) btn.classList.add('active');

  currentTournamentId = tournamentId;
  await loadBracketData(tournamentId);
  subscribeToUpdates(tournamentId);
}

async function loadBracketData(tournamentId) {
  try {
  // Get tournament info
  const { data: tournament, error: tErr } = await supabase
    .from('tournaments')
    .select('*, clubs(name, logo_url), tournament_entries(count), round_deadlines')
    .eq('id', tournamentId)
    .single();

  console.log('[MMP] Tournament:', tournament, 'Error:', tErr);
  if (!tournament) {
    document.getElementById('bracket-desktop-container').innerHTML = '<p style="padding:2rem;text-align:center;color:var(--gray-400);">Tournament not found.</p>';
    return;
  }

  // Get all matches
  const { data: matches, error: mErr } = await supabase
    .from('matches')
    .select(`
      *,
      player1:members!matches_player1_id_fkey(id, first_name, last_name, handicap),
      player2:members!matches_player2_id_fkey(id, first_name, last_name, handicap),
      winner:members!matches_winner_id_fkey(id, first_name, last_name)
    `)
    .eq('tournament_id', tournamentId)
    .order('round')
    .order('position');

  console.log('[MMP] Matches:', (matches || []).length, 'Error:', mErr);

  // Get entries with seeds
  const { data: entries } = await supabase
    .from('tournament_entries')
    .select('member_id, seed')
    .eq('tournament_id', tournamentId);

  const seedMap = {};
  (entries || []).forEach(e => { seedMap[e.member_id] = e.seed; });

  renderTournamentInfo(tournament);

  // If in_progress but no matches yet, show message
  if (tournament.status === 'in_progress' && (!matches || matches.length === 0)) {
    var noMatchMsg = '<p style="padding:2rem;text-align:center;color:var(--gray-400);">Draw has been generated but no matches found. Try refreshing.</p>';
    document.getElementById('bracket-desktop-container').innerHTML = noMatchMsg;
    document.getElementById('bracket-mobile-container').innerHTML = noMatchMsg;
    return;
  }

  if (tournament.status === 'entries_open' && (!matches || matches.length === 0)) {
    // No bracket yet — show entrant list
    var { data: entrants } = await supabase
      .from('tournament_entries')
      .select('members(first_name, last_name, handicap)')
      .eq('tournament_id', tournamentId);

    var entryCount = (entrants || []).length;
    var entrantList = (entrants || []).map(function(e, i) {
      return '<div style="display:flex;justify-content:space-between;padding:0.4rem 0.75rem;border-bottom:1px solid var(--gray-100);font-size:0.85rem;">' +
        '<span>' + (i + 1) + '. ' + e.members.first_name + ' ' + e.members.last_name + '</span>' +
        '<span style="color:var(--gray-500);">Hcp ' + e.members.handicap + '</span></div>';
    }).join('') || '<p style="padding:1rem;text-align:center;color:var(--gray-400);">No entries yet</p>';

    var deadline = tournament.entry_deadline ? new Date(tournament.entry_deadline).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBD';
    var entryHTML = '<div class="card-body">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">' +
        '<h3 style="font-size:1rem;">Entries (' + entryCount + ' / ' + tournament.bracket_size + ')</h3>' +
        '<span style="font-size:0.85rem;color:var(--gray-500);">Closes: ' + deadline + '</span>' +
      '</div>' +
      '<div style="background:var(--gray-200);border-radius:var(--radius-full);height:8px;overflow:hidden;margin-bottom:1rem;">' +
        '<div style="width:' + Math.round(entryCount / tournament.bracket_size * 100) + '%;height:100%;background:var(--green-500);border-radius:var(--radius-full);"></div>' +
      '</div>' +
      entrantList + '</div>';

    document.getElementById('bracket-desktop-container').innerHTML = entryHTML;
    document.getElementById('bracket-mobile-container').innerHTML = entryHTML;
    document.getElementById('round-deadlines').innerHTML = '<p style="text-align:center;color:var(--gray-400);">Draw not yet generated</p>';
    document.getElementById('bracket-results').innerHTML = '<p style="text-align:center;color:var(--gray-400);">No matches yet</p>';
    return;
  }

  renderDesktopBracket(matches || [], tournament, seedMap);
  renderMobileBracket(matches || [], tournament, seedMap);
  renderRoundDeadlines(tournament);
  renderRecentResults(matches || [], seedMap);
  } catch (err) {
    console.error('[MMP] loadBracketData error:', err);
    document.getElementById('bracket-desktop-container').innerHTML = '<p style="padding:2rem;text-align:center;color:var(--red);">Error loading bracket. Check console.</p>';
  }
}

function renderTournamentInfo(tournament) {
  const el = document.getElementById('tournament-info');
  if (!el) return;

  const entryCount = tournament.tournament_entries?.[0]?.count || 0;
  const startDate = new Date(tournament.created_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
  const roundNames = { 0: 'Not Started', 1: 'Round 1', 2: 'Round of 16', 3: 'Quarter Finals', 4: 'Semi Finals', 5: 'Final' };

  el.innerHTML = `
    <div class="card-body" style="display:flex;justify-content:space-between;align-items:center;padding:1rem 1.5rem;flex-wrap:wrap;gap:1rem;">
      <div>
        <h3 style="font-size:1.15rem;font-weight:700;color:var(--gray-900);">${tournament.name}</h3>
        <span style="font-size:0.85rem;color:var(--gray-500);">${tournament.clubs?.name || 'Golf Club'} &bull; ${entryCount} Players &bull; Started ${startDate}</span>
      </div>
      <div style="display:flex;gap:0.75rem;align-items:center;">
        <span class="badge badge-green"><span class="status-dot live"></span> ${roundNames[tournament.current_round] || 'Round ' + tournament.current_round}</span>
      </div>
    </div>`;
}

function playerName(player, seedMap) {
  if (!player) return 'TBD';
  const seed = seedMap[player.id];
  const seedStr = seed ? `<span class="seed">(${seed})</span> ` : '';
  return `${seedStr}${player.first_name[0]}. ${player.last_name}`;
}

function renderDesktopBracket(matches, tournament, seedMap) {
  const container = document.getElementById('bracket-desktop-container');
  if (!container) return;

  if (matches.length === 0) {
    container.innerHTML = '<p style="padding:2rem;text-align:center;color:var(--gray-400);">Draw not yet generated</p>';
    return;
  }

  const totalRounds = Math.log2(tournament.bracket_size);
  const roundNames = { 1: 'Round 1', 2: 'Quarter Finals', 3: 'Semi Finals', 4: 'Final' };
  // Adjust names based on bracket size
  const rNames = {};
  for (let r = 1; r <= totalRounds; r++) {
    if (r === totalRounds) rNames[r] = 'Final';
    else if (r === totalRounds - 1) rNames[r] = 'Semi Finals';
    else if (r === totalRounds - 2) rNames[r] = 'Quarter Finals';
    else if (r === totalRounds - 3) rNames[r] = 'Round of 16';
    else rNames[r] = 'Round ' + r;
  }

  let html = '<div class="bracket">';

  for (let round = 1; round <= totalRounds; round++) {
    const roundMatches = matches.filter(m => m.round === round).sort((a, b) => a.position - b.position);

    // Calculate spacing for vertical alignment
    const marginMultiplier = Math.pow(2, round - 1);

    html += `<div class="bracket-round">
      <div class="bracket-round-title">${rNames[round]}</div>`;

    // Filter: skip BYE matches in round 1 display
    var displayMatches = roundMatches.filter(function(m) { return m.status !== 'bye'; });

    displayMatches.forEach((match, idx) => {
      const p1Class = match.winner_id === match.player1?.id ? 'winner' : (match.winner_id && match.winner_id !== match.player1?.id ? 'loser' : '');
      const p2Class = match.winner_id === match.player2?.id ? 'winner' : (match.winner_id && match.winner_id !== match.player2?.id ? 'loser' : '');

      let borderStyle = '';
      if (match.status === 'in_progress') borderStyle = 'border-color:var(--gold);';
      else if (match.status === 'pending' && !match.player1 && !match.player2) borderStyle = 'border-style:dashed;border-color:var(--gray-300);';
      else if (match.status === 'completed') borderStyle = '';

      const p1Score = match.winner_id === match.player1?.id ? '&#9989;' : '&nbsp;';
      const p2Score = match.winner_id === match.player2?.id ? '&#9989;' : '&nbsp;';

      // Player names — show actual names or TBD for future rounds
      var p1Display = match.player1 ? playerName(match.player1, seedMap) : '<span style="color:var(--gray-400);">TBD</span>';
      var p2Display = match.player2 ? playerName(match.player2, seedMap) : '<span style="color:var(--gray-400);">TBD</span>';

      html += `
        <div class="bracket-match-wrapper">
          <div class="bracket-match" style="${borderStyle}">
            <div class="bracket-player ${p1Class}">
              <span class="player-name">${p1Display}</span>
              <span class="player-score">${p1Score}</span>
            </div>
            <div class="bracket-player ${p2Class}">
              <span class="player-name">${p2Display}</span>
              <span class="player-score">${p2Score}</span>
            </div>
          </div>
        </div>`;
    });

    html += '</div>';
  }

  // Trophy
  const finalMatch = matches.find(m => m.round === totalRounds);
  const champion = finalMatch?.winner;
  html += `
    <div style="display:flex;flex-direction:column;justify-content:center;align-items:center;">
      <div class="trophy-display">
        <div class="trophy-icon">&#127942;</div>
        <h3>Champion</h3>
        <p>${champion ? champion.first_name + ' ' + champion.last_name : 'To be decided'}</p>
      </div>
    </div>`;

  html += '</div>';
  container.innerHTML = html;
}

function renderMobileBracket(matches, tournament, seedMap) {
  const container = document.getElementById('bracket-mobile-container');
  if (!container) return;

  if (matches.length === 0) {
    container.innerHTML = '<p style="padding:2rem;text-align:center;color:var(--gray-400);">Draw not yet generated</p>';
    return;
  }

  const totalRounds = Math.log2(tournament.bracket_size);
  const rNames = {};
  for (let r = 1; r <= totalRounds; r++) {
    if (r === totalRounds) rNames[r] = 'Final';
    else if (r === totalRounds - 1) rNames[r] = 'Semi Finals';
    else if (r === totalRounds - 2) rNames[r] = 'Quarter Finals';
    else if (r === totalRounds - 3) rNames[r] = 'Round of 16';
    else rNames[r] = 'Round ' + r;
  }

  let html = '';

  for (let round = 1; round <= totalRounds; round++) {
    const roundMatches = matches.filter(m => m.round === round).sort((a, b) => a.position - b.position);
    const isCurrentRound = round === tournament.current_round;
    const allComplete = roundMatches.every(m => m.status === 'completed' || m.status === 'bye');
    const hasMatches = roundMatches.some(m => m.player1 || m.player2);

    let statusBadge;
    if (allComplete) statusBadge = '<span class="badge badge-gray">Completed</span>';
    else if (isCurrentRound) statusBadge = '<span class="badge badge-gold"><span class="status-dot pending"></span> Active</span>';
    else statusBadge = '<span class="badge badge-gray">Upcoming</span>';

    html += `
      <div class="bracket-accordion">
        <button class="bracket-accordion-header ${isCurrentRound ? 'active' : ''}" onclick="toggleRound(this)">
          <span>${rNames[round]}</span>
          ${statusBadge}
          <span class="accordion-arrow">&#9660;</span>
        </button>
        <div class="bracket-accordion-body ${isCurrentRound ? 'open' : ''}">
          <div class="bracket-match-stack">`;

    for (const match of roundMatches) {
      if (match.status === 'bye') continue; // Skip BYE matches on mobile

      const p1Name = playerName(match.player1, seedMap);
      const p2Name = match.player2 ? playerName(match.player2, seedMap) : 'TBD';

      if (match.status === 'completed') {
        const winnerIsP1 = match.winner_id === match.player1?.id;
        html += `
          <div class="bracket-match-mobile">
            <div class="bracket-player ${winnerIsP1 ? 'winner' : 'loser'}">${p1Name} ${winnerIsP1 ? '&#9989;' : ''}</div>
            <div class="bracket-player ${!winnerIsP1 ? 'winner' : 'loser'}">${p2Name} ${!winnerIsP1 ? '&#9989;' : ''}</div>
          </div>`;
      } else if (match.status === 'in_progress') {
        html += `
          <div class="bracket-match-mobile in-progress">
            <div class="bracket-player">${p1Name}</div>
            <div class="match-vs-divider">vs</div>
            <div class="bracket-player">${p2Name}</div>
          </div>`;
      } else {
        html += `
          <div class="bracket-match-mobile tbd">
            <div class="bracket-player">${p1Name}</div>
            <div class="match-vs-divider">vs</div>
            <div class="bracket-player">${p2Name}</div>
          </div>`;
      }
    }

    // Trophy in final round
    if (round === totalRounds) {
      const finalMatch = roundMatches[0];
      const champion = finalMatch?.winner;
      html += `
        <div class="trophy-display">
          <div class="trophy-icon">&#127942;</div>
          <h3>Champion</h3>
          <p>${champion ? champion.first_name + ' ' + champion.last_name : 'To be decided'}</p>
        </div>`;
    }

    html += '</div></div></div>';
  }

  container.innerHTML = html;
}

function renderRoundDeadlines(tournament) {
  const container = document.getElementById('round-deadlines');
  if (!container) return;

  const totalRounds = Math.log2(tournament.bracket_size);
  const rNames = {};
  for (let r = 1; r <= totalRounds; r++) {
    if (r === totalRounds) rNames[r] = 'Final';
    else if (r === totalRounds - 1) rNames[r] = 'Semi Finals';
    else if (r === totalRounds - 2) rNames[r] = 'Quarter Finals';
    else if (r === totalRounds - 3) rNames[r] = 'Round of 16';
    else rNames[r] = 'Round ' + r;
  }

  var deadlines = tournament.round_deadlines || {};
  var startDate = new Date(tournament.created_at);
  let html = '';

  for (let r = 1; r <= totalRounds; r++) {
    // Use organiser-set deadline, or auto-calculate as fallback
    var dateStr;
    if (deadlines[r]) {
      dateStr = new Date(deadlines[r]).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
    } else {
      var autoDeadline = new Date(startDate);
      autoDeadline.setDate(autoDeadline.getDate() + r * (tournament.round_days || 14));
      dateStr = autoDeadline.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    let badge;
    if (r < tournament.current_round) badge = '<span class="badge badge-gray">Completed</span>';
    else if (r === tournament.current_round) badge = `<span class="badge badge-gold"><span class="status-dot pending"></span> Active</span>`;
    else badge = '';

    html += `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0;${r < totalRounds ? 'border-bottom:1px solid var(--gray-100);' : ''}">
        <span style="font-weight:600;">${rNames[r]}</span>
        <span>${badge} ${r <= tournament.current_round ? dateStr : `<span style="color:var(--gray-400);">${dateStr}</span>`}</span>
      </div>`;
  }

  container.innerHTML = html;
}

function renderRecentResults(matches, seedMap) {
  const container = document.getElementById('bracket-results');
  if (!container) return;

  const completed = matches
    .filter(m => m.status === 'completed')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 6);

  if (completed.length === 0) {
    container.innerHTML = '<p style="padding:1rem;text-align:center;color:var(--gray-400);">No results yet</p>';
    return;
  }

  container.innerHTML = completed.map(m => {
    const loser = m.winner_id === m.player1?.id ? m.player2 : m.player1;
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:0.6rem;background:var(--green-50);border-radius:var(--radius);font-size:0.85rem;">
        <span><strong>${m.winner?.first_name[0]}. ${m.winner?.last_name}</strong> beat ${loser?.first_name[0]}. ${loser?.last_name}</span>
        <span style="font-weight:600;color:var(--green-700);">${m.score || ''}</span>
      </div>`;
  }).join('');
}

function subscribeToUpdates(tournamentId) {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
  }

  realtimeChannel = supabase
    .channel('bracket-' + tournamentId)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'matches',
      filter: `tournament_id=eq.${tournamentId}`
    }, () => {
      // Reload bracket on any match change
      loadBracketData(tournamentId);
    })
    .subscribe();
}

// Print bracket as A4 landscape
async function printBracket() {
  if (!currentTournamentId) { alert('Select a tournament first.'); return; }

  var { data: tournament } = await supabase.from('tournaments').select('name, clubs(name)').eq('id', currentTournamentId).single();
  var headerEl = document.getElementById('print-bracket-header');
  if (headerEl) {
    headerEl.style.display = 'block';
    headerEl.textContent = (tournament?.clubs?.name || '') + ' — ' + (tournament?.name || 'Tournament');
  }

  // Set landscape
  var style = document.createElement('style');
  style.id = 'print-landscape';
  style.textContent = '@page { size: A4 landscape; margin: 10mm; }';
  document.head.appendChild(style);

  document.body.classList.add('print-bracket');
  window.print();
  document.body.classList.remove('print-bracket');
  if (headerEl) headerEl.style.display = 'none';

  var ls = document.getElementById('print-landscape');
  if (ls) ls.remove();
}

// Print draw names sheet
async function printDrawNames() {
  if (!currentTournamentId) { alert('Select a tournament first.'); return; }

  var { data: tournament } = await supabase.from('tournaments')
    .select('name, bracket_size, clubs(name, logo_url)')
    .eq('id', currentTournamentId).single();

  var { data: matches } = await supabase.from('matches')
    .select('round, position, status, score, player1:members!matches_player1_id_fkey(first_name, last_name, handicap, phone), player2:members!matches_player2_id_fkey(first_name, last_name, handicap, phone), winner:members!matches_winner_id_fkey(first_name, last_name)')
    .eq('tournament_id', currentTournamentId)
    .order('round').order('position');

  var { data: entries } = await supabase.from('tournament_entries')
    .select('seed, members(first_name, last_name, handicap, phone)')
    .eq('tournament_id', currentTournamentId)
    .order('seed');

  var clubName = tournament?.clubs?.name || 'Golf Club';
  var logo = tournament?.clubs?.logo_url ? '<img src="' + tournament.clubs.logo_url + '" style="width:50px;height:50px;object-fit:contain;margin:0 auto 0.5rem;display:block;">' : '';

  // Build player directory
  var playerRows = (entries || []).map(function(e) {
    return '<tr><td>' + (e.seed || '-') + '</td><td>' + e.members.first_name + ' ' + e.members.last_name + '</td><td>' + e.members.handicap + '</td><td>' + (e.members.phone || '-') + '</td></tr>';
  }).join('');

  // Build draw
  var totalRounds = Math.log2(tournament.bracket_size);
  var rNames = {};
  for (var r = 1; r <= totalRounds; r++) {
    if (r === totalRounds) rNames[r] = 'Final';
    else if (r === totalRounds - 1) rNames[r] = 'Semi Finals';
    else if (r === totalRounds - 2) rNames[r] = 'Quarter Finals';
    else rNames[r] = 'Round ' + r;
  }

  var drawRows = '';
  var curRound = 0;
  (matches || []).forEach(function(m) {
    if (m.round !== curRound) {
      curRound = m.round;
      drawRows += '<tr style="background:#e8f5e9;"><td colspan="4" style="font-weight:bold;padding:0.2rem 0.3rem;font-size:0.75rem;border:1px solid #ccc;">' + (rNames[m.round] || 'Round ' + m.round) + '</td></tr>';
    }
    var cs = 'padding:0.15rem 0.3rem;border:1px solid #ccc;font-size:0.7rem;';
    var p1 = m.player1 ? m.player1.first_name + ' ' + m.player1.last_name : 'TBD';
    var p2 = m.player2 ? m.player2.first_name + ' ' + m.player2.last_name : (m.status === 'bye' ? 'BYE' : 'TBD');
    var result = m.status === 'completed' ? (m.winner ? m.winner.first_name[0] + '. ' + m.winner.last_name + ' ' + (m.score || '') : '-') : (m.status === 'bye' ? 'BYE' : '');
    drawRows += '<tr><td style="' + cs + '">' + m.position + '</td><td style="' + cs + '">' + p1 + '</td><td style="' + cs + '">' + p2 + '</td><td style="' + cs + '">' + result + '</td></tr>';
  });

  var printSheet = document.getElementById('printDrawNames');
  var cellStyle = 'padding:0.15rem 0.3rem;border:1px solid #ccc;font-size:0.7rem;';
  var headerStyle = cellStyle + 'font-weight:bold;background:#f0f0f0;';

  printSheet.innerHTML =
    '<div style="text-align:center;margin-bottom:0.5rem;">' + logo +
      '<h1 style="font-size:1.1rem;margin:0;">' + tournament.name + '</h1>' +
      '<p style="color:#666;font-size:0.75rem;margin:0.1rem 0;">' + clubName + ' &bull; ' + tournament.bracket_size + ' Players &bull; ' + new Date().toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }) + '</p>' +
    '</div>' +
    '<table style="width:100%;border-collapse:collapse;">' +
      '<thead><tr><th style="' + headerStyle + '">Match</th><th style="' + headerStyle + '">Player 1</th><th style="' + headerStyle + '">Player 2</th><th style="' + headerStyle + '">Result</th></tr></thead>' +
      '<tbody>' + drawRows + '</tbody></table>' +
    '<div style="margin-top:0.5rem;text-align:center;font-size:0.6rem;color:#999;">MyMatchPlayPal &bull; ' + clubName + '</div>';

  // Set portrait for names
  var style = document.createElement('style');
  style.id = 'print-portrait';
  style.textContent = '@page { size: A4 portrait; margin: 15mm; }';
  document.head.appendChild(style);

  document.body.classList.add('print-names');
  window.print();
  document.body.classList.remove('print-names');

  var ps = document.getElementById('print-portrait');
  if (ps) ps.remove();
}

document.addEventListener('DOMContentLoaded', initBracket);
