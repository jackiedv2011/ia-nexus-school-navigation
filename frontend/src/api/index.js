const BASE = '/api';

function getToken() {
  return localStorage.getItem('ia_token');
}

function headers(extra = {}) {
  const h = { 'Content-Type': 'application/json', ...extra };
  const t = getToken();
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}

function handleExpiredSession(path) {
  // Only react to an expired/invalid token on authenticated endpoints.
  // Auth endpoints (login/signup) return 401 for bad credentials — leave those
  // for the calling component to surface as an inline error.
  if (path.startsWith('/auth/')) return false;
  if (!getToken()) return false;
  localStorage.removeItem('ia_token');
  localStorage.removeItem('ia_email');
  window.location.assign('/login');
  return true;
}

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });

  // Only parse JSON when the server actually returned JSON. A proxy/gateway
  // error (502, etc.) often returns HTML or an empty body, and blindly calling
  // res.json() would throw an opaque "Unexpected token" error (M2).
  let data = {};
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try { data = await res.json(); } catch { data = {}; }
  }

  if (!res.ok) {
    if (res.status === 401 && handleExpiredSession(path)) {
      throw new Error('Your session has expired. Please sign in again.');
    }
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  signup:         (email, password, name)   => req('POST', '/auth/signup',          { email, password, name }),
  login:          (email, password)         => req('POST', '/auth/login',           { email, password }),
  me:             ()                        => req('GET',  '/auth/me'),
  updateName:     (name)                    => req('POST', '/auth/profile',         { name }),
  forgotPassword: (email)                   => req('POST', '/auth/forgot-password', { email }),
  verifyCode:     (email, code)             => req('POST', '/auth/verify-code',     { email, code }),
  resetPassword:  (resetToken, password)    => req('POST', '/auth/reset-password',  { resetToken, password }),
  changePassword: (currentPassword, newPassword) => req('POST', '/auth/change-password', { currentPassword, newPassword }),
  deleteAccount:  ()                        => req('DELETE', '/auth/account'),

  getChats:       ()               => req('GET',  '/chats'),
  createChat:     (title)          => req('POST', '/chats', { title }),
  renameChat:     (id, title)      => req('PATCH', `/chats/${id}`, { title }),
  deleteChat:     (id)             => req('DELETE', `/chats/${id}`),
  clearAllChats:  ()               => req('DELETE', '/chats'),

  getMessages:    (chatId)         => req('GET',  `/chats/${chatId}/messages`),
  sendMessage:    (chatId, content, mode)=> req('POST', `/chats/${chatId}/messages`, { content, mode }),

  getTeachers:    ()               => req('GET',  '/teachers'),

  getSchedule:    ()               => req('GET',  '/schedule'),
  saveSchedule:   (schedule)       => req('PUT',  '/schedule', { schedule }),

  findRoute: ({ fromRoom, fromFloor, toRoom, toFloor }) =>
    req('POST', '/route', { fromRoom, fromFloor, toRoom, toFloor }),
};
