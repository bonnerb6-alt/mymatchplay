// ============================================
// MyMatchPlayPal - Authentication
// ============================================

// Show/hide auth modal
function showAuthModal(mode) {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.classList.add('active');
  switchAuthMode(mode || 'signin');
}

function hideAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.remove('active');
}

function switchAuthMode(mode) {
  document.getElementById('authSignIn').style.display = mode === 'signin' ? 'block' : 'none';
  document.getElementById('authSignUp').style.display = mode === 'signup' ? 'block' : 'none';
}

// Handle sign in form
async function handleSignIn(e) {
  e.preventDefault();
  const email = document.getElementById('signInEmail').value;
  const password = document.getElementById('signInPassword').value;
  const errorEl = document.getElementById('signInError');
  const btn = e.target.querySelector('button[type="submit"]');

  errorEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Signing in...';

  try {
    await signIn(email, password);
    const member = await getCurrentMember();
    if (!member) {
      errorEl.textContent = 'No member profile found. Contact your club organiser.';
      btn.disabled = false;
      btn.textContent = 'Sign In';
      return;
    }
    hideAuthModal();
    if (member.role === 'organiser') {
      window.location.href = 'organiser.html';
    } else {
      window.location.href = 'golfer.html';
    }
  } catch (err) {
    errorEl.textContent = err.message || 'Invalid email or password.';
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

// Handle sign up form
async function handleSignUp(e) {
  e.preventDefault();
  const firstName = document.getElementById('signUpFirstName').value;
  const lastName = document.getElementById('signUpLastName').value;
  const email = document.getElementById('signUpEmail').value;
  const phone = document.getElementById('signUpPhone').value;
  const handicap = parseInt(document.getElementById('signUpHandicap').value) || 0;
  const password = document.getElementById('signUpPassword').value;
  const errorEl = document.getElementById('signUpError');
  const successEl = document.getElementById('signUpSuccess');
  const btn = e.target.querySelector('button[type="submit"]');

  errorEl.textContent = '';
  successEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Creating account...';

  try {
    const data = await signUp(email, password, { first_name: firstName, last_name: lastName });
    const user = data.user;

    if (!user) throw new Error('Sign up failed - no user returned.');

    // Create member record linked to the auth user
    // Default to Greenview Golf Club for demo
    const { error: memberError } = await supabase
      .from('members')
      .insert({
        auth_id: user.id,
        club_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        first_name: firstName,
        last_name: lastName,
        handicap: handicap,
        phone: phone,
        email: email,
        role: 'golfer'
      });

    if (memberError) throw memberError;

    // User is already authenticated after sign-up, redirect to dashboard
    hideAuthModal();
    window.location.href = 'golfer.html';
  } catch (err) {
    errorEl.textContent = err.message || 'Could not create account.';
    btn.disabled = false;
    btn.textContent = 'Sign Up';
  }
}

// Protect a page - redirect to index if not authenticated
async function requireAuth(requiredRole) {
  const member = await getCurrentMember();
  if (!member) {
    window.location.href = 'login.html';
    return null;
  }
  if (requiredRole) {
    // Check club_memberships for role
    var { data: memberships } = await supabase
      .from('club_memberships')
      .select('role')
      .eq('member_id', member.id);

    var hasRole = member.role === requiredRole
      || (memberships || []).some(function(m) { return m.role === requiredRole; });

    if (!hasRole) {
      var isOrganiser = member.role === 'organiser'
        || (memberships || []).some(function(m) { return m.role === 'organiser'; });
      window.location.href = isOrganiser ? 'organiser.html' : 'golfer.html';
      return null;
    }
  }
  return member;
}

// Generate the auth modal HTML (called on pages that need it)
function injectAuthModal() {
  if (document.getElementById('authModal')) return;

  const modalHTML = `
  <div class="modal-overlay" id="authModal">
    <div class="modal">
      <div class="modal-header">
        <h3>&#9971; MyMatchPlayPal</h3>
        <button class="modal-close" onclick="hideAuthModal()">&times;</button>
      </div>
      <div class="modal-body">
        <!-- Sign In Form -->
        <div id="authSignIn">
          <form onsubmit="handleSignIn(event)">
            <div class="form-group">
              <label class="form-label">Email</label>
              <input type="email" id="signInEmail" class="form-input" placeholder="your@email.com" required>
            </div>
            <div class="form-group">
              <label class="form-label">Password</label>
              <input type="password" id="signInPassword" class="form-input" placeholder="Your password" required>
            </div>
            <div id="signInError" style="color:var(--red);font-size:0.85rem;margin-bottom:0.75rem;"></div>
            <button type="submit" class="btn btn-primary" style="width:100%;">Sign In</button>
          </form>
          <p style="text-align:center;margin-top:1rem;font-size:0.85rem;color:var(--gray-500);">
            Don't have an account? <a href="#" onclick="switchAuthMode('signup');return false;" style="font-weight:600;">Sign Up</a>
          </p>
        </div>

        <!-- Sign Up Form -->
        <div id="authSignUp" style="display:none;">
          <form onsubmit="handleSignUp(event)">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;">
              <div class="form-group">
                <label class="form-label">First Name</label>
                <input type="text" id="signUpFirstName" class="form-input" placeholder="James" required>
              </div>
              <div class="form-group">
                <label class="form-label">Last Name</label>
                <input type="text" id="signUpLastName" class="form-input" placeholder="Murphy" required>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Email</label>
              <input type="email" id="signUpEmail" class="form-input" placeholder="your@email.com" required>
            </div>
            <div class="form-group">
              <label class="form-label">Phone</label>
              <input type="tel" id="signUpPhone" class="form-input" placeholder="087 123 4567">
            </div>
            <div class="form-group">
              <label class="form-label">Handicap</label>
              <input type="number" id="signUpHandicap" class="form-input" placeholder="12" min="0" max="54">
            </div>
            <div class="form-group">
              <label class="form-label">Password</label>
              <input type="password" id="signUpPassword" class="form-input" placeholder="Min 6 characters" required minlength="6">
            </div>
            <div id="signUpError" style="color:var(--red);font-size:0.85rem;margin-bottom:0.75rem;"></div>
            <div id="signUpSuccess" style="color:var(--green-700);font-size:0.85rem;margin-bottom:0.75rem;"></div>
            <button type="submit" class="btn btn-primary" style="width:100%;">Sign Up</button>
          </form>
          <p style="text-align:center;margin-top:1rem;font-size:0.85rem;color:var(--gray-500);">
            Already have an account? <a href="#" onclick="switchAuthMode('signin');return false;" style="font-weight:600;">Sign In</a>
          </p>
        </div>
      </div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
}
