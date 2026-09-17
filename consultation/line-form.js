(() => {
  'use strict';
  const API = 'https://bonabona-school.kick1111k1.workers.dev/api/bonabona';
  const STORAGE = 'bonabona-consultation-v2';
  const $ = id => document.getElementById(id);
  const fields = ['name', 'email', 'phone', 'prefecture', 'concern', 'motivation'];
  const form = $('consultationForm');
  let config, identity, submitting = false, initialized = false;
  let application = readState();
  const notificationText = 'BONA BONA SCHOOLの個別相談に申し込みました。';
  const chatUrl = 'https://line.me/R/oaMessage/%40516jcmbq/?' + encodeURIComponent(notificationText);

  function readState() {
    try {
      const state = JSON.parse(sessionStorage.getItem(STORAGE));
      return state && Date.now() - state.createdAt < 23 * 3600000 ? state : null;
    } catch { return null; }
  }
  function remember(state) {
    application = state;
    try { sessionStorage.setItem(STORAGE, JSON.stringify(state)); } catch { /* The current page still prevents a second submission. */ }
  }
  function validate(element) {
    let valid = element.value.trim() !== '' && element.validity.valid;
    if (element.id === 'phone') {
      const phone = element.value.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 65248));
      valid = valid && /^[0-9+()\-\s]+$/.test(phone) && /^\d{10,15}$/.test(phone.replace(/\D/g, ''));
    }
    element.closest('.field').classList.toggle('invalid', !valid);
    element.setAttribute('aria-invalid', String(!valid));
    return valid;
  }
  fields.forEach(id => {
    $(id).addEventListener('blur', () => validate($(id)));
    $(id).addEventListener('input', () => { if ($(id).getAttribute('aria-invalid') === 'true') validate($(id)); });
  });
  async function jsonRequest(path, data) {
    const options = { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(50000) };
    if (data) Object.assign(options, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const response = await fetch(API + path, options);
    const result = await response.json();
    if (!response.ok) { const error = new Error(result.error || '接続を確認できませんでした。'); error.code = result.code; throw error; }
    return result;
  }
  function showUnconfirmed() {
    $('formFields').disabled = true;
    $('lineStatus').textContent = '受付状況を確認できませんでした。重複を避けるため再度申し込まず、公式LINEで受付状況をお問い合わせください。';
    $('lineLogin').hidden = true;
    $('lineRecheck').hidden = true;
    $('lineAdd').hidden = false;
    $('lineAdd').textContent = '公式LINEで受付状況を確認する';
    $('lineAdd').href = 'https://line.me/R/oaMessage/%40516jcmbq/?' + encodeURIComponent('個別相談フォームの受付状況を確認したいです。');
  }
  function showSuccess() {
    $('formArea').hidden = true;
    $('successBox').classList.add('show');
    $('receiptStatus').textContent = application.lineMessageSent
      ? '受付内容をLINEにお送りしました。内容を確認後、SHIORIより日程についてご連絡いたします。'
      : 'お申し込みは保存できています。LINEの受付通知がまだ届いていないため、下のボタンから通知を再送してください。申し込み直す必要はありません。';
    $('retryReceipt').hidden = application.lineMessageSent;
    $('chatHelp').textContent = '公式LINEから、ご希望の日程などをお送りいただけます。';
    $('openLine').href = chatUrl;
    $('openLine').textContent = '公式LINEで日程を相談する';
    $('successBox').focus();
  }
  async function connect() {
    $('lineRecheck').hidden = true;
    $('lineLogin').hidden = true;
    $('lineAdd').hidden = true;
    $('lineStatus').textContent = 'LINEとの接続を確認しています。';
    try {
      if (!config) config = await jsonRequest('/config');
      if (!config.ready || !window.liff) throw new Error('LINEとの接続を確認できませんでした。少し時間をおいて再確認してください。');
      if (!initialized) { await liff.init({ liffId: config.liffId }); initialized = true; }
      if (!liff.isLoggedIn()) {
        $('lineStatus').textContent = 'LINEでログインすると入力できます。受付と日程のご案内を公式LINEからお送りします。';
        $('lineLogin').hidden = false;
        return;
      }
      identity = await liff.getProfile();
      const friendship = await liff.getFriendship();
      if (!friendship.friendFlag) {
        $('lineStatus').textContent = '受付と日程のご案内を受け取るため、公式LINEを友だち追加してください。追加後、この画面に戻って接続を再確認してください。';
        $('lineAdd').hidden = false;
        $('lineRecheck').hidden = false;
        return;
      }
      // A recovery token belongs only to the LINE account that submitted the form.
      if (application && application.userId !== identity.userId) application = null;
      if (application?.saved) { showSuccess(); return; }
      if (application?.pending) {
        try {
          const recovered = await jsonRequest('/consultation', {action:'status',idToken:liff.getIDToken(),submissionId:application.submissionId});
          if (recovered.saved) {remember({...application,...recovered,pending:false});showSuccess();return;}
        } catch { /* A new application is never submitted during recovery. */ }
        showUnconfirmed(); return;
      }
      $('lineName').textContent = identity.displayName;
      $('lineStatus').textContent = identity.displayName + 'さんのLINEと接続しました。';
      $('formFields').disabled = false;
    } catch (error) {
      $('lineStatus').textContent = error.message || 'LINEとの接続を確認できませんでした。';
      $('lineRecheck').hidden = false;
    }
  }
  $('lineLogin').addEventListener('click', () => liff.login({ redirectUri: location.origin + location.pathname }));
  $('lineRecheck').addEventListener('click', connect);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting || !identity || application?.saved || application?.pending) return;
    $('formStatus').textContent = '';
    if (!fields.map(id => validate($(id))).every(Boolean) || $('website').value) {
      form.querySelector('[aria-invalid="true"]')?.focus();
      $('formStatus').textContent = '入力内容をご確認ください。';
      return;
    }
    const idToken = liff.getIDToken();
    if (!idToken) { $('formStatus').textContent = 'LINEとの接続が切れました。画面を開き直してください。'; return; }
    submitting = true;
    $('submitButton').disabled = true;
    $('submitLabel').textContent = '送信しています';
    const state = { userId: identity.userId, submissionId: crypto.randomUUID(), createdAt: Date.now(), pending: true };
    remember(state);
    try {
      const result = await jsonRequest('/consultation', { action: 'submit', idToken, submissionId: state.submissionId, ...Object.fromEntries(fields.map(id => [id, $(id).value.trim()])), website: $('website').value });
      if (result.saved !== true) throw new Error('受付状況を確認できませんでした。');
      remember({ ...state, pending: false, saved: true, lineMessageSent: result.lineMessageSent, receiptToken: result.receiptToken, chatSent: false });
      form.reset();
      showSuccess();
    } catch (error) {
      if (['INVALID_INPUT', 'LINE_LOGIN', 'LINE_FRIEND', 'LINE_UNAVAILABLE', 'NOT_READY'].includes(error.code)) {
        remember(null);
        $('formStatus').textContent = error.message;
        $('submitButton').disabled = false;
        $('submitLabel').textContent = 'この内容で申し込む';
        if (error.code.startsWith('LINE_')) { $('formFields').disabled = true; $('lineRecheck').hidden = false; }
      } else showUnconfirmed();
    } finally { submitting = false; }
  });
  $('retryReceipt').addEventListener('click', async () => {
    $('retryReceipt').disabled = true;
    try {
      const result = await jsonRequest('/consultation', { action: 'retry', idToken: liff.getIDToken(), receiptToken: application.receiptToken });
      remember({ ...application, lineMessageSent: result.lineMessageSent });
      showSuccess();
    } catch (error) { $('receiptStatus').textContent = error.message || '受付は完了しています。LINE通知を再送できなかったため、公式LINEへお問い合わせください。'; }
    finally { $('retryReceipt').disabled = false; }
  });
  connect();
})();
