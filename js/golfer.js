// ============================================
// MyMatchPlayPal - Golfer Dashboard
// ============================================

let currentMember = null;
let myClubs = []; // All clubs this member belongs to
let myClubIds = []; // Just the IDs for filtering

async function initGolferDashboard() {
  try {
    console.log('[MMP] Starting golfer dashboard init...');
    console.log('[MMP] Supabase client:', supabase ? 'OK' : 'MISSING');

    currentMember = await getCurrentMember();
    console.log('[MMP] Current member:', currentMember);
    if (!currentMember) {
      window.location.href = 'login.html';
      return;
    }

    // Load all club memberships for this member (golfer can be in multiple clubs)
    var { data: memberships, error: memErr } = await supabase
      .from('club_memberships')
      .select('*, clubs(id, name)')
      .eq('member_id', currentMember.id);

    console.log('[MMP] Club memberships:', memberships, 'Error:', memErr);

    // Fallback to old single-club model if no memberships exist
    if (!memberships || memberships.length === 0) {
      myClubs = [{ club_id: currentMember.club_id, role: currentMember.role, handicap: currentMember.handicap, clubs: currentMember.clubs }];
    } else {
      myClubs = memberships;
    }
    myClubIds = myClubs.map(function(c) { return c.club_id; });
    console.log('[MMP] Club IDs:', myClubIds);

    updateNavForAuth(currentMember);
    renderSidebar();
    document.getElementById('dashboard-greeting').textContent = 'Welcome back, ' + currentMember.first_name;

  // Show club logo in navbar if available
  if (myClubIds.length > 0) {
    var { data: primaryClub } = await supabase.from('clubs').select('logo_url').eq('id', myClubIds[0]).single();
    if (primaryClub && primaryClub.logo_url) {
      var brandIcon = document.querySelector('.navbar-brand .brand-icon');
      if (brandIcon) brandIcon.innerHTML = '<img src="' + primaryClub.logo_url + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius);">';
    }
  }
  // Load all sections — catch errors individually so one failure doesn't block others
  var sections = [
    { name: 'Stats', fn: loadStats },
    { name: 'Matches', fn: loadUpcomingMatches },
    { name: 'Results', fn: loadRecentResults },
    { name: 'Notifications', fn: loadNotifications },
    { name: 'Tournaments', fn: loadOpenTournaments },
    { name: 'Profile', fn: loadProfile },
    { name: 'ClubSelector', fn: loadClubSelector }
  ];
  await Promise.all(sections.map(function(s) {
    return s.fn().catch(function(err) { console.error('[MMP] ' + s.name + ' error:', err); });
  }));
  populateScoreForm().catch(function(err) { console.error('[MMP] ScoreForm error:', err); });
  console.log('[MMP] Golfer dashboard init complete.');
  } catch (err) {
    console.error('[MMP] Golfer dashboard init error:', err);
  }
}

function renderSidebar() {
  const el = document.getElementById('sidebar-profile');
  if (!el) return;
  const initials = currentMember.first_name[0] + currentMember.last_name[0];
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:0.75rem;padding:0 0.75rem;margin-bottom:1.25rem;">
      <div class="profile-avatar golfer" style="width:48px;height:48px;font-size:1.1rem;">${initials}</div>
      <div>
        <div style="font-weight:600;font-size:0.95rem;">${currentMember.first_name} ${currentMember.last_name}</div>
        <div style="font-size:0.75rem;color:var(--gray-500);">Handicap: ${currentMember.handicap}</div>
      </div>
    </div>`;
}

async function loadStats() {
  try {
    const memberId = currentMember.id;

    // Active tournaments - simpler query
    var { data: myEntries } = await supabase
      .from('tournament_entries')
      .select('tournament_id')
      .eq('member_id', memberId);

    var activeTournaments = 0;
    if (myEntries && myEntries.length > 0) {
      var tIds = myEntries.map(function(e) { return e.tournament_id; });
      var { data: activeTourns } = await supabase
        .from('tournaments')
        .select('id')
        .in('id', tIds)
        .in('status', ['entries_open', 'in_progress']);
      activeTournaments = (activeTourns || []).length;
    }

    // Matches to play
    var { data: pendingMatches } = await supabase
      .from('matches')
      .select('id')
      .or('player1_id.eq.' + memberId + ',player2_id.eq.' + memberId)
      .in('status', ['pending', 'in_progress']);
    var matchesToPlay = (pendingMatches || []).length;

    // Win/Loss
    var { data: wonMatches } = await supabase
      .from('matches')
      .select('id')
      .eq('winner_id', memberId)
      .eq('status', 'completed');
    var wins = (wonMatches || []).length;

    var { data: allMyMatches } = await supabase
      .from('matches')
      .select('id')
      .or('player1_id.eq.' + memberId + ',player2_id.eq.' + memberId)
      .eq('status', 'completed');
    var totalPlayed = (allMyMatches || []).length;
    var losses = totalPlayed - wins;

    var el;
    el = document.getElementById('stat-active'); if (el) el.textContent = activeTournaments;
    el = document.getElementById('stat-matches'); if (el) el.textContent = matchesToPlay;
    el = document.getElementById('stat-record'); if (el) el.textContent = wins + '-' + losses;
    el = document.getElementById('stat-streak'); if (el) el.textContent = await calculateStreak(memberId);
  } catch (err) {
    console.error('[MMP] loadStats error:', err);
  }
}

async function calculateStreak(memberId) {
  const { data: recentMatches } = await supabase
    .from('matches')
    .select('winner_id')
    .or(`player1_id.eq.${memberId},player2_id.eq.${memberId}`)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(20);

  if (!recentMatches || recentMatches.length === 0) return 0;

  let streak = 0;
  const firstIsWin = recentMatches[0].winner_id === memberId;
  for (const m of recentMatches) {
    if ((m.winner_id === memberId) === firstIsWin) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

async function loadUpcomingMatches() {
  const memberId = currentMember.id;

  const { data: matches } = await supabase
    .from('matches')
    .select(`
      id, round, score, status, deadline, scheduled_at,
      tournaments(id, name, whatsapp_group_link, clubs(name)),
      player1:members!matches_player1_id_fkey(id, first_name, last_name, handicap, phone, email, contact_preference),
      player2:members!matches_player2_id_fkey(id, first_name, last_name, handicap, phone, email, contact_preference)
    `)
    .or(`player1_id.eq.${memberId},player2_id.eq.${memberId}`)
    .in('status', ['pending', 'in_progress'])
    .order('deadline', { ascending: true });

  const roundNames = { 1: 'Round 1', 2: 'Round of 16', 3: 'Quarter Final', 4: 'Semi Final', 5: 'Final' };

  // Desktop table
  const tableBody = document.getElementById('upcoming-matches-body');
  // Mobile cards
  const mobileContainer = document.getElementById('upcoming-matches-mobile');

  if (!matches || matches.length === 0) {
    if (tableBody) tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--gray-400);">No upcoming matches</td></tr>';
    if (mobileContainer) mobileContainer.innerHTML = '<p style="padding:1rem;text-align:center;color:var(--gray-400);">No upcoming matches</p>';
    return;
  }

  let tableHTML = '';
  let mobileHTML = '';

  for (const match of matches) {
    const opponent = match.player1?.id === memberId ? match.player2 : match.player1;
    if (!opponent) continue;

    const initials = opponent.first_name[0] + opponent.last_name[0];
    const oppName = `${opponent.first_name} ${opponent.last_name}`;
    const roundName = roundNames[match.round] || `Round ${match.round}`;
    const deadline = match.deadline ? new Date(match.deadline).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBD';
    const statusBadge = match.status === 'in_progress'
      ? '<span class="badge badge-green"><span class="status-dot live"></span> In Progress</span>'
      : '<span class="badge badge-gold"><span class="status-dot pending"></span> Awaiting</span>';

    // Scheduled date/time
    const hasSchedule = match.scheduled_at;
    const scheduleDate = hasSchedule ? new Date(match.scheduled_at) : null;
    const scheduleDisplay = scheduleDate
      ? scheduleDate.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' }) + ' at ' + scheduleDate.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })
      : null;
    const scheduleInputVal = hasSchedule ? match.scheduled_at.substring(0, 16) : '';

    const msgText = `Hi ${opponent.first_name}, we're matched in ${match.tournaments?.name || 'the tournament'} (${roundName}). When suits you to play?`;
    const hasPhone = opponent.phone && opponent.phone.trim().length > 0;
    const phoneClean = hasPhone ? opponent.phone.replace(/\s/g, '') : '';
    const pref = opponent.contact_preference || 'whatsapp';
    const whatsappUrl = hasPhone ? `https://wa.me/${phoneClean}?text=${encodeURIComponent(msgText)}` : null;
    const smsUrl = hasPhone ? `sms:${phoneClean}?body=${encodeURIComponent(msgText)}` : null;
    const emailUrl = opponent.email ? `mailto:${opponent.email}?subject=${encodeURIComponent(match.tournaments?.name + ' - ' + roundName)}&body=${encodeURIComponent(msgText)}` : null;
    const contactButtons = buildContactButtons(pref, whatsappUrl, smsUrl, emailUrl, hasPhone);

    var scheduleCell = scheduleDisplay
      ? `<span style="font-size:0.8rem;font-weight:600;color:var(--green-700);">&#128197; ${scheduleDisplay}</span><br><button class="btn btn-sm btn-secondary" style="font-size:0.65rem;margin-top:0.25rem;padding:0.2rem 0.4rem;" onclick="document.getElementById('sched-${match.id}').style.display='block'">Change</button><div id="sched-${match.id}" style="display:none;margin-top:0.25rem;"><input type="datetime-local" class="form-input" style="font-size:0.75rem;padding:0.25rem;" value="${scheduleInputVal}" onchange="saveMatchSchedule('${match.id}',this.value)"></div>`
      : `<button class="btn btn-sm btn-primary" style="font-size:0.7rem;" onclick="document.getElementById('sched-${match.id}').style.display='block'">Set Date & Time</button><div id="sched-${match.id}" style="display:none;margin-top:0.25rem;"><input type="datetime-local" class="form-input" style="font-size:0.75rem;padding:0.25rem;" onchange="saveMatchSchedule('${match.id}',this.value)"></div>`;

    tableHTML += `
      <tr>
        <td><strong>${match.tournaments?.name || ''}</strong></td>
        <td>${roundName}</td>
        <td>
          <div style="display:flex;align-items:center;gap:0.5rem;">
            <div style="width:28px;height:28px;border-radius:50%;background:var(--green-100);color:var(--green-700);display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:600;">${initials}</div>
            ${oppName} (Hcp ${opponent.handicap})
          </div>
        </td>
        <td>${deadline}</td>
        <td>${scheduleCell}</td>
        <td>${statusBadge}</td>
        <td>${contactButtons.desktop}</td>
      </tr>`;

    var clubLabel = match.tournaments?.clubs?.name ? `<span style="font-size:0.7rem;color:var(--gray-400);">${match.tournaments.clubs.name}</span>` : '';
    var groupLink = match.tournaments?.whatsapp_group_link
      ? `<a href="${match.tournaments.whatsapp_group_link}" target="_blank" class="btn btn-sm btn-whatsapp" style="font-size:0.75rem;padding:0.3rem 0.6rem;">&#128172; Group Chat</a>`
      : '';

    mobileHTML += `
      <div class="match-card-mobile">
        <div class="match-card-mobile-top">
          <div>
            <strong>${match.tournaments?.name || ''}</strong>
            <span class="match-card-mobile-round">${roundName}</span>
            ${clubLabel}
          </div>
          ${statusBadge}
        </div>
        <div class="match-card-mobile-opponent">
          <div class="match-card-mobile-avatar">${initials}</div>
          <div>
            <div class="match-card-mobile-name">${oppName}</div>
            <div class="match-card-mobile-hcp">Handicap ${opponent.handicap}</div>
          </div>
        </div>
        <div style="padding:0.5rem 0;border-top:1px solid var(--gray-100);">
          ${scheduleDisplay
            ? `<div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-size:0.85rem;font-weight:600;color:var(--green-700);">&#128197; ${scheduleDisplay}</span><button class="btn btn-sm btn-secondary" style="font-size:0.65rem;padding:0.2rem 0.5rem;" onclick="document.getElementById('msched-${match.id}').style.display='block'">Change</button></div>`
            : `<button class="btn btn-sm btn-primary" style="width:100%;font-size:0.85rem;" onclick="document.getElementById('msched-${match.id}').style.display='block'">&#128197; Set Date & Time</button>`
          }
          <div id="msched-${match.id}" style="display:${scheduleDisplay ? 'none' : 'none'};margin-top:0.4rem;">
            <input type="datetime-local" class="form-input" style="font-size:0.85rem;" value="${scheduleInputVal}" onchange="saveMatchSchedule('${match.id}',this.value)">
          </div>
        </div>
        <div class="match-card-mobile-footer">
          <span class="match-card-mobile-deadline">&#128197; Due: ${deadline}</span>
          ${contactButtons.mobile}
        </div>
        ${groupLink ? `<div style="padding:0.25rem 0 0;border-top:1px solid var(--gray-100);margin-top:0.25rem;">${groupLink}</div>` : ''}
      </div>`;
  }

  if (tableBody) tableBody.innerHTML = tableHTML;
  if (mobileContainer) mobileContainer.innerHTML = mobileHTML;
}

async function loadRecentResults() {
  const memberId = currentMember.id;

  const { data: matches } = await supabase
    .from('matches')
    .select(`
      id, round, score, winner_id,
      tournaments(name),
      player1:members!matches_player1_id_fkey(id, first_name, last_name),
      player2:members!matches_player2_id_fkey(id, first_name, last_name)
    `)
    .or(`player1_id.eq.${memberId},player2_id.eq.${memberId}`)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(5);

  const container = document.getElementById('recent-results');
  if (!container) return;

  if (!matches || matches.length === 0) {
    container.innerHTML = '<p style="padding:1rem;text-align:center;color:var(--gray-400);">No results yet</p>';
    return;
  }

  const roundNames = { 1: 'Round 1', 2: 'Round of 16', 3: 'Quarter Final', 4: 'Semi Final', 5: 'Final' };

  container.innerHTML = matches.map(m => {
    const opponent = m.player1?.id === memberId ? m.player2 : m.player1;
    const won = m.winner_id === memberId;
    const borderColor = won ? 'var(--green-500)' : 'var(--red)';
    const bgColor = won ? 'var(--green-50)' : '#fef2f2';
    const badge = won
      ? '<span class="badge badge-green">Won</span>'
      : '<span class="badge badge-red">Lost</span>';

    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0.75rem;background:${bgColor};border-radius:var(--radius);border-left:3px solid ${borderColor};">
        <div>
          <div style="font-weight:600;font-size:0.9rem;">vs ${opponent?.first_name?.[0]}. ${opponent?.last_name || 'Unknown'}</div>
          <div style="font-size:0.75rem;color:var(--gray-500);">${m.tournaments?.name || ''} &bull; ${roundNames[m.round] || `Round ${m.round}`}</div>
        </div>
        <div style="text-align:right;">
          ${badge}
          <div style="font-size:0.85rem;font-weight:600;margin-top:0.25rem;">${m.score || ''}</div>
        </div>
      </div>`;
  }).join('');
}

async function loadNotifications() {
  // For now, show recent activity relevant to the member
  const memberId = currentMember.id;
  const container = document.getElementById('notifications-list');
  if (!container) return;

  // Get tournaments the member is in
  const { data: entries } = await supabase
    .from('tournament_entries')
    .select('tournament_id')
    .eq('member_id', memberId);

  const tournamentIds = (entries || []).map(e => e.tournament_id);

  if (tournamentIds.length === 0) {
    container.innerHTML = '<p style="padding:1rem;text-align:center;color:var(--gray-400);">No notifications</p>';
    return;
  }

  // Get recent completed matches in those tournaments
  const { data: recentMatches } = await supabase
    .from('matches')
    .select(`
      id, score, status, created_at,
      tournaments(name),
      winner:members!matches_winner_id_fkey(first_name, last_name),
      player1:members!matches_player1_id_fkey(first_name, last_name),
      player2:members!matches_player2_id_fkey(first_name, last_name)
    `)
    .in('tournament_id', tournamentIds)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(5);

  if (!recentMatches || recentMatches.length === 0) {
    container.innerHTML = '<p style="padding:1rem;text-align:center;color:var(--gray-400);">No notifications</p>';
    return;
  }

  container.innerHTML = recentMatches.map(m => {
    const loser = m.winner?.last_name === m.player1?.last_name ? m.player2 : m.player1;
    const timeAgo = getTimeAgo(new Date(m.created_at));
    return `
      <div class="notification-item">
        <div class="notification-icon" style="background:var(--green-100);color:var(--green-700);">&#9989;</div>
        <div class="notification-content">
          <h4>Result: ${m.tournaments?.name || ''}</h4>
          <p>${m.winner?.first_name?.[0]}. ${m.winner?.last_name} beat ${loser?.first_name?.[0]}. ${loser?.last_name} ${m.score || ''}</p>
        </div>
        <span class="notification-time">${timeAgo}</span>
      </div>`;
  }).join('');
}

async function loadOpenTournaments() {
  const container = document.getElementById('open-tournaments');
  if (!container) return;

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('*, tournament_entries(count), whatsapp_group_link, clubs(name)')
    .in('club_id', myClubIds)
    .in('status', ['entries_open', 'scheduled'])
    .order('entry_deadline', { ascending: true });

  if (!tournaments || tournaments.length === 0) {
    container.innerHTML = '<p style="padding:1rem;text-align:center;color:var(--gray-400);">No open tournaments</p>';
    return;
  }

  // Check which ones the member already entered
  const { data: myEntries } = await supabase
    .from('tournament_entries')
    .select('tournament_id')
    .eq('member_id', currentMember.id);

  const enteredIds = new Set((myEntries || []).map(e => e.tournament_id));

  // Only show tournaments not yet entered
  const notEntered = tournaments.filter(t => !enteredIds.has(t.id));

  if (notEntered.length === 0) {
    container.innerHTML = '<p style="padding:1rem;text-align:center;color:var(--gray-400);">No new tournaments available</p>';
    return;
  }

  container.innerHTML = notEntered.map(t => {
    const entryCount = t.tournament_entries?.[0]?.count || 0;
    const pct = Math.round((entryCount / t.bracket_size) * 100);
    const isOpen = t.status === 'entries_open';
    const deadline = t.entry_deadline ? new Date(t.entry_deadline).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBD';

    const statusBadge = isOpen
      ? '<span class="badge badge-green"><span class="status-dot live"></span> Open</span>'
      : '<span class="badge badge-gold"><span class="status-dot pending"></span> Opening Soon</span>';

    const actionBtn = isOpen
      ? `<button class="btn btn-sm btn-primary" onclick="enterTournament('${t.id}', this)">Enter Now</button>`
      : '<button class="btn btn-sm btn-secondary" disabled>Not Open Yet</button>';

    const borderStyle = isOpen ? 'border:1.5px solid var(--green-300);background:var(--green-50);' : 'border:1.5px solid var(--gray-200);';

    return `
      <div style="${borderStyle}border-radius:var(--radius-lg);padding:1.25rem;">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:0.5rem;">
          <h4 style="font-size:1rem;font-weight:700;">${t.name}</h4>
          ${statusBadge}
        </div>
        <p style="font-size:0.85rem;color:var(--gray-600);margin-bottom:0.75rem;">${t.clubs?.name ? '<strong>' + t.clubs.name + '</strong> &mdash; ' : ''}${t.bracket_size}-player bracket. ${isOpen ? 'Entry closes' : 'Opens'} ${deadline}. ${t.description || ''}</p>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:0.8rem;color:var(--gray-500);">${entryCount} / ${t.bracket_size} entered</span>
          ${actionBtn}
        </div>
        ${isOpen ? `<div style="margin-top:0.5rem;background:var(--gray-200);border-radius:var(--radius-full);height:6px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:var(--green-500);border-radius:var(--radius-full);"></div>
        </div>` : ''}
        ${t.whatsapp_group_link ? `<a href="${t.whatsapp_group_link}" target="_blank" class="btn btn-sm btn-whatsapp mt-1">&#128172; Join WhatsApp Group</a>` : ''}
      </div>`;
  }).join('');
}

async function enterTournament(tournamentId, btn) {
  btn.disabled = true;
  btn.textContent = 'Entering...';

  const { error } = await supabase
    .from('tournament_entries')
    .insert({ tournament_id: tournamentId, member_id: currentMember.id });

  if (error) {
    alert('Could not enter: ' + error.message);
    btn.disabled = false;
    btn.textContent = 'Enter Now';
    return;
  }

  btn.textContent = 'Entered';
  btn.classList.remove('btn-primary');
  btn.classList.add('btn-secondary');
  loadStats();
}

async function loadProfile() {
  const memberId = currentMember.id;

  const initials = currentMember.first_name[0] + currentMember.last_name[0];
  const profileEl = document.getElementById('golfer-profile');
  if (!profileEl) return;

  const { count: totalPlayed } = await supabase
    .from('matches')
    .select('*', { count: 'exact', head: true })
    .or(`player1_id.eq.${memberId},player2_id.eq.${memberId}`)
    .eq('status', 'completed');

  const { count: wins } = await supabase
    .from('matches')
    .select('*', { count: 'exact', head: true })
    .eq('winner_id', memberId)
    .eq('status', 'completed');

  const losses = (totalPlayed || 0) - (wins || 0);
  const winRate = totalPlayed > 0 ? Math.round((wins / totalPlayed) * 100) : 0;

  // Fetch club logos
  var clubLogoMap = {};
  if (myClubIds.length > 0) {
    var { data: clubsWithLogos } = await supabase.from('clubs').select('id, logo_url').in('id', myClubIds);
    (clubsWithLogos || []).forEach(function(c) { if (c.logo_url) clubLogoMap[c.id] = c.logo_url; });
  }

  // Build club memberships list
  var clubsHTML = myClubs.map(function(c) {
    var clubName = c.clubs?.name || 'Golf Club';
    var roleBadge = c.role === 'organiser'
      ? '<span class="badge badge-gold" style="font-size:0.65rem;">Organiser</span>'
      : '<span class="badge badge-green" style="font-size:0.65rem;">Golfer</span>';
    var logo = clubLogoMap[c.club_id]
      ? '<img src="' + clubLogoMap[c.club_id] + '" alt="" style="width:24px;height:24px;border-radius:4px;object-fit:cover;">'
      : '&#9971;';
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0.75rem;background:var(--gray-100);border-radius:var(--radius);font-size:0.85rem;">
      <span style="display:flex;align-items:center;gap:0.5rem;">${logo} <strong>${clubName}</strong> &mdash; Hcp ${c.handicap}</span>
      ${roleBadge}
    </div>`;
  }).join('');

  profileEl.innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar golfer">${initials}</div>
      <div class="profile-info">
        <h2>${currentMember.first_name} ${currentMember.last_name}</h2>
        <div class="profile-role">Member of ${myClubs.length} club${myClubs.length !== 1 ? 's' : ''}</div>
        <div class="profile-meta">
          <span>&#128222; ${currentMember.phone || 'N/A'}</span>
          <span>&#128231; ${currentMember.email}</span>
          <span>&#128172; Prefers: ${({'whatsapp':'WhatsApp','sms':'SMS','email':'Email'})[currentMember.contact_preference] || 'WhatsApp'}</span>
        </div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:0.5rem;margin:1rem 0;">
      <h4 style="font-size:0.85rem;font-weight:600;color:var(--gray-600);">My Clubs</h4>
      ${clubsHTML}
    </div>
    <div class="profile-stats-row">
      <div class="profile-stat" style="background:var(--green-50);">
        <div class="profile-stat-value" style="color:var(--green-700);">${totalPlayed || 0}</div>
        <div class="profile-stat-label">Played</div>
      </div>
      <div class="profile-stat" style="background:var(--green-50);">
        <div class="profile-stat-value" style="color:var(--green-700);">${wins || 0}</div>
        <div class="profile-stat-label">Wins</div>
      </div>
      <div class="profile-stat" style="background:#fef2f2;">
        <div class="profile-stat-value" style="color:var(--red);">${losses}</div>
        <div class="profile-stat-label">Losses</div>
      </div>
      <div class="profile-stat" style="background:#fef3c7;">
        <div class="profile-stat-value" style="color:#92400e;">${winRate}%</div>
        <div class="profile-stat-label">Win Rate</div>
      </div>
    </div>`;
}

async function populateScoreForm() {
  const memberId = currentMember.id;
  const select = document.getElementById('score-match-select');
  if (!select) return;

  const { data: matches } = await supabase
    .from('matches')
    .select(`
      id, round,
      tournaments(name),
      player1:members!matches_player1_id_fkey(id, first_name, last_name),
      player2:members!matches_player2_id_fkey(id, first_name, last_name)
    `)
    .or(`player1_id.eq.${memberId},player2_id.eq.${memberId}`)
    .in('status', ['pending', 'in_progress']);

  select.innerHTML = matches && matches.length > 0
    ? matches.map(m => {
        const opp = m.player1?.id === memberId ? m.player2 : m.player1;
        return `<option value="${m.id}">${m.tournaments?.name || 'Tournament'} &mdash; vs ${opp?.first_name?.[0]}. ${opp?.last_name || 'TBD'}</option>`;
      }).join('')
    : '<option disabled>No matches to report</option>';
}

async function submitScore() {
  const matchId = document.getElementById('score-match-select').value;
  const result = document.getElementById('score-result').value;
  const score = document.getElementById('score-value').value.trim();

  if (!matchId || !score) {
    alert('Please select a match and enter the score.');
    return;
  }

  // Get the match to determine winner
  const { data: match } = await supabase
    .from('matches')
    .select('player1_id, player2_id, next_match_id, position')
    .eq('id', matchId)
    .single();

  if (!match) { alert('Match not found.'); return; }

  const winnerId = result === 'won' ? currentMember.id
    : (match.player1_id === currentMember.id ? match.player2_id : match.player1_id);

  // Update the match
  const { error } = await supabase
    .from('matches')
    .update({ winner_id: winnerId, score: score, status: 'completed' })
    .eq('id', matchId);

  if (error) { alert('Error: ' + error.message); return; }

  // Advance winner to next match
  if (match.next_match_id) {
    const isOddPosition = match.position % 2 === 1;
    const updateField = isOddPosition ? 'player1_id' : 'player2_id';
    await supabase
      .from('matches')
      .update({ [updateField]: winnerId, status: 'in_progress' })
      .eq('id', match.next_match_id);
  }

  alert('Score submitted! The bracket has been updated.');
  // Refresh data
  await Promise.all([loadStats(), loadUpcomingMatches(), loadRecentResults(), loadProfile()]);
  populateScoreForm();
}

// Schedule a match date/time
async function saveMatchSchedule(matchId, dateTimeValue) {
  if (!dateTimeValue) return;

  var { error } = await supabase
    .from('matches')
    .update({ scheduled_at: new Date(dateTimeValue).toISOString(), status: 'in_progress' })
    .eq('id', matchId);

  if (error) {
    alert('Error saving schedule: ' + error.message);
    return;
  }

  // Notify via contact preference if possible
  var schedDate = new Date(dateTimeValue);
  var displayDate = schedDate.toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' });
  var displayTime = schedDate.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' });

  alert('Match scheduled for ' + displayDate + ' at ' + displayTime + '!');
  loadUpcomingMatches();
  loadStats();
}

// Join a Club
async function loadClubSelector() {
  var select = document.getElementById('joinClubSelect');
  if (!select) return;

  // Get all clubs
  var { data: clubs } = await supabase.from('clubs').select('id, name').order('name');

  // Filter out clubs the member is already in or has pending requests for
  var existingIds = new Set(myClubIds);
  var { data: pending } = await supabase
    .from('membership_requests')
    .select('club_id')
    .eq('member_id', currentMember.id)
    .eq('status', 'pending');
  (pending || []).forEach(function(r) { existingIds.add(r.club_id); });

  var available = (clubs || []).filter(function(c) { return !existingIds.has(c.id); });

  if (available.length === 0) {
    select.innerHTML = '<option disabled>No new clubs available</option>';
  } else {
    select.innerHTML = '<option value="" disabled selected>Choose a club...</option>' +
      available.map(function(c) { return '<option value="' + c.id + '">' + c.name + '</option>'; }).join('');
  }

  // Show pending requests
  loadPendingRequests();
}

async function loadPendingRequests() {
  var container = document.getElementById('pending-requests');
  if (!container) return;

  var { data: requests } = await supabase
    .from('membership_requests')
    .select('*, clubs(name)')
    .eq('member_id', currentMember.id)
    .order('requested_at', { ascending: false })
    .limit(5);

  if (!requests || requests.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '<div style="font-size:0.8rem;font-weight:600;color:var(--gray-600);margin-bottom:0.5rem;">My Requests</div>' +
    requests.map(function(r) {
      var badge = '';
      if (r.status === 'pending') badge = '<span class="badge badge-gold"><span class="status-dot pending"></span> Pending</span>';
      else if (r.status === 'approved') badge = '<span class="badge badge-green">Approved</span>';
      else badge = '<span class="badge badge-red">Rejected</span>';

      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0.75rem;background:var(--gray-100);border-radius:var(--radius);font-size:0.85rem;margin-bottom:0.35rem;">' +
        '<span>' + (r.clubs?.name || 'Club') + '</span>' + badge + '</div>';
    }).join('');
}

async function requestClubMembership() {
  var clubId = document.getElementById('joinClubSelect').value;
  var handicap = parseInt(document.getElementById('joinClubHandicap').value) || 0;

  if (!clubId) {
    alert('Please select a club.');
    return;
  }

  var { error } = await supabase.from('membership_requests').insert({
    member_id: currentMember.id,
    club_id: clubId,
    status: 'pending',
    message: 'Handicap: ' + handicap
  });

  if (error) {
    alert('Error: ' + error.message);
    return;
  }

  alert('Request sent! The club organiser will review it.');
  loadClubSelector();
}

// Edit Profile
function openEditProfile() {
  if (!currentMember) return;
  document.getElementById('editFirstName').value = currentMember.first_name;
  document.getElementById('editLastName').value = currentMember.last_name;
  document.getElementById('editHandicap').value = currentMember.handicap;
  document.getElementById('editPhone').value = currentMember.phone || '';
  document.getElementById('editEmail').value = currentMember.email;
  document.getElementById('editContactPref').value = currentMember.contact_preference || 'whatsapp';
  document.getElementById('editProfileModal').classList.add('active');
}

async function saveProfile() {
  var firstName = document.getElementById('editFirstName').value.trim();
  var lastName = document.getElementById('editLastName').value.trim();
  var handicap = parseInt(document.getElementById('editHandicap').value) || 0;
  var phone = document.getElementById('editPhone').value.trim();
  var contactPref = document.getElementById('editContactPref').value;

  if (!firstName || !lastName) {
    alert('Name is required.');
    return;
  }

  var { error } = await supabase
    .from('members')
    .update({ first_name: firstName, last_name: lastName, handicap: handicap, phone: phone, contact_preference: contactPref })
    .eq('id', currentMember.id);

  if (error) {
    alert('Error saving: ' + error.message);
    return;
  }

  // Refresh member data
  currentMember = await getCurrentMember();
  document.getElementById('editProfileModal').classList.remove('active');
  renderSidebar();
  updateNavForAuth(currentMember);
  loadProfile();
  document.getElementById('dashboard-greeting').textContent = 'Welcome back, ' + currentMember.first_name;
  alert('Profile updated!');
}

// Build contact buttons based on opponent's preference
function buildContactButtons(pref, whatsappUrl, smsUrl, emailUrl, hasPhone) {
  var prefLabels = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email' };
  var prefIcon = { whatsapp: '&#128172;', sms: '&#128241;', email: '&#128231;' };

  // Primary button based on preference
  var primaryBtn = '';
  var secondaryBtns = '';

  if (pref === 'whatsapp' && whatsappUrl) {
    primaryBtn = `<a href="${whatsappUrl}" target="_blank" class="btn btn-sm btn-whatsapp">${prefIcon.whatsapp} WhatsApp</a>`;
    if (smsUrl) secondaryBtns += `<a href="${smsUrl}" class="btn btn-sm btn-secondary">${prefIcon.sms} SMS</a>`;
    if (emailUrl) secondaryBtns += `<a href="${emailUrl}" class="btn btn-sm btn-secondary">${prefIcon.email} Email</a>`;
  } else if (pref === 'sms' && smsUrl) {
    primaryBtn = `<a href="${smsUrl}" class="btn btn-sm btn-primary">${prefIcon.sms} SMS</a>`;
    if (whatsappUrl) secondaryBtns += `<a href="${whatsappUrl}" target="_blank" class="btn btn-sm btn-whatsapp">${prefIcon.whatsapp} WhatsApp</a>`;
    if (emailUrl) secondaryBtns += `<a href="${emailUrl}" class="btn btn-sm btn-secondary">${prefIcon.email} Email</a>`;
  } else if (pref === 'email' && emailUrl) {
    primaryBtn = `<a href="${emailUrl}" class="btn btn-sm btn-primary">${prefIcon.email} Email</a>`;
    if (whatsappUrl) secondaryBtns += `<a href="${whatsappUrl}" target="_blank" class="btn btn-sm btn-whatsapp">${prefIcon.whatsapp} WhatsApp</a>`;
    if (smsUrl) secondaryBtns += `<a href="${smsUrl}" class="btn btn-sm btn-secondary">${prefIcon.sms} SMS</a>`;
  } else if (hasPhone) {
    // Fallback: show WhatsApp if they have a phone
    primaryBtn = `<a href="${whatsappUrl}" target="_blank" class="btn btn-sm btn-whatsapp">${prefIcon.whatsapp} WhatsApp</a>`;
    if (smsUrl) secondaryBtns += `<a href="${smsUrl}" class="btn btn-sm btn-secondary">${prefIcon.sms} SMS</a>`;
  } else if (emailUrl) {
    primaryBtn = `<a href="${emailUrl}" class="btn btn-sm btn-primary">${prefIcon.email} Email</a>`;
  } else {
    primaryBtn = `<span class="btn btn-sm btn-secondary" style="cursor:default;">&#128222; No Contact</span>`;
  }

  var prefLabel = `<span style="font-size:0.65rem;color:var(--gray-400);display:block;margin-top:0.2rem;">Prefers ${prefLabels[pref] || 'WhatsApp'}</span>`;

  return {
    desktop: `<div style="display:flex;gap:0.4rem;align-items:center;">${primaryBtn}${secondaryBtns}</div>${prefLabel}`,
    mobile: `<div style="display:flex;flex-direction:column;gap:0.4rem;align-items:stretch;">${primaryBtn}${secondaryBtns}${prefLabel}</div>`
  };
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  return Math.floor(seconds / 86400) + 'd ago';
}

// Sidebar active state
function golferSidebarNav(el) {
  document.querySelectorAll('.sidebar-nav a').forEach(function(a) { a.classList.remove('active'); });
  el.classList.add('active');
}

// Initialize on page load (skip on profile page — it has its own init)
if (typeof IS_PROFILE_PAGE === 'undefined') {
  document.addEventListener('DOMContentLoaded', initGolferDashboard);
}
