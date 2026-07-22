(() => {
  'use strict';

  const VERSION = '40.1';
  const MODULE = 'f401';
  let client = null;
  let portal = null;
  let poll = null;
  let activeView = null;
  let authSubscription = null;
  let realtimeChannel = null;
  let authUser = null;

  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function removeOldCancellationNotice() {
    document.body?.classList.remove('shutdown-mode', 'announcement-mode');
    document.querySelectorAll('.shutdown-overlay, .tournament-announcement-overlay').forEach(node => node.remove());
  }

  function toast(message, type = '') {
    document.querySelector('.f401-toast')?.remove();
    const node = document.createElement('div');
    node.className = `f401-toast ${type}`;
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 4200);
  }

  function errorText(error) {
    const raw = error?.message || String(error || 'Bilinmeyen hata');
    const map = [
      ['Invalid login credentials', 'E-posta veya şifre hatalı.'],
      ['Email not confirmed', 'E-posta adresi henüz doğrulanmamış.'],
      ['User already registered', 'Bu e-posta adresiyle daha önce hesap oluşturulmuş.'],
      ['Password should be at least 6 characters', 'Şifre en az 6 karakter olmalıdır.']
    ];
    return map.find(([needle]) => raw.includes(needle))?.[1] || raw;
  }

  function cloudClient() {
    return window.FIFA_CLOUD?.getClient?.() || null;
  }

  function currentUser() {
    return authUser || window.FIFA_CLOUD?.getUser?.() || null;
  }

  async function waitForClient() {
    for (let i = 0; i < 100; i += 1) {
      client = cloudClient();
      if (client) return client;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw new Error('Supabase bağlantısı hazır değil. cloud-config.js ayarlarını kontrol edin.');
  }

  function ensureModal() {
    if (document.getElementById(`${MODULE}-overlay`)) return;
    const overlay = document.createElement('div');
    overlay.id = `${MODULE}-overlay`;
    overlay.className = 'f401-overlay f401-hidden';
    overlay.innerHTML = `
      <section class="f401-modal" role="dialog" aria-modal="true" aria-label="FIFA oyuncu üyeliği ve oylama">
        <button class="f401-close" type="button" aria-label="Kapat">×</button>
        <div class="f401-content" id="${MODULE}-content"></div>
      </section>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target.closest('.f401-close')) closeModal();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeModal();
    });
  }

  function openModal(view) {
    ensureModal();
    activeView = view;
    document.getElementById(`${MODULE}-overlay`)?.classList.remove('f401-hidden');
    document.body.style.overflow = 'hidden';
    if (view === 'account') loadAccount();
    if (view === 'poll') loadPoll();
  }

  function closeModal() {
    document.getElementById(`${MODULE}-overlay`)?.classList.add('f401-hidden');
    document.body.style.overflow = '';
    activeView = null;
  }

  function loading() {
    ensureModal();
    document.getElementById(`${MODULE}-content`).innerHTML = '<div class="f401-spinner"></div>';
  }

  function addButtons() {
    if (!document.querySelector('[data-f401-account]')) {
      const top = document.querySelector('.topbar-actions');
      if (top) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-ghost f401-top-button';
        btn.dataset.f401Account = 'true';
        btn.textContent = 'Oyuncu Girişi';
        btn.addEventListener('click', () => openModal('account'));
        top.prepend(btn);
      }
    }

    if (!document.querySelector('[data-f401-poll]')) {
      const nav = document.querySelector('.main-nav') || document.querySelector('nav');
      if (nav) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nav-item';
        btn.dataset.f401Poll = 'true';
        btn.innerHTML = '<span class="nav-icon">◆</span><span>FIFA09 Devam Oylaması</span><span class="f401-nav-live">OYLA</span>';
        const divider = nav.querySelector('.nav-divider');
        if (divider) nav.insertBefore(btn, divider);
        else nav.appendChild(btn);
        btn.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          openModal('poll');
        });
      }
    }
    updateButtonLabels();
  }

  function updateButtonLabels() {
    const button = document.querySelector('[data-f401-account]');
    if (!button) return;
    const name = portal?.profile?.playerName;
    button.textContent = name ? `Oyuncu · ${name}` : (currentUser() ? 'Oyuncu Hesabını Tamamla' : 'Oyuncu Girişi');
  }

  async function fetchPortal() {
    await waitForClient();
    const [{ data, error }, userResult] = await Promise.all([
      client.rpc('get_fifa09_player_portal'),
      client.auth.getUser()
    ]);
    if (error) throw error;
    authUser = userResult?.data?.user || null;
    portal = data || { authenticated: false, profile: null, roster: [], isAdmin: false };
    updateButtonLabels();
    return portal;
  }

  async function fetchPoll() {
    await waitForClient();
    const { data, error } = await client.rpc('get_fifa09_format_poll');
    if (error) throw error;
    poll = data;
    return poll;
  }

  function accountHeader() {
    return `
      <div class="f401-kicker">FIFA TURNUVA MERKEZİ · OYUNCU ÜYELİĞİ</div>
      <h2 class="f401-title">Oyuncu Girişi</h2>
      <p class="f401-lead">Bu giriş yalnızca turnuvada kayıtlı oyuncular içindir. Misafirler ve normal izleyiciler siteyi hesap oluşturmadan kullanmaya devam eder.</p>`;
  }

  function availableRosterOptions() {
    const rows = Array.isArray(portal?.roster) ? portal.roster : [];
    const options = rows.map(row => {
      const unavailable = row.claimed && !row.claimedByMe;
      return `<option value="${esc(row.name)}" ${unavailable ? 'disabled' : ''}>${esc(row.name)}${unavailable ? ' · bağlı hesap var' : ''}</option>`;
    }).join('');
    return `<option value="">Kayıtlı oyuncu ismini seç</option>${options}`;
  }

  function renderGuestAccount(tab = 'login') {
    const root = document.getElementById(`${MODULE}-content`);
    root.innerHTML = `
      ${accountHeader()}
      <div class="f401-tabs">
        <button class="f401-tab ${tab === 'login' ? 'active' : ''}" data-f401-tab="login">Giriş Yap</button>
        <button class="f401-tab ${tab === 'signup' ? 'active' : ''}" data-f401-tab="signup">Yeni Hesap</button>
      </div>
      ${tab === 'login' ? `
        <form class="f401-form" data-f401-form="login">
          <div class="f401-field"><label>E-posta</label><input class="f401-input" type="email" name="email" required autocomplete="email"></div>
          <div class="f401-field"><label>Şifre</label><input class="f401-input" type="password" name="password" required minlength="6" autocomplete="current-password"></div>
          <div class="f401-actions"><button class="f401-btn f401-btn-gold" type="submit">Oyuncu Girişi Yap</button></div>
        </form>` : `
        <form class="f401-form" data-f401-form="signup">
          <div class="f401-field"><label>E-posta</label><input class="f401-input" type="email" name="email" required autocomplete="email"></div>
          <div class="f401-field"><label>Şifre</label><input class="f401-input" type="password" name="password" required minlength="6" autocomplete="new-password"></div>
          <div class="f401-field"><label>Kayıtlı oyuncu ismi — zorunlu</label><select class="f401-select" name="playerName" required>${availableRosterOptions()}</select></div>
          <div class="f401-note">Oyuncu ismi yalnızca FIFA09 kayıtlı katılımcı listesinden seçilebilir. Bir isim yalnızca tek üyelik hesabına bağlanabilir.</div>
          <div class="f401-actions"><button class="f401-btn f401-btn-gold" type="submit">Hesap Oluştur</button></div>
        </form>`}
      <div class="f401-grid">
        <div class="f401-card"><h3>Misafir erişimi açık</h3><p>Fikstür, puan durumu, canlı maçlar ve arşiv hesap gerektirmez.</p></div>
        <div class="f401-card"><h3>Oyuncu hesabı ne sağlar?</h3><p>FIFA09 devam oylaması ve daha sonra eklenecek oyuncuya özel işlemler.</p></div>
      </div>`;

    root.querySelectorAll('[data-f401-tab]').forEach(btn => btn.addEventListener('click', () => renderGuestAccount(btn.dataset.f401Tab)));
    root.querySelector('[data-f401-form="login"]')?.addEventListener('submit', signIn);
    root.querySelector('[data-f401-form="signup"]')?.addEventListener('submit', signUp);
  }

  function renderProfileClaim() {
    const user = currentUser();
    const root = document.getElementById(`${MODULE}-content`);
    root.innerHTML = `
      ${accountHeader()}
      <div class="f401-status">E-posta girişi tamamlandı</div>
      <div class="f401-account-box">
        <div class="f401-kicker">BAĞLI E-POSTA</div>
        <div class="f401-account-email">${esc(user?.email || '—')}</div>
      </div>
      <form class="f401-form" data-f401-form="claim">
        <div class="f401-field"><label>Kayıtlı oyuncu ismini seç — zorunlu</label><select class="f401-select" name="playerName" required>${availableRosterOptions()}</select></div>
        <div class="f401-note">Oyuncu hesabının etkinleşmesi ve oy kullanabilmen için kayıtlı oyuncu ismini seçmen gerekir.</div>
        <div class="f401-actions">
          <button class="f401-btn f401-btn-gold" type="submit">Oyuncu Hesabını Etkinleştir</button>
          <button class="f401-btn" type="button" data-f401-logout>Çıkış Yap</button>
        </div>
      </form>`;
    root.querySelector('[data-f401-form="claim"]')?.addEventListener('submit', claimProfile);
    root.querySelector('[data-f401-logout]')?.addEventListener('click', signOut);
  }

  function renderLinkedAccount() {
    const user = currentUser();
    const root = document.getElementById(`${MODULE}-content`);
    root.innerHTML = `
      ${accountHeader()}
      <div class="f401-status">Oyuncu hesabı aktif</div>
      <div class="f401-account-box">
        <div class="f401-kicker">KAYITLI OYUNCU</div>
        <div class="f401-account-name">${esc(portal.profile.playerName)}</div>
        <div class="f401-account-email">${esc(user?.email || '')}</div>
      </div>
      <div class="f401-actions">
        <button class="f401-btn f401-btn-gold" type="button" data-f401-open-poll>FIFA09 Oylamasına Git</button>
        ${portal.isAdmin ? '<button class="f401-btn" type="button" data-f401-sync-roster>Oyuncu Listesini Yenile</button>' : ''}
        <button class="f401-btn f401-btn-danger" type="button" data-f401-logout>Çıkış Yap</button>
      </div>`;
    root.querySelector('[data-f401-open-poll]')?.addEventListener('click', () => openModal('poll'));
    root.querySelector('[data-f401-logout]')?.addEventListener('click', signOut);
    root.querySelector('[data-f401-sync-roster]')?.addEventListener('click', syncRoster);
  }

  async function loadAccount() {
    loading();
    try {
      await fetchPortal();
      if (!portal.authenticated) renderGuestAccount('login');
      else if (!portal.profile) renderProfileClaim();
      else renderLinkedAccount();
    } catch (error) {
      document.getElementById(`${MODULE}-content`).innerHTML = `${accountHeader()}<div class="f401-note">${esc(errorText(error))}</div>`;
    }
  }

  async function signIn(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');
    try {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      authUser = data?.user || data?.session?.user || null;
      toast('Oyuncu girişi başarılı.', 'success');
      await loadAccount();
    } catch (error) {
      toast(errorText(error), 'error');
    }
  }

  async function signUp(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');
    const playerName = String(form.get('playerName') || '').trim();
    if (!playerName) return toast('Kayıtlı oyuncu ismi seçilmelidir.', 'error');
    try {
      localStorage.setItem('f401_pending_player_name', playerName);
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) throw error;
      authUser = data?.user || data?.session?.user || null;
      if (data?.session) {
        await claimName(playerName);
        localStorage.removeItem('f401_pending_player_name');
        toast('Oyuncu hesabı oluşturuldu.', 'success');
        await loadAccount();
      } else {
        toast('Hesap oluşturuldu. E-posta doğrulamasından sonra giriş yapın; oyuncu seçiminiz korunacaktır.', 'success');
        renderGuestAccount('login');
      }
    } catch (error) {
      toast(errorText(error), 'error');
    }
  }

  async function claimName(playerName) {
    const { data, error } = await client.rpc('claim_fifa09_player_name', { p_player_name: playerName });
    if (error) throw error;
    portal = data;
    updateButtonLabels();
  }

  async function claimProfile(event) {
    event.preventDefault();
    const playerName = String(new FormData(event.currentTarget).get('playerName') || '').trim();
    if (!playerName) return toast('Kayıtlı oyuncu ismi seçilmelidir.', 'error');
    try {
      await claimName(playerName);
      localStorage.removeItem('f401_pending_player_name');
      toast('Oyuncu hesabı etkinleştirildi.', 'success');
      renderLinkedAccount();
    } catch (error) {
      toast(errorText(error), 'error');
    }
  }

  async function signOut() {
    try {
      await client.auth.signOut();
      authUser = null;
      portal = null;
      poll = null;
      toast('Oyuncu hesabından çıkış yapıldı.', 'success');
      await loadAccount();
    } catch (error) {
      toast(errorText(error), 'error');
    }
  }

  async function syncRoster() {
    try {
      const { error } = await client.rpc('sync_fifa09_registered_players');
      if (error) throw error;
      await fetchPortal();
      toast('Kayıtlı FIFA09 oyuncu listesi güncellendi.', 'success');
      renderLinkedAccount();
    } catch (error) {
      toast(errorText(error), 'error');
    }
  }

  function pollStatusLabel(status) {
    return ({ draft: 'Taslak', open: 'Oylama Açık', closed: 'Oylama Kapandı', cancelled: 'Oylama İptal Edildi' })[status] || status;
  }

  function renderPoll() {
    const root = document.getElementById(`${MODULE}-content`);
    const canVote = Boolean(poll?.canVote);
    root.innerHTML = `
      <div class="f401-kicker">FIFA 09 · ÜYE OYLAMASI</div>
      <h2 class="f401-title">${esc(poll.title)}</h2>
      <p class="f401-lead">Oylamaya yalnızca e-posta hesabıyla giriş yapmış ve FIFA09 kayıtlı oyuncu ismini seçmiş katılımcılar katılabilir. Misafir erişimi etkilenmez.</p>
      <div class="f401-status">${esc(pollStatusLabel(poll.status))}</div>

      <section class="f401-poll-question"><h3>${esc(poll.question)}</h3></section>
      <div class="f401-metrics">
        <div class="f401-metric"><span>Kayıtlı oyuncu</span><strong>${Number(poll.eligibleCount || 0)}</strong></div>
        <div class="f401-metric"><span>Katılım</span><strong>${Number(poll.totalVotes || 0)}</strong></div>
        <div class="f401-metric"><span>Senin oyun</span><strong>${esc(({yes:'Evet',no:'Hayır',abstain:'Çekimser'})[poll.ownVote] || '—')}</strong></div>
      </div>

      <div class="f401-votes">
        <button class="f401-btn f401-vote yes ${poll.ownVote === 'yes' ? 'selected' : ''}" data-f401-vote="yes" ${canVote ? '' : 'disabled'}>✓ EVET</button>
        <button class="f401-btn f401-vote no ${poll.ownVote === 'no' ? 'selected' : ''}" data-f401-vote="no" ${canVote ? '' : 'disabled'}>× HAYIR</button>
        <button class="f401-btn f401-vote abstain ${poll.ownVote === 'abstain' ? 'selected' : ''}" data-f401-vote="abstain" ${canVote ? '' : 'disabled'}>— ÇEKİMSER</button>
      </div>

      ${!poll.authenticated ? '<div class="f401-note">Oy kullanmak için oyuncu girişi yapmalısın. Siteyi izleyici olarak kullanmaya devam edebilirsin.</div>' : ''}
      ${poll.authenticated && !poll.profileName ? '<div class="f401-note">E-posta girişi tamamlandı ancak kayıtlı oyuncu ismi seçilmedi.</div>' : ''}
      ${poll.resultsRevealed ? `
        <div class="f401-result-grid">
          <div class="f401-result"><span>EVET</span><strong>${Number(poll.yesVotes || 0)}</strong></div>
          <div class="f401-result"><span>HAYIR</span><strong>${Number(poll.noVotes || 0)}</strong></div>
          <div class="f401-result"><span>ÇEKİMSER</span><strong>${Number(poll.abstainVotes || 0)}</strong></div>
        </div>` : '<div class="f401-locked">Oy dağılımı oylama kapatılana kadar gizlidir.</div>'}

      <div class="f401-actions">
        ${!poll.authenticated ? '<button class="f401-btn f401-btn-gold" data-f401-account-open>Oyuncu Girişi</button>' : ''}
        ${poll.authenticated && !poll.profileName ? '<button class="f401-btn f401-btn-gold" data-f401-account-open>Oyuncu İsmini Seç</button>' : ''}
      </div>

      ${poll.isAdmin ? `
        <div class="f401-admin">
          <div class="f401-kicker">YÖNETİCİ KONTROLLERİ</div>
          <div class="f401-actions">
            <button class="f401-btn f401-btn-green" data-f401-manage="open">Oylamayı Aç</button>
            <button class="f401-btn f401-btn-gold" data-f401-manage="close">Oylamayı Kapat</button>
            <button class="f401-btn" data-f401-manage="reset">Oyları Sıfırla</button>
            <button class="f401-btn f401-btn-danger" data-f401-manage="cancel">Oylamayı İptal Et</button>
          </div>
        </div>` : ''}`;

    root.querySelectorAll('[data-f401-vote]').forEach(btn => btn.addEventListener('click', () => castVote(btn.dataset.f401Vote)));
    root.querySelectorAll('[data-f401-account-open]').forEach(btn => btn.addEventListener('click', () => openModal('account')));
    root.querySelectorAll('[data-f401-manage]').forEach(btn => btn.addEventListener('click', () => managePoll(btn.dataset.f401Manage)));
  }

  async function loadPoll() {
    loading();
    try {
      await Promise.all([fetchPortal(), fetchPoll()]);
      renderPoll();
    } catch (error) {
      document.getElementById(`${MODULE}-content`).innerHTML = `
        <div class="f401-kicker">FIFA 09 · ÜYE OYLAMASI</div>
        <h2 class="f401-title">Oylama yüklenemedi</h2>
        <div class="f401-note">${esc(errorText(error))}</div>`;
    }
  }

  async function castVote(value) {
    try {
      const { data, error } = await client.rpc('cast_fifa09_format_vote', { p_vote: value });
      if (error) throw error;
      poll = data;
      toast('Oyun kaydedildi.', 'success');
      renderPoll();
    } catch (error) {
      toast(errorText(error), 'error');
    }
  }

  async function managePoll(action) {
    if (action === 'reset' && !window.confirm('Bütün oylar silinip oylama yeniden açılsın mı?')) return;
    if (action === 'cancel' && !window.confirm('Oylama iptal edilsin mi?')) return;
    try {
      const { data, error } = await client.rpc('manage_fifa09_format_poll', { p_action: action });
      if (error) throw error;
      poll = data;
      toast('Oylama durumu güncellendi.', 'success');
      renderPoll();
    } catch (error) {
      toast(errorText(error), 'error');
    }
  }

  async function handleAuthChange() {
    try {
      await fetchPortal();
      const pendingName = localStorage.getItem('f401_pending_player_name');
      if (currentUser() && !portal.profile && pendingName) {
        try {
          await claimName(pendingName);
          localStorage.removeItem('f401_pending_player_name');
          toast('Oyuncu hesabı etkinleştirildi.', 'success');
        } catch (error) {
          console.warn('Pending player claim failed:', error);
        }
      }
      if (activeView === 'account') loadAccount();
      if (activeView === 'poll') loadPoll();
    } catch (error) {
      console.warn('V40.1 auth refresh failed:', error);
    }
  }

  function subscribeRealtime() {
    if (!client || realtimeChannel) return;
    realtimeChannel = client
      .channel('fifa09-format-poll-v40-1')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fifa09_format_polls' }, () => activeView === 'poll' && loadPoll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fifa09_format_votes' }, () => activeView === 'poll' && loadPoll())
      .subscribe();
  }

  async function init() {
    removeOldCancellationNotice();
    ensureModal();
    addButtons();

    // Remove an old overlay if an older script tries to insert it again.
    const observer = new MutationObserver(removeOldCancellationNotice);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 15000);

    try {
      await waitForClient();
      await fetchPortal();
      addButtons();
      subscribeRealtime();
      if (!authSubscription) {
        authSubscription = client.auth.onAuthStateChange(() => setTimeout(handleAuthChange, 0));
      }
    } catch (error) {
      console.warn(`FIFA V${VERSION} player portal could not initialise:`, error);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
