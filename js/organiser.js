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

  // Get match data for all tournaments to derive current round
  var tournamentIds = tournaments.map(function(t) { return t.id; });
  var { data: allMatches } = await supabase
    .from('matches')
    .select('tournament_id, round, status')
    .in('tournament_id', tournamentIds);

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
            <button class="btn btn-sm btn-primary" onclick="openEnrolTournament('${t.id}','${t.name.replace(/'/g, "\\'")}',${t.bracket_size})">Enrol Members</button>
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
            <button class="btn btn-sm btn-primary" onclick="openRoundDeadlines('${t.id}','${t.name.replace(/'/g, "\\'")}',${t.bracket_size})">Set Deadlines</button>
            <button class="btn btn-sm btn-gold" onclick="redraw('${t.id}', ${t.bracket_size})">Re-Draw</button>
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

    // Append delete button
    var deleteBtn = `<button class="btn btn-sm btn-danger" onclick="deleteTournament('${t.id}','${t.name.replace(/'/g, "\\'")}')" style="font-size:0.65rem;">Delete</button>`;
    // Insert delete button before the closing </div> of actions
    if (actions.lastIndexOf('</div>') !== -1) {
      var pos = actions.lastIndexOf('</div>');
      actions = actions.substring(0, pos) + deleteBtn + actions.substring(pos);
    } else {
      actions = actions + deleteBtn;
    }

    // Auto-derive current round from match data
    var tMatches = (allMatches || []).filter(function(m) { return m.tournament_id === t.id; });
    var roundDisplay = deriveRoundDisplay(t, tMatches);

    return `
      <tr>
        <td><strong>${t.name}</strong></td>
        <td>${statusBadge}</td>
        <td>${entryCount} / ${t.bracket_size}</td>
        <td>${roundDisplay}</td>
        <td>${deadline}</td>
        <td>${actions}</td>
      </tr>`;
  }).join('');
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
        <td>
          <div style="display:flex;align-items:center;gap:0.5rem;">
            <div style="width:28px;height:28px;border-radius:50%;background:var(--green-100);color:var(--green-700);display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:600;">${initials}</div>
            <strong>${m.first_name} ${m.last_name}</strong> ${typeBadge} ${statusBadge}
          </div>
        </td>
        <td>${m.handicap}</td>
        <td>${m.phone || '-'}</td>
        <td>${m.email}</td>
        <td>${roleBadge}</td>
        <td>
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
        <div class="notification-icon" style="background:var(--green-100);color:var(--green-700);">&#9989;</div>
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
    logoEl.innerHTML = '&#9971;';
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

  // Delete any existing matches for this tournament (in case of re-draw)
  var { error: delErr } = await supabase.from('matches').delete().eq('tournament_id', tournamentId);
  console.log('[MMP] Delete old matches:', delErr ? delErr.message : 'OK');

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

  // Auto-size bracket — round up to nearest power of 2
  // e.g. 5 players → 8, 7 → 8, 9 → 16, 17 → 32
  var effectiveSize = 2;
  while (effectiveSize < players.length) effectiveSize *= 2;
  bracketSize = effectiveSize;

  console.log('[MMP] Players:', players.length, 'Bracket size:', bracketSize, 'Byes:', bracketSize - players.length);

  // Update the tournament's bracket_size to the effective size
  var { error: sizeErr } = await supabase.from('tournaments').update({ bracket_size: bracketSize }).eq('id', tournamentId);
  console.log('[MMP] Bracket size update:', sizeErr ? sizeErr.message : 'OK → ' + bracketSize);

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
      console.error('[MMP] Match insert error:', error, 'Data:', insertData);
      alert('Error generating draw: ' + error.message);
      return;
    }
    console.log('[MMP] Inserted match:', match._tempKey, '->', inserted.id);

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
  var { error: statusErr } = await supabase
    .from('tournaments')
    .update({ status: 'in_progress', current_round: 1 })
    .eq('id', tournamentId);

  console.log('[MMP] Tournament status update:', statusErr ? statusErr.message : 'OK');
  if (statusErr) {
    alert('Draw generated but could not update tournament status: ' + statusErr.message);
  } else {
    alert('Draw generated! ' + players.length + ' players with ' + byes + ' byes. Bracket is now live.');
  }
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

  // Get club logo for print
  var { data: printClub } = await supabase.from('clubs').select('logo_url').eq('id', orgClubId).single();
  var printLogo = printClub && printClub.logo_url
    ? '<img src="' + printClub.logo_url + '" alt="" style="width:60px;height:60px;object-fit:contain;margin:0 auto 0.5rem;">'
    : '';

  printSheet.innerHTML = `
    <div class="print-draw-header">
      ${printLogo}
      <h1>${tournament.name}</h1>
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

  if (requests.length === 0) {
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
