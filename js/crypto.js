// ══════════════════════════════════════════════
// CRYPTO HELPERS
// All operations use the Web Crypto API (browser-native).
// Encryption stack:
//   Password → PBKDF2 (100k iterations) → AES-256-GCM key
//   AES key wraps RSA-2048 OAEP private key
//   RSA key encrypts a fresh per-entry AES key (hybrid encryption)
// ══════════════════════════════════════════════

// Derive AES-256-GCM key from password + userId salt
async function deriveAESKey(password, userId) {
  const enc = new TextEncoder();
  const rawKey = await crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]
  );
  const salt = enc.encode(userId.replace(/-/g, "").slice(0, 16));
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    rawKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Generate RSA-OAEP-2048 key pair
async function generateRSAKeyPair() {
  return crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["encrypt", "decrypt"]
  );
}

// Export public key → base64 SPKI
async function exportPublicKey(key) {
  const buf = await crypto.subtle.exportKey("spki", key);
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

// Export private key → base64 PKCS8
async function exportPrivateKey(key) {
  const buf = await crypto.subtle.exportKey("pkcs8", key);
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

// Import public key from base64 SPKI
async function importPublicKey(b64) {
  const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "spki", buf, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]
  );
}

// Import private key from base64 PKCS8
async function importPrivateKey(b64) {
  const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8", buf, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]
  );
}

// AES-GCM encrypt plaintext string → "aes:<base64(iv+ciphertext)>"
async function aesEncrypt(aesKey, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, aesKey, new TextEncoder().encode(plaintext)
  );
  const combined = new Uint8Array(iv.byteLength + buf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(buf), iv.byteLength);
  return "aes:" + btoa(String.fromCharCode(...combined));
}

// AES-GCM decrypt "aes:<base64>" → plaintext string (null on failure)
async function aesDecrypt(aesKey, b64) {
  if (!b64 || !b64.startsWith("aes:")) return b64;
  try {
    const bytes = Uint8Array.from(atob(b64.slice(4)), c => c.charCodeAt(0));
    const buf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, 12) }, aesKey, bytes.slice(12)
    );
    return new TextDecoder().decode(buf);
  } catch {
    return null;
  }
}

// RSA-OAEP hybrid encrypt: generates ephemeral AES key, encrypts content with it,
// wraps the AES key with RSA public key → "rsa:<base64(json)>"
async function rsaEncrypt(publicKey, plaintext) {
  const aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, aesKey, new TextEncoder().encode(plaintext)
  );
  const rawAES = await crypto.subtle.exportKey("raw", aesKey);
  const encryptedAESBuf = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, rawAES);

  const payload = {
    k:  btoa(String.fromCharCode(...new Uint8Array(encryptedAESBuf))),
    iv: btoa(String.fromCharCode(...iv)),
    c:  btoa(String.fromCharCode(...new Uint8Array(cipherBuf))),
  };
  return "rsa:" + btoa(JSON.stringify(payload));
}

// RSA-OAEP hybrid decrypt "rsa:<base64(json)>" → plaintext string
async function rsaDecrypt(privateKey, b64) {
  if (!b64) return "🔒 (no content)";
  if (!b64.startsWith("rsa:")) return b64;
  try {
    const payload = JSON.parse(atob(b64.slice(4)));
    const encryptedAESBytes = Uint8Array.from(atob(payload.k), c => c.charCodeAt(0));
    const rawAES = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, encryptedAESBytes);
    const aesKey = await crypto.subtle.importKey("raw", rawAES, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const iv = Uint8Array.from(atob(payload.iv), c => c.charCodeAt(0));
    const cipherBytes = Uint8Array.from(atob(payload.c), c => c.charCodeAt(0));
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, cipherBytes);
    return new TextDecoder().decode(plainBuf);
  } catch {
    return "🔒 (encrypted — cannot decrypt)";
  }
}

// Wrap RSA private key with AES (for storage)
async function wrapPrivateKey(aesKey, rsaPrivKey) {
  const exported = await exportPrivateKey(rsaPrivKey);
  return aesEncrypt(aesKey, exported);
}

// Unwrap RSA private key using AES key
async function unwrapPrivateKey(aesKey, wrapped) {
  const exported = await aesDecrypt(aesKey, wrapped);
  if (!exported) return null;
  return importPrivateKey(exported);
}
