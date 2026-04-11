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
        .select('club_id')
        .eq('member_id', member.id);
      bracketClubIds = (memberships || []).map(function(m) { return m.club_id; });
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
    .in('status', ['entries_open', 'in_progress', 'completed'])
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
  // Get tournament info
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*, clubs(name), tournament_entries(count)')
    .eq('id', tournamentId)
    .single();

  if (!tournament) return;

  // Get all matches
  const { data: matches } = await supabase
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

  // Get entries with seeds
  const { data: entries } = await supabase
    .from('tournament_entries')
    .select('member_id, seed')
    .eq('tournament_id', tournamentId);

  const seedMap = {};
  (entries || []).forEach(e => { seedMap[e.member_id] = e.seed; });

  renderTournamentInfo(tournament);

  if (tournament.status === 'entries_open') {
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

    roundMatches.forEach((match, idx) => {
      const p1Class = match.winner_id === match.player1?.id ? 'winner' : (match.winner_id && match.winner_id !== match.player1?.id ? 'loser' : '');
      const p2Class = match.winner_id === match.player2?.id ? 'winner' : (match.winner_id && match.winner_id !== match.player2?.id ? 'loser' : '');

      let borderStyle = '';
      if (match.status === 'in_progress') borderStyle = 'border-color:var(--gold);';
      else if (match.status === 'pending' && !match.player1 && !match.player2) borderStyle = 'border-style:dashed;border-color:var(--gray-300);';

      const p1Score = match.winner_id === match.player1?.id ? '&#9989;' : (match.status === 'in_progress' ? '<span style="color:var(--gold);">?</span>' : '&nbsp;');
      const p2Score = match.winner_id === match.player2?.id ? '&#9989;' : (match.status === 'in_progress' ? '<span style="color:var(--gold);">?</span>' : '&nbsp;');

      const topMargin = round > 1 && idx === 0 ? `margin-top:${(marginMultiplier - 1) * 1.75}rem;` : '';
      const gapMargin = round > 1 && idx > 0 ? `margin-top:${(marginMultiplier * 2 - 1) * 1.5}rem;` : '';

      html += `
        <div class="bracket-match-wrapper" style="${idx === 0 ? topMargin : gapMargin}">
          <div class="bracket-match" style="${borderStyle}">
            <div class="bracket-player ${p1Class}" style="${!match.player1 ? 'color:var(--gray-400);' : ''}">
              <span class="player-name">${playerName(match.player1, seedMap)}</span>
              <span class="player-score">${p1Score}</span>
            </div>
            <div class="bracket-player ${p2Class}" style="${!match.player2 ? 'color:var(--gray-400);' : ''}">
              <span class="player-name">${match.status === 'bye' ? 'BYE' : playerName(match.player2, seedMap)}</span>
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
    else rNames[r] = 'Round ' + r;
  }

  const startDate = new Date(tournament.created_at);
  let html = '';

  for (let r = 1; r <= totalRounds; r++) {
    const deadline = new Date(startDate);
    deadline.setDate(deadline.getDate() + r * (tournament.round_days || 14));
    const dateStr = deadline.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });

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

document.addEventListener('DOMContentLoaded', initBracket);
