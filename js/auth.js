// ══════════════════════════════════════════════
// AUTH PAGE LOGIC
// After successful login, decrypted private key bytes
// are stored in sessionStorage so app.html can use them
// without the user re-entering their password.
// ══════════════════════════════════════════════

function setMsg(formId, txt, type) {
  const el = document.getElementById(formId + "-msg");
  if (!el) return;
  el.textContent = txt;
  el.className = "auth-msg" + (type ? " " + type : "");
}


async function doLogin() {
  const email = document.getElementById("login-email").value.trim();
  const pass  = document.getElementById("login-password").value;
  if (!email || !pass) return setMsg("login", "Please fill in all fields", "err");

  const btn = document.getElementById("login-btn");
  btn.disabled = true;
  setMsg("login", "Signing in… ✿", "");

  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });

  if (error || !data.user) {
    btn.disabled = false;
    return setMsg("login", "✗ " + (error?.message || "Login failed"), "err");
  }

  setMsg("login", "Loading your keys… ✿", "");

  try {
    const userId = data.user.id;
    const aesKey = await deriveAESKey(pass, userId);

    const { data: profile } = await sb
      .from("profiles")
      .select("encrypted_private_key, public_key, display_name")
      .eq("id", userId)
      .single();

    let privKeyB64, pubKeyB64;

    if (!profile || !profile.public_key || !profile.encrypted_private_key) {
      // Auto-repair: generate fresh keys
      setMsg("login", "Setting up your account… ✿", "");
      const keyPair  = await generateRSAKeyPair();
      pubKeyB64      = await exportPublicKey(keyPair.publicKey);
      const wrapped  = await wrapPrivateKey(aesKey, keyPair.privateKey);
      await sb.from("profiles").upsert({
        id: userId,
        public_key: pubKeyB64,
        encrypted_private_key: wrapped,
        display_name: profile?.display_name || email.split("@")[0],
      });
      // generateRSAKeyPair uses extractable:true so exportPrivateKey works here
      privKeyB64 = await exportPrivateKey(keyPair.privateKey);
    } else {
      // aesDecrypt returns the raw PKCS8 base64 string directly —
      // avoids importPrivateKey (extractable:false) → exportPrivateKey roundtrip
      privKeyB64 = await aesDecrypt(aesKey, profile.encrypted_private_key);
      pubKeyB64  = profile.public_key;
      if (!privKeyB64) {
        btn.disabled = false;
        return setMsg("login", "✗ Wrong password or corrupted keys", "err");
      }
      // Validate the key is usable before trusting it
      try { await importPrivateKey(privKeyB64); } catch {
        btn.disabled = false;
        return setMsg("login", "✗ Wrong password or corrupted keys", "err");
      }
    }

    // Store decrypted key material in sessionStorage for app.html
    sessionStorage.setItem("diary_privkey",  privKeyB64);
    sessionStorage.setItem("diary_pubkey",   pubKeyB64);
    sessionStorage.setItem("diary_uid",      userId);
    sessionStorage.setItem("diary_email",    data.user.email);
    sessionStorage.setItem("diary_name",     profile?.display_name || data.user.user_metadata?.display_name || email.split("@")[0]);

    window.location.href = "app.html";
  } catch (e) {
    btn.disabled = false;
    setMsg("login", "✗ " + e.message, "err");
  }
}

async function doSignup() {
  const name  = document.getElementById("signup-name").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const pass  = document.getElementById("signup-password").value;

  if (!name)  return setMsg("signup", "Please enter your name ♡", "err");
  if (!email || !pass) return setMsg("signup", "Please fill in all fields", "err");
  if (pass.length < 8) return setMsg("signup", "Password must be at least 8 characters", "err");

  const btn = document.getElementById("signup-btn");
  btn.disabled = true;
  setMsg("signup", "Creating your account… ✿", "");

  const { data, error } = await sb.auth.signUp({
    email,
    password: pass,
    options: { data: { display_name: name } },
  });

  if (error) {
    btn.disabled = false;
    if (error.message?.includes("security purposes") || error.message?.includes("seconds")) {
      return setMsg("signup", "⏳ Please wait a moment and try again ♡", "err");
    }
    return setMsg("signup", "✗ " + error.message, "err");
  }

  // Empty identities = email already registered (Supabase returns a fake success to prevent enumeration)
  if (data.user?.identities?.length === 0) {
    btn.disabled = false;
    return setMsg("signup", "✗ Account already exists — sign in instead ♡", "err");
  }

  // Needs email confirmation
  if (!data.session) {
    setMsg("signup", "📨 Check your email to confirm your account!", "ok");
    btn.disabled = false;
    return;
  }

  // Session exists (email confirmation disabled) — set up keys immediately
  const userId = data.user.id;
  setMsg("signup", "Generating your encryption keys… 🔐", "");

  try {
    await sb.from("profiles").upsert({ id: userId, display_name: name });

    const aesKey  = await deriveAESKey(pass, userId);
    const keyPair = await generateRSAKeyPair();
    const pubKey  = await exportPublicKey(keyPair.publicKey);
    const wrapped = await wrapPrivateKey(aesKey, keyPair.privateKey);

    await sb.from("profiles").update({ public_key: pubKey, encrypted_private_key: wrapped }).eq("id", userId);

    // Store keys and redirect
    const privKeyB64 = await exportPrivateKey(keyPair.privateKey);
    sessionStorage.setItem("diary_privkey", privKeyB64);
    sessionStorage.setItem("diary_pubkey",  pubKey);
    sessionStorage.setItem("diary_uid",     userId);
    sessionStorage.setItem("diary_email",   email);
    sessionStorage.setItem("diary_name",    name);

    window.location.href = "app.html";
  } catch (e) {
    btn.disabled = false;
    setMsg("signup", "✗ Key setup failed: " + e.message, "err");
  }
}

