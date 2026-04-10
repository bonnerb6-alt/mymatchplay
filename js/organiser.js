// ============================================
// MyMatchPlayPal - Organiser Dashboard
// ============================================

let currentOrganiser = null;
let orgClub = null; // The single club this organiser manages
let orgClubId = null;

async function initOrganiserDashboard() {
  currentOrganiser = await getCurrentMember();
  if (!currentOrganiser) {
    window.location.href = 'login.html';
    return;
  }

  // Load the club where this member is an organiser (one club only)
  var { data: memberships } = await supabase
    .from('club_memberships')
    .select('*, clubs(id, name)')
    .eq('member_id', currentOrganiser.id)
    .eq('role', 'organiser')
    .limit(1);

  // Fallback to old model
  if (!memberships || memberships.length === 0) {
    if (currentOrganiser.role !== 'organiser') {
      window.location.href = 'golfer.html';
      return;
    }
    orgClub = { club_id: currentOrganiser.club_id, clubs: currentOrganiser.clubs };
  } else {
    orgClub = memberships[0];
  }
  orgClubId = orgClub.club_id;

  updateNavForAuth(currentOrganiser);
  renderOrgSidebar();
  var clubName = orgClub.clubs?.name || 'Golf Club';
  document.getElementById('org-club-name').textContent = clubName + ' — Match Secretary Panel';
  await Promise.all([
    loadOrgStats(),
    loadTournaments(),
    loadMembers(),
    loadActivityLog()
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
  const clubId = currentOrganiser.club_id;

  const { count: totalTournaments } = await supabase
    .from('tournaments')
    .select('*', { count: 'exact', head: true })
    .eq('club_id', clubId);

  const { count: activeTournaments } = await supabase
    .from('tournaments')
    .select('*', { count: 'exact', head: true })
    .eq('club_id', clubId)
    .in('status', ['entries_open', 'in_progress']);

  const { count: memberCount } = await supabase
    .from('members')
    .select('*', { count: 'exact', head: true })
    .eq('club_id', clubId);

  const { count: pendingResults } = await supabase
    .from('matches')
    .select('*, tournaments!inner(club_id)', { count: 'exact', head: true })
    .eq('tournaments.club_id', clubId)
    .in('status', ['pending', 'in_progress']);

  document.getElementById('org-stat-total').textContent = totalTournaments || 0;
  document.getElementById('org-stat-active').textContent = activeTournaments || 0;
  document.getElementById('org-stat-members').textContent = memberCount || 0;
  document.getElementById('org-stat-pending').textContent = pendingResults || 0;
}

async function loadTournaments() {
  const clubId = currentOrganiser.club_id;
  const container = document.getElementById('tournaments-table-body');
  if (!container) return;

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('*, tournament_entries(count), clubs(name), whatsapp_group_link')
    .eq('club_id', orgClubId)
    .order('created_at', { ascending: false });

  if (!tournaments || tournaments.length === 0) {
    container.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--gray-400);">No tournaments yet. Create one!</td></tr>';
    return;
  }

  const roundNames = { 0: 'Not Started', 1: 'Round 1', 2: 'Round of 16', 3: 'Quarter Finals', 4: 'Semi Finals', 5: 'Final' };

  container.innerHTML = tournaments.map(t => {
    const entryCount = t.tournament_entries?.[0]?.count || 0;
    const deadline = t.entry_deadline
      ? new Date(t.entry_deadline).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'TBD';

    let statusBadge, actions;
    switch (t.status) {
      case 'entries_open':
        statusBadge = '<span class="badge badge-gold"><span class="status-dot pending"></span> Entries Open</span>';
        var groupBtnOpen = t.whatsapp_group_link
          ? `<a href="${t.whatsapp_group_link}" target="_blank" class="btn btn-sm btn-whatsapp">&#128172; Group</a>`
          : `<button class="btn btn-sm btn-whatsapp" onclick="createWhatsAppGroup('${t.id}','${t.name.replace(/'/g, "\\'")}')">&#128172; Create Group</button>`;
        actions = `
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            <button class="btn btn-sm btn-gold" onclick="generateDraw('${t.id}', ${t.bracket_size})">Generate Draw</button>
            <button class="btn btn-sm btn-secondary" onclick="closeEntries('${t.id}')">Close Entry</button>
            ${groupBtnOpen}
          </div>`;
        break;
      case 'in_progress':
        statusBadge = '<span class="badge badge-green"><span class="status-dot live"></span> In Progress</span>';
        var groupBtn = t.whatsapp_group_link
          ? `<a href="${t.whatsapp_group_link}" target="_blank" class="btn btn-sm btn-whatsapp">&#128172; Group</a>`
          : `<button class="btn btn-sm btn-whatsapp" onclick="createWhatsAppGroup('${t.id}','${t.name.replace(/'/g, "\\'")}')">&#128172; Create Group</button>`;
        actions = `
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            <a href="bracket.html" class="btn btn-sm btn-secondary">View Bracket</a>
            ${groupBtn}
          </div>`;
        break;
      case 'completed':
        statusBadge = '<span class="badge badge-gray"><span class="status-dot closed"></span> Completed</span>';
        actions = '<a href="bracket.html" class="btn btn-sm btn-secondary">View Results</a>';
        break;
      default:
        statusBadge = '<span class="badge badge-blue"><span class="status-dot" style="background:var(--blue);"></span> Scheduled</span>';
        actions = `<button class="btn btn-sm btn-primary" onclick="openEntries('${t.id}')">Open Entries</button>`;
    }

    return `
      <tr>
        <td><strong>${t.name}</strong></td>
        <td>${statusBadge}</td>
        <td>${entryCount} / ${t.bracket_size}</td>
        <td>${roundNames[t.current_round] || 'Round ' + t.current_round}</td>
        <td>${deadline}</td>
        <td>${actions}</td>
      </tr>`;
  }).join('');
}

async function loadMembers() {
  const container = document.getElementById('members-table-body');
  if (!container) return;

  const { data: members } = await supabase
    .from('members')
    .select('*')
    .eq('club_id', orgClubId)
    .order('last_name', { ascending: true });

  if (!members || members.length === 0) {
    container.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--gray-400);">No members yet</td></tr>';
    return;
  }

  container.innerHTML = members.map(m => {
    const initials = m.first_name[0] + m.last_name[0];
    const roleBadge = m.role === 'organiser'
      ? '<span class="badge badge-gold">Organiser</span>'
      : '<span class="badge badge-green">Golfer</span>';
    return `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:0.5rem;">
            <div style="width:28px;height:28px;border-radius:50%;background:var(--green-100);color:var(--green-700);display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:600;">${initials}</div>
            <strong>${m.first_name} ${m.last_name}</strong>
          </div>
        </td>
        <td>${m.handicap}</td>
        <td>${m.phone || '-'}</td>
        <td>${m.email}</td>
        <td>${roleBadge}</td>
        <td><button class="btn btn-sm btn-secondary" onclick="editMember('${m.id}','${m.first_name}','${m.last_name.replace(/'/g, "\\'")}',${m.handicap},'${m.phone || ''}','${m.email}','${m.role}')">Edit</button></td>
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
        <div class="notification-icon" style="background:var(--green-100);color:var(--green-700);">&#9989;</div>
        <div class="notification-content">
          <h4>Score Reported</h4>
          <p>${m.winner?.first_name?.[0]}. ${m.winner?.last_name} beat ${loser?.first_name?.[0]}. ${loser?.last_name} ${m.score || ''} in ${m.tournaments?.name || ''}</p>
        </div>
        <span class="notification-time">${timeAgo}</span>
      </div>`;
  }).join('');
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
      description: description || null
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
  if (!confirm('Generate the draw? This will create the bracket and notify all players.')) return;

  // Get entries
  const { data: entries } = await supabase
    .from('tournament_entries')
    .select('member_id')
    .eq('tournament_id', tournamentId);

  if (!entries || entries.length < 2) {
    alert('Need at least 2 entries to generate a draw.');
    return;
  }

  // Shuffle entries (Fisher-Yates)
  const players = entries.map(e => e.member_id);
  for (let i = players.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [players[i], players[j]] = [players[j], players[i]];
  }

  // Calculate rounds
  const totalRounds = Math.log2(bracketSize);
  const byes = bracketSize - players.length;

  // Generate all match shells from Final backward
  const allMatches = [];

  // Create matches round by round starting from the Final
  for (let round = totalRounds; round >= 1; round--) {
    const matchesInRound = bracketSize / Math.pow(2, round);
    for (let pos = 1; pos <= matchesInRound; pos++) {
      allMatches.push({
        tournament_id: tournamentId,
        round: round,
        position: pos,
        player1_id: null,
        player2_id: null,
        winner_id: null,
        status: 'pending',
        _tempKey: `${round}-${pos}`
      });
    }
  }

  // Link matches: match at round R, pos P feeds into round R+1, pos ceil(P/2)
  for (const match of allMatches) {
    if (match.round < totalRounds) {
      const nextPos = Math.ceil(match.position / 2);
      const nextMatch = allMatches.find(m => m.round === match.round + 1 && m.position === nextPos);
      if (nextMatch) {
        match._nextKey = nextMatch._tempKey;
      }
    }
  }

  // Insert from Final backward so next_match_id references exist
  // Sort: highest round first
  allMatches.sort((a, b) => b.round - a.round || a.position - b.position);

  const keyToId = {};

  for (const match of allMatches) {
    const insertData = {
      tournament_id: match.tournament_id,
      round: match.round,
      position: match.position,
      player1_id: match.player1_id,
      player2_id: match.player2_id,
      winner_id: match.winner_id,
      status: match.status,
      next_match_id: match._nextKey ? keyToId[match._nextKey] : null
    };

    const { data: inserted, error } = await supabase
      .from('matches')
      .insert(insertData)
      .select('id')
      .single();

    if (error) {
      alert('Error generating draw: ' + error.message);
      return;
    }

    keyToId[match._tempKey] = inserted.id;
  }

  // Assign players to Round 1
  const round1Matches = allMatches
    .filter(m => m.round === 1)
    .sort((a, b) => a.position - b.position);

  let playerIdx = 0;
  for (const match of round1Matches) {
    const matchId = keyToId[match._tempKey];
    const p1 = playerIdx < players.length ? players[playerIdx++] : null;
    const p2 = playerIdx < players.length ? players[playerIdx++] : null;

    const updateData = { player1_id: p1 };

    if (p2) {
      updateData.player2_id = p2;
      updateData.status = 'in_progress';
    } else {
      // BYE - auto-advance
      updateData.winner_id = p1;
      updateData.status = 'bye';
    }

    await supabase.from('matches').update(updateData).eq('id', matchId);

    // If BYE, advance winner to next match
    if (!p2 && match._nextKey) {
      const nextMatchId = keyToId[match._nextKey];
      const isOddPosition = match.position % 2 === 1;
      const updateField = isOddPosition ? 'player1_id' : 'player2_id';
      await supabase.from('matches').update({ [updateField]: p1 }).eq('id', nextMatchId);
    }
  }

  // Update seeds
  for (let i = 0; i < players.length; i++) {
    await supabase
      .from('tournament_entries')
      .update({ seed: i + 1 })
      .eq('tournament_id', tournamentId)
      .eq('member_id', players[i]);
  }

  // Update tournament status
  await supabase
    .from('tournaments')
    .update({ status: 'in_progress', current_round: 1 })
    .eq('id', tournamentId);

  alert(`Draw generated! ${players.length} players with ${byes} byes. Bracket is now live.`);
  await Promise.all([loadTournaments(), loadOrgStats()]);
}

// Print draw from live data
async function printDraw() {
  const clubId = currentOrganiser.club_id;

  // Get the first in-progress tournament
  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('*')
    .eq('club_id', clubId)
    .eq('status', 'in_progress')
    .order('created_at', { ascending: false })
    .limit(1);

  if (!tournaments || tournaments.length === 0) {
    alert('No active tournament to print.');
    return;
  }

  const tournament = tournaments[0];

  // Get members
  const { data: members } = await supabase
    .from('members')
    .select('*')
    .eq('club_id', clubId)
    .eq('role', 'golfer')
    .order('last_name');

  // Get matches
  const { data: matches } = await supabase
    .from('matches')
    .select(`
      *,
      player1:members!matches_player1_id_fkey(first_name, last_name),
      player2:members!matches_player2_id_fkey(first_name, last_name),
      winner:members!matches_winner_id_fkey(first_name, last_name)
    `)
    .eq('tournament_id', tournament.id)
    .order('round')
    .order('position');

  // Build print content
  const printSheet = document.getElementById('printDrawSheet');
  const roundNames = { 1: 'Round 1', 2: 'Round of 16', 3: 'Quarter Finals', 4: 'Semi Finals', 5: 'Final' };

  let membersHTML = members.map(m => `
    <tr><td>${m.first_name} ${m.last_name}</td><td>${m.handicap}</td><td>${m.phone || '-'}</td><td>${m.email}</td></tr>
  `).join('');

  let matchesHTML = '';
  let currentRound = 0;
  for (const m of matches) {
    if (m.round !== currentRound) {
      currentRound = m.round;
      matchesHTML += `<tr class="print-round-header"><td colspan="4">${roundNames[m.round] || 'Round ' + m.round}</td></tr>`;
    }
    const p1 = m.player1 ? `${m.player1.first_name[0]}. ${m.player1.last_name}` : 'TBD';
    const p2 = m.player2 ? `${m.player2.first_name[0]}. ${m.player2.last_name}` : (m.status === 'bye' ? 'BYE' : 'TBD');
    const result = m.status === 'completed' ? `${m.winner?.first_name[0]}. ${m.winner?.last_name} won ${m.score || ''}`
      : m.status === 'bye' ? 'BYE' : (m.status === 'in_progress' ? 'In progress' : '—');

    matchesHTML += `<tr><td>${roundNames[m.round] || 'R' + m.round} M${m.position}</td><td>${p1}</td><td>${p2}</td><td>${result}</td></tr>`;
  }

  printSheet.innerHTML = `
    <div class="print-draw-header">
      <h1>&#9971; ${tournament.name}</h1>
      <p>${currentOrganiser.clubs?.name || 'Golf Club'} &bull; ${tournament.bracket_size} Players &bull; Draw Sheet</p>
      <p class="print-date">Printed: ${new Date().toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    </div>
    <h2 class="print-section-title">Player Directory</h2>
    <table class="print-table">
      <thead><tr><th>Name</th><th>Handicap</th><th>Phone</th><th>Email</th></tr></thead>
      <tbody>${membersHTML}</tbody>
    </table>
    <h2 class="print-section-title">Draw</h2>
    <table class="print-table">
      <thead><tr><th>Match</th><th>Player 1</th><th>Player 2</th><th>Result</th></tr></thead>
      <tbody>${matchesHTML}</tbody>
    </table>
    <div class="print-footer"><p>Generated by MyMatchPlayPal</p></div>`;

  window.print();
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
function editMember(id, firstName, lastName, handicap, phone, email, role) {
  document.getElementById('editMemberId').value = id;
  document.getElementById('editMemberFirstName').value = firstName;
  document.getElementById('editMemberLastName').value = lastName;
  document.getElementById('editMemberHandicap').value = handicap;
  document.getElementById('editMemberPhone').value = phone;
  document.getElementById('editMemberEmail').value = email;
  document.getElementById('editMemberRole').value = role;
  document.getElementById('editMemberModal').classList.add('active');
}

async function saveMember() {
  var id = document.getElementById('editMemberId').value;
  var firstName = document.getElementById('editMemberFirstName').value.trim();
  var lastName = document.getElementById('editMemberLastName').value.trim();
  var handicap = parseInt(document.getElementById('editMemberHandicap').value) || 0;
  var phone = document.getElementById('editMemberPhone').value.trim();
  var email = document.getElementById('editMemberEmail').value.trim();
  var role = document.getElementById('editMemberRole').value;

  if (!firstName || !lastName || !email) {
    alert('Name and email are required.');
    return;
  }

  var { error } = await supabase
    .from('members')
    .update({ first_name: firstName, last_name: lastName, handicap: handicap, phone: phone, email: email, role: role })
    .eq('id', id);

  if (error) {
    alert('Error saving: ' + error.message);
    return;
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
