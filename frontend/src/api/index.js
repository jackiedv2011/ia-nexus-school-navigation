import { readStored, removeStored } from '../lib/storage';

const BASE = '/api';

function getToken() {
  return readStored('ia_token');
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
  removeStored('ia_token');
  removeStored('ia_email');
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

// Separate request path for the admin dashboard: it authenticates with a
// shared x-admin-key header, not the normal user JWT, and a 401 here means
// "wrong admin key" — not an expired user session — so it must NOT go through
// handleExpiredSession/req above.
async function adminReq(method, path, adminKey, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try { data = await res.json(); } catch { data = {}; }
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  signup:         (email, password, name, hpField)   => req('POST', '/auth/signup',  { email, password, name, hp_field: hpField }),
  login:          (email, password, hpField)         => req('POST', '/auth/login',   { email, password, hp_field: hpField }),
  me:             ()                        => req('GET',  '/auth/me'),
  verifyEmail:    (token)                   => req('GET',  `/auth/verify-email?token=${encodeURIComponent(token)}`),
  resendVerification: ()                    => req('POST', '/auth/resend-verification'),
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
  guestMessage:   (content, history)=> req('POST', '/guest/message', { content, history }),

  rateMessage:    (chatId, messageId, rating) => req('PUT', `/chats/${chatId}/messages/${messageId}/feedback`, { rating }),
  clearMessageRating: (chatId, messageId)     => req('DELETE', `/chats/${chatId}/messages/${messageId}/feedback`),

  submitFeedback: (rating, comment, hpField) => req('POST', '/feedback', { rating, comment, hp_field: hpField }),

  getTeachers:    ()               => req('GET',  '/teachers'),

  getSchedule:    ()               => req('GET',  '/schedule'),
  saveSchedule:   (schedule)       => req('PUT',  '/schedule', { schedule }),

  findRoute: ({ fromRoom, fromFloor, toRoom, toFloor }) =>
    req('POST', '/route', { fromRoom, fromFloor, toRoom, toFloor }),

  admin: {
    stats:     (key)                    => adminReq('GET', '/admin/stats', key),
    questions: (key, limit, offset = 0) => adminReq('GET', `/admin/questions?limit=${limit || 50}&offset=${offset}`, key),
    flagged:   (key, limit, offset = 0) => adminReq('GET', `/admin/flagged?limit=${limit || 50}&offset=${offset}`, key),
    feedback:  (key, limit, offset = 0) => adminReq('GET', `/admin/feedback?limit=${limit || 50}&offset=${offset}`, key),
    auditLog:  (key, limit, offset = 0) => adminReq('GET', `/admin/audit-log?limit=${limit || 50}&offset=${offset}`, key),
    securityEvents: (key, limit, offset = 0) => adminReq('GET', `/admin/security-events?limit=${limit || 50}&offset=${offset}`, key),
  },
};
