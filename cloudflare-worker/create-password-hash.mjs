// Node 20+: node create-password-hash.mjs
import {pbkdf2Sync,randomBytes} from 'node:crypto';
import {createInterface} from 'node:readline';
const rl=createInterface({input:process.stdin,output:process.stdout});
rl.question('Choose a strong admin password (input visible): ',p=>{rl.close();if(p.length<14){console.error('Use at least 14 characters');process.exitCode=1;return}const b=x=>Buffer.from(x).toString('base64url');const salt=randomBytes(16);console.log('\nADMIN_PASSWORD_HASH = '+b(salt)+':'+b(pbkdf2Sync(p,salt,210000,32,'sha256'))+'\nStore this as a Cloudflare secret.');});
