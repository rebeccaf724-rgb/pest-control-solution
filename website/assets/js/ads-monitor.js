/* Privacy-aware, ad-attributed landing-session telemetry. No Google click IDs are transmitted. */
(()=>{
 const API='https://REPLACE-WORKER.YOUR-SUBDOMAIN.workers.dev';
 if(API.includes('REPLACE-WORKER'))return;
 const p=new URLSearchParams(location.search);
 const kind=['gclid','gbraid','wbraid'].find(k=>p.has(k));
 if(!kind)return;
 const key='pest_ads_session';
 try{
  const prev=JSON.parse(sessionStorage.getItem(key)||'null');
  if(prev&&Date.now()-prev.time<30*60*1000)return;
  const bytes=new Uint8Array(20);crypto.getRandomValues(bytes);
  const session=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
  sessionStorage.setItem(key,JSON.stringify({time:Date.now(),session}));
  fetch(API+'/api/track',{method:'POST',mode:'cors',credentials:'omit',headers:{'content-type':'application/json'},body:JSON.stringify({kind,session,path:location.pathname,campaign:p.get('utm_campaign')||''}),keepalive:true}).catch(()=>{});
 }catch(e){}
})();
