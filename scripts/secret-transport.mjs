// One-time encrypted transport; plaintext never goes to stdout or command arguments.
import fs from 'node:fs';
import {createCipheriv,randomBytes} from 'node:crypto';
import readline from 'node:readline';
if(!process.stdin.isTTY)throw Error('Hidden terminal required');
process.stdin.setRawMode(true);process.stdin.resume();let input='';
console.log('Ready for one-time transport key (input hidden).');
process.stdin.on('data',chunk=>{for(const ch of chunk.toString()){if(ch==='\r'||ch==='\n'){if(!input)continue;try{const transport=Buffer.from(JSON.parse(input).transport,'hex');input='';if(transport.length!==32)throw Error();const env=fs.readFileSync('.env.local','utf8');const key=env.match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim();if(!key?.startsWith('sk-'))throw Error();const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',transport,iv);const ciphertext=Buffer.concat([cipher.update(key,'utf8'),cipher.final(),cipher.getAuthTag()]);console.log(JSON.stringify({iv:iv.toString('hex'),ciphertext:ciphertext.toString('hex')}));process.exit(0);}catch{console.log('Encrypted transport failed');process.exit(1);}}else if(ch==='\u0003'){process.exit(1);}else input+=ch;}});
