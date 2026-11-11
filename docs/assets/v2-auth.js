const $ = id => document.getElementById(id);
const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();
let apiBase = null;
let accessToken = sessionStorage.getItem('baby_mtt_v2_session') || '';
const status = (id, message, error = false) => {
  $(id).textContent = message;
  $(id).classList.toggle('error', error);
  $(id).classList.toggle('ok', !error && !!message);
};
async function api(path, { method = 'GET', payload, token = accessToken } = {}) {
  if (!apiBase) throw new Error('Сервер авторизации пока не подключён.');
  const response = await fetch(apiBase + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {})
    },
    ...(payload ? { body: JSON.stringify(payload) } : {})
  });
  let body;
  try { body = await response.json(); }
  catch { throw new Error('Сервис вернул некорректный ответ.'); }
  if (!response.ok) {
    if (response.status === 401) sessionStorage.removeItem('baby_mtt_v2_session');
    throw new Error(body.error === 'wallet_already_linked'
      ? 'Этот адрес уже привязан к другому аккаунту.'
      : response.status === 401 ? 'Сессия истекла. Войдите повторно.'
      : body.error === 'wallet_proof_invalid' ? 'Подпись отклонена или истекло время.'
      : 'Не удалось выполнить запрос (' + response.status + ').');
  }
  return body;
}
function present(profile) {
  $('login-card').classList.add('hidden');
  $('profile-card').classList.remove('hidden');
  $('external-card').classList.remove('hidden');
  $('name').textContent = profile.firstName || profile.username || 'Мой профиль';
  $('telegram-id').textContent = profile.telegramId;
  $('wallet-address').textContent = profile.walletAddress;
  $('external-status').textContent = profile.linkedAddress
    ? 'Подтверждённый адрес: ' + profile.linkedAddress
    : 'Внешний EVM-кошелёк ещё не привязан.';
}
async function login() {
  try {
    if (!tg?.initData) throw new Error('Откройте Mini App внутри Telegram — вход из обычного браузера недоступен.');
    $('login').disabled = true;
    status('login-status', 'Проверяем Telegram…');
    const response = await api('/api/v2/auth/telegram', {
      method: 'POST', token: '', payload: { initData: tg.initData }
    });
    accessToken = response.accessToken;
    sessionStorage.setItem('baby_mtt_v2_session', accessToken);
    present(response.profile);
  } catch (error) {
    status('login-status', error.message, true);
  } finally {
    $('login').disabled = false;
  }
}
$('login').addEventListener('click', login);
$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('wallet-address').textContent);
    $('copy').textContent = 'Адрес скопирован';
  } catch { $('copy').textContent = 'Выделите адрес и скопируйте'; }
});
$('connect').addEventListener('click', async () => {
  $('connect').disabled = true;
  try {
    if (!window.ethereum?.request)
      throw new Error('EVM-провайдер не найден. Для Yaako нужна проверка DApp-браузера; ввод адреса без подписи не считается привязкой.');
    status('connect-status', 'Запрашиваем адрес…');
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (!accounts?.[0]) throw new Error('Кошелёк не предоставил адрес.');
    const address = accounts[0];
    const challenge = await api('/api/v2/wallet/challenge', {
      method: 'POST', payload: { address }
    });
    status('connect-status', 'Подтвердите подпись сообщения в кошельке. Это бесплатно.');
    const dataHex = '0x' + Array.from(new TextEncoder().encode(challenge.message))
      .map(byte => byte.toString(16).padStart(2, '0')).join('');
    const signature = await window.ethereum.request({
      method: 'personal_sign', params: [dataHex, address]
    });
    const result = await api('/api/v2/wallet/link', {
      method: 'POST', payload: { address, message: challenge.message, signature }
    });
    present(result.profile);
    status('connect-status', 'Адрес успешно подтверждён.');
  } catch (error) {
    status('connect-status', error.message || 'Ошибка кошелька', true);
  } finally { $('connect').disabled = false; }
});
try {
  const configResponse = await fetch('./v2-config.json', { cache: 'no-store' });
  const config = await configResponse.json();
  if (typeof config.apiBaseUrl === 'string' && /^https:\/\/[^/]+$/.test(config.apiBaseUrl))
    apiBase = config.apiBaseUrl;
  if (!apiBase) {
    $('login').disabled = true;
    status('login-status', 'Модуль подготовлен, но публичный HTTPS API ещё не подключён.', true);
  } else if (accessToken) {
    try { present((await api('/api/v2/me')).profile); }
    catch { accessToken = ''; sessionStorage.removeItem('baby_mtt_v2_session'); }
  }
  if (apiBase && !accessToken && tg?.initData) login();
} catch {
  $('login').disabled = true;
  status('login-status', 'Ошибка конфигурации авторизации.', true);
}