(() => {
  'use strict';

  const POLL_ID = 'fifa09-final-chapter';
  const MODULE_ID = 'fifa-v40-final-chapter';
  let poll = null;
  let channel = null;
  let loading = false;

  const escapeHTML = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function cloud() {
    return window.FIFA_CLOUD || null;
  }

  function client() {
    return cloud()?.getClient?.() || null;
  }

  function user() {
    return cloud()?.getUser?.() || null;
  }

  function isAdmin() {
    return Boolean(cloud()?.isAdmin?.());
  }

  function notify(message, type = 'info') {
    const existing = document.querySelector('.v40-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = `v40-toast v40-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }

  function ensureModal() {
    if (document.getElementById(`${MODULE_ID}-overlay`)) return;
    const overlay = document.createElement('div');
    overlay.id = `${MODULE_ID}-overlay`;
    overlay.className = 'v40-overlay hidden';
    overlay.innerHTML = `
      <section class="v40-modal" role="dialog" aria-modal="true" aria-labelledby="v40Title">
        <button class="v40-close" type="button" aria-label="Kapat">×</button>
        <div id="${MODULE_ID}-content"></div>
      </section>`;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('.v40-close')) closeModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeModal();
    });
  }

  function addNavigationButton() {
    if (document.querySelector('[data-v40-final-chapter]')) return;
    const nav = document.querySelector('.main-nav') || document.querySelector('nav');
    if (!nav) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav-item v40-nav-item';
    button.dataset.v40FinalChapter = 'true';
    button.innerHTML = '<span class="nav-icon">◆</span><span>Final Chapter Oylaması</span><span class="v40-nav-live">CANLI</span>';

    const divider = nav.querySelector('.nav-divider');
    if (divider) nav.insertBefore(button, divider);
    else nav.appendChild(button);

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openModal();
    }, true);
  }

  function statusLabel(status) {
    return ({ draft: 'Taslak', open: 'Oylama Açık', closed: 'Oylama Kapandı', cancelled: 'İptal Edildi' })[status] || status;
  }

  function voteLabel(value) {
    return ({ yes: 'EVET', no: 'HAYIR', abstain: 'ÇEKİMSER' })[value] || 'OY KULLANILMADI';
  }

  function formatDate(value) {
    if (!value) return '—';
    try { return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
    catch { return value; }
  }

  function progressPercent() {
    if (!poll?.eligibleCount) return 0;
    return Math.min(100, Math.round((poll.totalVotes / poll.eligibleCount) * 100));
  }

  function renderLoading() {
    ensureModal();
    const root = document.getElementById(`${MODULE_ID}-content`);
    root.innerHTML = `
      <div class="v40-loading">
        <div class="v40-spinner"></div>
        <div>Final Chapter oylaması yükleniyor…</div>
      </div>`;
  }

  function renderError(message) {
    ensureModal();
    const root = document.getElementById(`${MODULE_ID}-content`);
    root.innerHTML = `
      <div class="v40-error-card">
        <div class="v40-kicker">FIFA 09 · FINAL CHAPTER</div>
        <h2 id="v40Title">Oylama açılamadı</h2>
        <p>${escapeHTML(message)}</p>
        <button class="v40-btn v40-btn-gold" type="button" data-v40-action="retry">Tekrar Dene</button>
      </div>`;
    root.querySelector('[data-v40-action="retry"]')?.addEventListener('click', loadPoll);
  }

  function renderResults() {
    if (!poll?.resultsRevealed) {
      return `
        <div class="v40-hidden-results">
          <div class="v40-lock">🔒</div>
          <strong>Sonuçlar oylama kapanana kadar gizlidir.</strong>
          <span>Katılım sayısı canlı olarak gösterilir; oy dağılımı kapatıldıktan sonra açılır.</span>
        </div>`;
    }

    const yes = Number(poll.yesVotes || 0);
    const no = Number(poll.noVotes || 0);
    const abstain = Number(poll.abstainVotes || 0);
    const total = Math.max(1, yes + no + abstain);
    return `
      <div class="v40-results-grid">
        <div class="v40-result yes"><span>EVET</span><strong>${yes}</strong><i style="--w:${Math.round((yes / total) * 100)}%"></i></div>
        <div class="v40-result no"><span>HAYIR</span><strong>${no}</strong><i style="--w:${Math.round((no / total) * 100)}%"></i></div>
        <div class="v40-result abstain"><span>ÇEKİMSER</span><strong>${abstain}</strong><i style="--w:${Math.round((abstain / total) * 100)}%"></i></div>
      </div>
      <div class="v40-decision ${yes >= Number(poll.requiredYes || 0) ? 'accepted' : 'pending'}">
        ${yes >= Number(poll.requiredYes || 0)
          ? 'Karar eşiği sağlandı.'
          : `Karar eşiği sağlanmadı. Gerekli EVET: ${Number(poll.requiredYes || 0)}`}
      </div>`;
  }

  function renderAdminControls() {
    if (!poll?.isAdmin && !isAdmin()) return '';
    const status = poll?.status;
    return `
      <div class="v40-admin-box">
        <div>
          <span class="v40-admin-label">YÖNETİCİ KONTROLÜ</span>
          <strong>Oylama durumunu yönet</strong>
        </div>
        <div class="v40-admin-actions">
          ${status !== 'open' ? '<button class="v40-btn v40-btn-outline" data-v40-admin="open" type="button">Yeniden Aç</button>' : ''}
          ${status === 'open' ? '<button class="v40-btn v40-btn-gold" data-v40-admin="closed" type="button">Oylamayı Kapat</button>' : ''}
          ${status !== 'cancelled' ? '<button class="v40-btn v40-btn-danger" data-v40-admin="cancelled" type="button">Oylamayı İptal Et</button>' : ''}
        </div>
      </div>`;
  }

  function renderPoll() {
    ensureModal();
    const root = document.getElementById(`${MODULE_ID}-content`);
    const currentUser = user();
    const voters = Array.isArray(poll?.voterNames) ? poll.voterNames : [];

    root.innerHTML = `
      <header class="v40-hero">
        <div>
          <div class="v40-kicker">FIFA 09 · FINAL CHAPTER</div>
          <h2 id="v40Title">${escapeHTML(poll.title)}</h2>
          <p>Turnuvanın kalan bölümünün devam formatı, aktif oyuncuların ortak kararıyla belirlenecektir.</p>
        </div>
        <div class="v40-status ${escapeHTML(poll.status)}"><span></span>${escapeHTML(statusLabel(poll.status))}</div>
      </header>

      <div class="v40-summary-grid">
        <article><span>Oy Kullanma Hakkı</span><strong>${Number(poll.eligibleCount || 0)}</strong><small>aktif oyuncu</small></article>
        <article><span>Karar Eşiği</span><strong>${Number(poll.requiredYes || 0)}</strong><small>EVET oyu</small></article>
        <article><span>Katılım</span><strong>${Number(poll.totalVotes || 0)}</strong><small>oy kullanıldı</small></article>
        <article><span>Senin Oyun</span><strong class="v40-own-vote">${escapeHTML(voteLabel(poll.ownVote))}</strong><small>${currentUser ? 'hesabınla bağlı' : 'giriş gerekli'}</small></article>
      </div>

      <section class="v40-progress-card">
        <div class="v40-progress-head"><span>Katılım ilerlemesi</span><strong>${progressPercent()}%</strong></div>
        <div class="v40-progress"><i style="width:${progressPercent()}%"></i></div>
        <div class="v40-progress-meta"><span>Açılış: ${escapeHTML(formatDate(poll.openedAt))}</span><span>Son güncelleme: ${escapeHTML(formatDate(poll.updatedAt))}</span></div>
      </section>

      <section class="v40-question-card">
        <div class="v40-question-mark">?</div>
        <div>
          <span class="v40-section-label">OYUNU KULLAN</span>
          <h3>FIFA 09 turnuvasının Final Chapter formatıyla devam etmesini onaylıyor musun?</h3>
          <p>Oyun yalnızca oylama açıkken değiştirilebilir. Oy dağılımı oylama kapatılana kadar gizli tutulur.</p>
        </div>
        <div class="v40-vote-actions">
          <button type="button" class="v40-vote yes ${poll.ownVote === 'yes' ? 'selected' : ''}" data-v40-vote="yes" ${poll.canVote ? '' : 'disabled'}><span>✓</span>EVET</button>
          <button type="button" class="v40-vote no ${poll.ownVote === 'no' ? 'selected' : ''}" data-v40-vote="no" ${poll.canVote ? '' : 'disabled'}><span>×</span>HAYIR</button>
          <button type="button" class="v40-vote abstain ${poll.ownVote === 'abstain' ? 'selected' : ''}" data-v40-vote="abstain" ${poll.canVote ? '' : 'disabled'}><span>—</span>ÇEKİMSER</button>
        </div>
        ${!currentUser ? '<div class="v40-inline-warning">Oy kullanmak için oyuncu hesabınla giriş yapmalısın.</div>' : ''}
        ${currentUser && !poll.canVote && poll.status === 'open' ? '<div class="v40-inline-warning">Hesabın aktif oyuncu profiline bağlı değil veya oyuncu üyeliğin aktif değil.</div>' : ''}
      </section>

      <section class="v40-results-card">
        <div class="v40-section-head"><div><span class="v40-section-label">OY DURUMU</span><h3>Final Chapter kararı</h3></div><span class="v40-count-chip">${Number(poll.totalVotes || 0)} / ${Number(poll.eligibleCount || 0)}</span></div>
        ${renderResults()}
      </section>

      <section class="v40-voters-card">
        <div class="v40-section-head"><div><span class="v40-section-label">KATILIM</span><h3>Oy kullanan oyuncular</h3></div></div>
        <div class="v40-voter-list">${voters.length
          ? voters.map((name) => `<span>${escapeHTML(name)}</span>`).join('')
          : '<em>Henüz oy kullanılmadı.</em>'}</div>
      </section>

      ${renderAdminControls()}
    `;

    root.querySelectorAll('[data-v40-vote]').forEach((button) => {
      button.addEventListener('click', () => submitVote(button.dataset.v40Vote));
    });
    root.querySelectorAll('[data-v40-admin]').forEach((button) => {
      button.addEventListener('click', () => updatePollStatus(button.dataset.v40Admin));
    });
  }

  async function loadPoll() {
    if (loading) return;
    loading = true;
    renderLoading();

    const supabase = client();
    if (!supabase) {
      loading = false;
      renderError('Supabase bağlantısı henüz hazır değil. V39 bulut bağlantısını ve kullanıcı oturumunu kontrol et.');
      return;
    }
    if (!user()) {
      loading = false;
      renderError('Oylama ekranını açmak için önce oyuncu veya yönetici hesabıyla giriş yap.');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('get_fifa09_final_chapter_poll_summary', { p_poll_id: POLL_ID });
      if (error) throw error;
      poll = data;
      renderPoll();
      subscribeRealtime();
    } catch (error) {
      console.error('[V40] Poll load failed', error);
      renderError(error?.message || 'Oylama bilgileri alınamadı. SQL dosyasının çalıştırıldığını doğrula.');
    } finally {
      loading = false;
    }
  }

  async function submitVote(vote) {
    const supabase = client();
    const currentUser = user();
    if (!supabase || !currentUser) return notify('Oyuncu hesabıyla giriş yapmalısın.', 'error');
    try {
      const { error } = await supabase.from('fifa09_final_chapter_votes').upsert({
        poll_id: POLL_ID,
        user_id: currentUser.id,
        vote,
        updated_at: new Date().toISOString()
      }, { onConflict: 'poll_id,user_id' });
      if (error) throw error;
      notify(`Oyun kaydedildi: ${voteLabel(vote)}`, 'success');
      await loadPoll();
    } catch (error) {
      console.error('[V40] Vote save failed', error);
      notify(error?.message || 'Oy kaydedilemedi.', 'error');
    }
  }

  async function updatePollStatus(status) {
    if (!isAdmin() && !poll?.isAdmin) return notify('Bu işlem yalnızca yöneticiye açıktır.', 'error');
    const supabase = client();
    if (!supabase) return;
    const now = new Date().toISOString();
    const payload = { status, updated_at: now };
    if (status === 'open') {
      payload.opened_at = now;
      payload.closed_at = null;
    } else {
      payload.closed_at = now;
    }
    try {
      const { error } = await supabase.from('fifa09_final_chapter_polls').update(payload).eq('id', POLL_ID);
      if (error) throw error;
      notify(`Oylama durumu: ${statusLabel(status)}`, 'success');
      await loadPoll();
    } catch (error) {
      console.error('[V40] Poll status update failed', error);
      notify(error?.message || 'Oylama durumu güncellenemedi.', 'error');
    }
  }

  function subscribeRealtime() {
    const supabase = client();
    if (!supabase || channel) return;
    channel = supabase.channel('fifa09-final-chapter-v40')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fifa09_final_chapter_polls', filter: `id=eq.${POLL_ID}` }, () => loadPoll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fifa09_final_chapter_votes', filter: `poll_id=eq.${POLL_ID}` }, () => loadPoll())
      .subscribe();
  }

  function openModal() {
    ensureModal();
    document.getElementById(`${MODULE_ID}-overlay`)?.classList.remove('hidden');
    document.body.classList.add('v40-modal-open');
    loadPoll();
  }

  function closeModal() {
    document.getElementById(`${MODULE_ID}-overlay`)?.classList.add('hidden');
    document.body.classList.remove('v40-modal-open');
  }

  function bootstrap() {
    ensureModal();
    addNavigationButton();
    const observer = new MutationObserver(() => addNavigationButton());
    observer.observe(document.body, { childList: true, subtree: true });
    window.FIFA_V40_FINAL_CHAPTER = { open: openModal, close: closeModal, refresh: loadPoll };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  else bootstrap();
})();
