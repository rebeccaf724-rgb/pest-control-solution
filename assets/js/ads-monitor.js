
(()=>{
  const API = 'https://fragrant-union-7515.rebeccaf724.workers.dev';
  const p = new URLSearchParams(location.search);
  const kind = ['gclid','gbraid','wbraid'].find(k => p.has(k));
  if (!kind) return;

  const key = 'pest_ads_session';

  try {
    const prev = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (prev && Date.now() - prev.time < 1800000) return;

    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    const session = Array.from(bytes, b =>
      b.toString(16).padStart(2,'0')
    ).join('');

    fetch(API + '/api/track', {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: {'content-type':'application/json'},
      body: JSON.stringify({
        kind,
        session,
        path: location.pathname,
        campaign: p.get('utm_campaign') || ''
      }),
      keepalive: true
    }).then(r => {
      if (!r.ok) console.error('Tracking HTTP error:', r.status);
      else sessionStorage.setItem(key, JSON.stringify({
        time: Date.now(), session
      }));
    }).catch(e => console.error('Tracking failed:', e));
  } catch(e) {
    console.error('Tracking error:', e);
  }
})();
