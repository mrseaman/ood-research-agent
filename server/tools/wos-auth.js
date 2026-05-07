'use strict';

const { httpRequest, httpRequestRaw } = require('./http-client');

/**
 * Authenticate with Web of Science via access.webofknowledge.com
 * and obtain a session ID (SID) for API access.
 *
 * Required env vars:
 *   RA_WOS_USERNAME — WoS login username
 *   RA_WOS_PASSWORD — WoS login password
 *
 * Flow:
 *   1. POST /mpl-auth-app/j_spring_security_check → 302 with Location header
 *   2. GET the Location URL → HTML meta refresh containing SID
 *   3. Extract SID from the meta refresh URL
 */

const AUTH_BASE = 'https://access.webofknowledge.com';

let cachedSID = process.env.RA_WOS_SID || '';
let sidExpiry = cachedSID ? Date.now() + 3600000 : 0;

/**
 * Login to WoS and return a fresh SID.
 */
async function loginAndGetSID(username, password) {
  const postData = new URLSearchParams({
    j_username: username,
    j_password: password,
    j_auth_type: 'UNP',
    userType: 'user',
  }).toString();

  // Step 1: POST login — returns 302 redirect
  const loginRes = await httpRequestRaw(
    `${AUTH_BASE}/mpl-auth-app/j_spring_security_check`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: postData,
      timeout: 15000,
    },
  );

  if (loginRes.statusCode !== 302 || !loginRes.headers.location) {
    throw new Error(`WoS login failed: unexpected status ${loginRes.statusCode}`);
  }

  const location = loginRes.headers.location;
  if (location.includes('loginFailed')) {
    throw new Error('WoS login failed: invalid credentials');
  }

  // Step 2: GET the redirect URL to get the HTML with meta refresh containing SID
  const redirectUrl = new URL(location, AUTH_BASE).href;
  const html = await httpRequest(redirectUrl, { timeout: 15000 });

  // Step 3: Extract SID from meta refresh URL
  // Pattern: SID=USW2EC0FCDUxvjv7yMscrikZzRYTb
  const sidMatch = html.match(/SID=([A-Za-z0-9]+)/);
  if (!sidMatch) {
    throw new Error('WoS login succeeded but could not extract SID from response');
  }

  return sidMatch[1];
}

/**
 * Get a valid WoS SID. Uses cached value if not expired,
 * otherwise re-authenticates.
 */
async function getWosSID() {
  if (cachedSID && Date.now() < sidExpiry) {
    return cachedSID;
  }

  const username = process.env.RA_WOS_USERNAME;
  const password = process.env.RA_WOS_PASSWORD;

  if (!username || !password) {
    if (cachedSID) return cachedSID;
    throw new Error('WoS credentials not configured. Set RA_WOS_USERNAME and RA_WOS_PASSWORD, or RA_WOS_SID.');
  }

  try {
    cachedSID = await loginAndGetSID(username, password);
    sidExpiry = Date.now() + 3600000; // Cache for 1 hour
    return cachedSID;
  } catch (err) {
    if (cachedSID) return cachedSID;
    throw err;
  }
}

/**
 * Invalidate the cached SID (e.g., after a "sessionNotFound" error).
 */
function invalidateSID() {
  sidExpiry = 0;
}

module.exports = { getWosSID, invalidateSID };
