const enc = new TextEncoder();
const json = (x,status=200,headers={}) => new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const now=()=>Math.floor(Date.now()/1000);
const ipValid=s=>typeof s==='string'&&s.length<46&&(/^(?:\d{1,3}\.){3}\d{1,3}$/.test(s)||/^[a-fA-F0-9:]+$/.test(s));
const ipv4=s=>/^(?:\d{1,3}\.){3}\d{1,3}$/.test(s)&&s.split('.').every(v=>+v<=255);
const b64=a=>btoa(String.fromCharCode(...new Uint8Array(a))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
async function sign(data,secret){const k=await crypto.subtle.importKey('raw',enc.encode(secret),'HMAC',false,['sign']);return b64(await crypto.subtle.sign('HMAC',k,enc.encode(data)));}
async function passwordMatch(password,stored){const [salt,hash]=String(stored||'').split(':');if(!salt||!hash)return false;const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:unb64(salt),iterations:210000,hash:'SHA-256'},key,256);const actual=b64(bits);if(actual.length!==hash.length)return false;let diff=0;for(let i=0;i<hash.length;i++)diff|=actual.charCodeAt(i)^hash.charCodeAt(i);return diff===0;}
async function auth(req,env){const cookie=req.headers.get('cookie')||'';const token=cookie.match(/(?:^|;\s*)pest_session=([^;]+)/)?.[1];if(!token)return false;const [exp,sig]=token.split('.');if(!/^\d+$/.test(exp)||+exp<now()||!sig)return false;return (await sign(exp,env.SESSION_SECRET))===sig;}
function originHeaders(req,env){const o=req.headers.get('origin');return o&&o===env.ALLOWED_ORIGIN?{'access-control-allow-origin':o,'access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'content-type','access-control-allow-credentials':'true','vary':'Origin'}:{};}
function safePath(p){try{const u=new URL(p,'https://example.org');return u.pathname.slice(0,250);}catch{return '/';}}
async function googleExclude(env,ip,campaign){
 if(!ipv4(ip))return {state:'unsupported',details:'Only IPv4 enabled for safe automatic exclusions'};
 if(env.AUTO_EXCLUDE!=='true'||env.DRY_RUN!=='false')return {state:'dry_run',details:'Preview only: API mutation not sent'};
 const required=['GOOGLE_ADS_DEVELOPER_TOKEN','GOOGLE_ADS_CLIENT_ID','GOOGLE_ADS_CLIENT_SECRET','GOOGLE_ADS_REFRESH_TOKEN','GOOGLE_ADS_CUSTOMER_ID'];
 if(required.some(k=>!env[k]))return {state:'configuration_missing',details:'Missing Google Ads credentials'};
 const tokenRes=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GOOGLE_ADS_CLIENT_ID,client_secret:env.GOOGLE_ADS_CLIENT_SECRET,refresh_token:env.GOOGLE_ADS_REFRESH_TOKEN,grant_type:'refresh_token'})});
 if(!tokenRes.ok)return {state:'error',details:'OAuth refresh failed: '+tokenRes.status};
 const token=await tokenRes.json();
 const customer=env.GOOGLE_ADS_CUSTOMER_ID.replace(/\D/g,'');
 const resource=`customers/${customer}/campaignCriteria`;
 const payload={operations:[{create:{campaign:`customers/${customer}/campaigns/${campaign}`,ipBlock:{ipAddress:ip},negative:true}}],partialFailure:false};
 const h={'authorization':`Bearer ${token.access_token}`,'developer-token':env.GOOGLE_ADS_DEVELOPER_TOKEN,'content-type':'application/json'};
 if(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID)h['login-customer-id']=env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/\D/g,'');
 const version=env.GOOGLE_ADS_API_VERSION||'v22';
 const r=await fetch(`https://googleads.googleapis.com/${version}/${resource}:mutate`,{method:'POST',headers:h,body:JSON.stringify(payload)});
 const body=await r.text();return r.ok?{state:'submitted',details:body.slice(0,900)}:{state:'error',details:`Google Ads ${r.status}: ${body.slice(0,900)}`};
}
export default {async fetch(req,env){
 const u=new URL(req.url),path=u.pathname,h=originHeaders(req,env),clientIP=req.headers.get('cf-connecting-ip')||'';
 const reply=(obj,status=200,extra={})=>json(obj,status,{...h,...extra});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h});
 if(!env.DB||!env.SESSION_SECRET||!env.ADMIN_PASSWORD_HASH)return reply({error:'Worker configuration incomplete'},503);
 if(path==='/api/health')return reply({ok:true});
 if(path==='/api/track'&&req.method==='POST'){
  if(req.headers.get('origin')!==env.ALLOWED_ORIGIN)return reply({error:'Origin rejected'},403);
  if(!ipValid(clientIP))return reply({error:'IP unavailable'},400);
  let b;try{b=await req.json()}catch{return reply({error:'Invalid JSON'},400)}
  if(!b||!['gclid','gbraid','wbraid'].includes(b.kind)||typeof b.session!=='string'||!/^[a-zA-Z0-9_-]{16,90}$/.test(b.session))return reply({error:'Invalid tracking data'},400);
  const t=now(),country=String(req.cf?.country||'').slice(0,3),ua=(req.headers.get('user-agent')||'').slice(0,180),campaign=String(b.campaign||'').slice(0,80);
  await env.DB.prepare('INSERT OR IGNORE INTO visits(ip,occurred_at,landing_path,campaign_tag,click_id_kind,session_id,country,user_agent) VALUES(?,?,?,?,?,?,?,?)').bind(clientIP,t,safePath(b.path),campaign,b.kind,b.session,country,ua).run();
  const row=await env.DB.prepare('SELECT COUNT(*) AS n FROM visits WHERE ip=? AND occurred_at>=?').bind(clientIP,t-86400).first();
  if(row.n>=3)await env.DB.prepare("INSERT INTO reviews(ip,status,note,updated_at) VALUES(?,'flagged','',?) ON CONFLICT(ip) DO NOTHING").bind(clientIP,t).run();
  return reply({recorded:true});
 }
 if(path==='/api/login'&&req.method==='POST'){
  if(req.headers.get('origin')!==env.ALLOWED_ORIGIN)return reply({error:'Origin rejected'},403);
  const attempt=await env.DB.prepare('SELECT * FROM login_attempts WHERE ip=?').bind(clientIP).first();
  if(attempt&&attempt.attempts>=8&&now()-attempt.last_at<900)return reply({error:'Too many attempts. Try later.'},429);
  let b;try{b=await req.json()}catch{return reply({error:'Invalid JSON'},400)}
  if(typeof b.password!=='string'||b.password.length>200)return reply({error:'Invalid password'},400);
  if(!await passwordMatch(b.password,env.ADMIN_PASSWORD_HASH)){
   await env.DB.prepare('INSERT INTO login_attempts(ip,attempts,last_at) VALUES(?,1,?) ON CONFLICT(ip) DO UPDATE SET attempts=CASE WHEN ?-last_at>900 THEN 1 ELSE attempts+1 END,last_at=?').bind(clientIP,now(),now(),now()).run();
   return reply({error:'Incorrect password'},401);
  }
  await env.DB.prepare('DELETE FROM login_attempts WHERE ip=?').bind(clientIP).run();
  const exp=String(now()+8*3600),sig=await sign(exp,env.SESSION_SECRET);
  return reply({ok:true},200,{'set-cookie':`pest_session=${exp}.${sig}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=28800`});
 }
 if(path==='/api/logout'&&req.method==='POST')return reply({ok:true},200,{'set-cookie':'pest_session=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0'});
 if(!path.startsWith('/api/'))return reply({error:'Not found'},404);
 if(!await auth(req,env))return reply({error:'Unauthorized. Login required; allow third-party cookies for dashboard if needed.'},401);
 if(path==='/api/stats'&&req.method==='GET'){
  const since=now()-86400;
  const summary=await env.DB.prepare('SELECT COUNT(*) total, COUNT(DISTINCT ip) ips FROM visits WHERE occurred_at>=?').bind(since).first();
  const rows=await env.DB.prepare(`SELECT v.ip,COUNT(*) visits,MAX(v.occurred_at) last_seen,MIN(v.occurred_at) first_seen,MAX(v.country) country,MAX(v.landing_path) landing_path,COALESCE(r.status,CASE WHEN COUNT(*)>=3 THEN 'flagged' ELSE 'observing' END) status,COALESCE(r.note,'') note FROM visits v LEFT JOIN reviews r ON v.ip=r.ip WHERE v.occurred_at>=? GROUP BY v.ip ORDER BY visits DESC,last_seen DESC LIMIT 500`).bind(since).all();
  const flags=rows.results.filter(x=>x.visits>=3).length;
  const pending=await env.DB.prepare("SELECT COUNT(*) n FROM exclusions WHERE state IN ('submitted','dry_run','error','configuration_missing') AND created_at>=?").bind(since).first();
  return reply({summary:{visits:summary.total,ips:summary.ips,flagged:flags,exclusions:pending.n},rows:rows.results,settings:{threshold:3,dryRun:env.DRY_RUN!=='false',autoExclude:env.AUTO_EXCLUDE==='true'}});
 }
 if(path==='/api/export'&&req.method==='GET'){
  const rows=await env.DB.prepare('SELECT ip,occurred_at,landing_path,campaign_tag,click_id_kind,session_id,country FROM visits WHERE occurred_at>=? ORDER BY occurred_at DESC LIMIT 10000').bind(now()-30*86400).all();
  const keys=['ip','occurred_at','landing_path','campaign_tag','click_id_kind','session_id','country'];
  const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
  const csv=[keys.join(','),...rows.results.map(r=>keys.map(k=>cell(r[k])).join(','))].join('\r\n');
  return new Response(csv,{headers:{...h,'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="ads-visits.csv"','cache-control':'no-store'}});
 }
 if(path==='/api/review'&&req.method==='POST'){
  if(req.headers.get('origin')!==env.ALLOWED_ORIGIN)return reply({error:'Origin rejected'},403);
  const b=await req.json();if(!ipValid(b.ip)||!['flagged','dismissed','approved'].includes(b.status))return reply({error:'Invalid review'},400);
  const count=await env.DB.prepare('SELECT COUNT(*) n FROM visits WHERE ip=? AND occurred_at>=?').bind(b.ip,now()-86400).first();
  if(count.n<3&&b.status==='approved')return reply({error:'Below threshold'},400);
  await env.DB.prepare('INSERT INTO reviews(ip,status,note,updated_at) VALUES(?,?,?,?) ON CONFLICT(ip) DO UPDATE SET status=excluded.status,note=excluded.note,updated_at=excluded.updated_at').bind(b.ip,b.status,String(b.note||'').slice(0,300),now()).run();
  return reply({ok:true});
 }
 if(path==='/api/exclude'&&req.method==='POST'){
  if(req.headers.get('origin')!==env.ALLOWED_ORIGIN)return reply({error:'Origin rejected'},403);
  const b=await req.json(),ip=b.ip,campaign=String(b.campaign||'');
  if(!ipv4(ip)||!/^[0-9]{1,20}$/.test(campaign))return reply({error:'Valid IPv4 and numeric campaign ID required'},400);
  if(!String(env.GOOGLE_ADS_CAMPAIGN_IDS||'').split(',').map(x=>x.trim()).includes(campaign))return reply({error:'Campaign not on allowlist'},403);
  const review=await env.DB.prepare('SELECT status FROM reviews WHERE ip=?').bind(ip).first();
  if(review?.status!=='approved')return reply({error:'Approve this IP first'},403);
  const count=await env.DB.prepare('SELECT COUNT(*) n FROM visits WHERE ip=? AND occurred_at>=?').bind(ip,now()-86400).first();
  if(count.n<3)return reply({error:'Threshold no longer met'},400);
  const existing=await env.DB.prepare('SELECT state FROM exclusions WHERE ip=? AND campaign_id=?').bind(ip,campaign).first();
  if(existing?.state==='submitted')return reply({error:'Already submitted'},409);
  const daily=await env.DB.prepare("SELECT COUNT(*) n FROM exclusions WHERE state='submitted' AND created_at>=?").bind(now()-86400).first();
  if(daily.n>=Math.min(20,Math.max(1,Number(env.MAX_EXCLUSIONS_PER_DAY)||5)))return reply({error:'Daily cap reached'},429);
  let result;try{result=await googleExclude(env,ip,campaign)}catch(e){result={state:'error',details:String(e).slice(0,200)}}
  await env.DB.prepare('INSERT INTO exclusions(ip,campaign_id,state,details,created_at) VALUES(?,?,?,?,?) ON CONFLICT(ip,campaign_id) DO UPDATE SET state=excluded.state,details=excluded.details,created_at=excluded.created_at').bind(ip,campaign,result.state,result.details,now()).run();
  return reply(result,result.state==='error'?502:200);
 }
 return reply({error:'Not found'},404);
}};
