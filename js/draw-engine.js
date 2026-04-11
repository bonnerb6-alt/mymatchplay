// ============================================
// MyMatchPlayPal - Draw Engine
// Proper seeded bracket with bye logic
// ============================================

// Standard seeding positions for a bracket
// Ensures seed 1 and 2 can only meet in final
function getSeededPositions(bracketSize) {
  // Start with [1, 2] and recursively build
  var positions = [1, 2];
  while (positions.length < bracketSize) {
    var next = [];
    var sum = positions.length * 2 + 1; // e.g. for 4: sum=5, for 8: sum=9
    for (var i = 0; i < positions.length; i++) {
      next.push(positions[i]);
      next.push(sum - positions[i]);
    }
    positions = next;
  }
  return positions;
}

// Generate a complete draw
// players: array of { id, handicap, first_name, last_name }
// bracketSize: auto-calculated power of 2
// byeMode: 'handicap' or 'random'
async function generateTournamentDraw(tournamentId, players, originalBracketSize, byeMode) {
  // 1. Auto-size bracket to next power of 2
  var bracketSize = 2;
  while (bracketSize < players.length) bracketSize *= 2;

  console.log('[MMP] Draw: ' + players.length + ' players, bracket=' + bracketSize + ', byes=' + (bracketSize - players.length) + ', mode=' + byeMode);

  // 2. Sort/seed players
  var seededPlayers;
  if (byeMode === 'handicap') {
    // Sort by handicap ascending (lowest handicap = seed 1)
    seededPlayers = players.slice().sort(function(a, b) { return (a.handicap || 99) - (b.handicap || 99); });
  } else {
    // Random shuffle (Fisher-Yates)
    seededPlayers = players.slice();
    for (var i = seededPlayers.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = seededPlayers[i];
      seededPlayers[i] = seededPlayers[j];
      seededPlayers[j] = tmp;
    }
  }

  // Assign seed numbers
  for (var i = 0; i < seededPlayers.length; i++) {
    seededPlayers[i].seed = i + 1;
  }

  // 3. Get standard seeding positions
  var seedPositions = getSeededPositions(bracketSize);
  // seedPositions[0] = seed that goes to match position 1 slot 1
  // seedPositions[1] = seed that goes to match position 1 slot 2
  // etc.

  // 4. Map seeds to bracket slots
  // bracketSize slots, seedPositions tells us which seed goes where
  // Slot i gets seed seedPositions[i]
  // If that seed number > players.length, it's a BYE
  var slots = [];
  for (var i = 0; i < bracketSize; i++) {
    var seedNum = seedPositions[i];
    if (seedNum <= seededPlayers.length) {
      slots.push(seededPlayers[seedNum - 1]); // actual player
    } else {
      slots.push(null); // BYE
    }
  }

  // 5. Create matches structure
  var totalRounds = Math.log2(bracketSize);
  var allMatches = [];

  // Create match shells for all rounds (Final first for FK linking)
  for (var round = totalRounds; round >= 1; round--) {
    var matchesInRound = bracketSize / Math.pow(2, round);
    for (var pos = 1; pos <= matchesInRound; pos++) {
      allMatches.push({
        tournament_id: tournamentId,
        round: round,
        position: pos,
        player1_id: null,
        player2_id: null,
        winner_id: null,
        status: 'pending',
        _key: round + '-' + pos
      });
    }
  }

  // Link matches: round R, pos P → round R+1, pos ceil(P/2)
  for (var i = 0; i < allMatches.length; i++) {
    var m = allMatches[i];
    if (m.round < totalRounds) {
      var nextPos = Math.ceil(m.position / 2);
      var nextKey = (m.round + 1) + '-' + nextPos;
      m._nextKey = nextKey;
    }
  }

  // Sort: highest round first for insertion order (FK references)
  allMatches.sort(function(a, b) { return b.round - a.round || a.position - b.position; });

  // 6. Delete old matches
  var { error: delErr } = await supabase.from('matches').delete().eq('tournament_id', tournamentId);
  if (delErr) console.warn('[MMP] Delete old matches:', delErr.message);

  // 7. Insert all match shells
  var keyToId = {};
  for (var i = 0; i < allMatches.length; i++) {
    var m = allMatches[i];
    var insertData = {
      tournament_id: m.tournament_id,
      round: m.round,
      position: m.position,
      player1_id: null,
      player2_id: null,
      winner_id: null,
      status: 'pending',
      next_match_id: m._nextKey ? (keyToId[m._nextKey] || null) : null
    };

    var { data: inserted, error } = await supabase
      .from('matches').insert(insertData).select('id').single();

    if (error) {
      console.error('[MMP] Match insert error:', error, insertData);
      return { error: error };
    }
    keyToId[m._key] = inserted.id;
  }

  // 8. Assign players to Round 1 using seeded slots
  var round1 = allMatches.filter(function(m) { return m.round === 1; })
    .sort(function(a, b) { return a.position - b.position; });

  for (var i = 0; i < round1.length; i++) {
    var match = round1[i];
    var matchId = keyToId[match._key];
    var slotIdx = i * 2;
    var p1 = slots[slotIdx];     // could be player or null (BYE)
    var p2 = slots[slotIdx + 1]; // could be player or null (BYE)

    var updateData = {};

    if (p1 && p2) {
      // Real match — two players
      updateData = { player1_id: p1.id, player2_id: p2.id, status: 'in_progress' };
    } else if (p1 && !p2) {
      // BYE — p1 advances
      updateData = { player1_id: p1.id, winner_id: p1.id, status: 'bye' };
    } else if (!p1 && p2) {
      // BYE — p2 advances
      updateData = { player2_id: p2.id, winner_id: p2.id, status: 'bye' };
    } else {
      // Both null — empty match (shouldn't happen with proper sizing)
      updateData = { status: 'bye' };
      continue;
    }

    await supabase.from('matches').update(updateData).eq('id', matchId);

    // If BYE, advance winner to next round
    var winnerId = updateData.winner_id;
    if (winnerId && match._nextKey) {
      var nextMatchId = keyToId[match._nextKey];
      var isOddPosition = match.position % 2 === 1;
      var field = isOddPosition ? 'player1_id' : 'player2_id';
      await supabase.from('matches').update({ [field]: winnerId }).eq('id', nextMatchId);
    }
  }

  // 9. Update seeds in tournament_entries
  for (var i = 0; i < seededPlayers.length; i++) {
    await supabase.from('tournament_entries')
      .update({ seed: seededPlayers[i].seed })
      .eq('tournament_id', tournamentId)
      .eq('member_id', seededPlayers[i].id);
  }

  // 10. Update tournament
  await supabase.from('tournaments')
    .update({ bracket_size: bracketSize, status: 'in_progress', current_round: 1 })
    .eq('id', tournamentId);

  // 11. Verify the draw was created correctly
  var { data: verifyMatches } = await supabase.from('matches')
    .select('id, round, position, player1_id, player2_id, winner_id, status, next_match_id')
    .eq('tournament_id', tournamentId)
    .order('round').order('position');

  console.log('[MMP] Draw verification:');
  (verifyMatches || []).forEach(function(m) {
    console.log('  R' + m.round + ' P' + m.position + ': ' +
      (m.player1_id ? m.player1_id.substring(0, 8) : 'null') + ' vs ' +
      (m.player2_id ? m.player2_id.substring(0, 8) : 'null') +
      ' | status=' + m.status +
      ' | winner=' + (m.winner_id ? m.winner_id.substring(0, 8) : 'null') +
      ' | next=' + (m.next_match_id ? m.next_match_id.substring(0, 8) : 'NULL'));
  });

  var nullNextCount = (verifyMatches || []).filter(function(m) { return m.round < totalRounds && !m.next_match_id; }).length;
  if (nullNextCount > 0) {
    console.error('[MMP] WARNING: ' + nullNextCount + ' matches have null next_match_id!');
  }

  console.log('[MMP] Draw complete: ' + seededPlayers.length + ' players, ' + (bracketSize - seededPlayers.length) + ' byes, bracket size ' + bracketSize);

  return {
    success: true,
    players: seededPlayers.length,
    bracketSize: bracketSize,
    byes: bracketSize - seededPlayers.length
  };
}
