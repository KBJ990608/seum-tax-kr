import fs from 'node:fs';
import {openai,hash} from '../worker/core.mjs';
const source=fs.readFileSync('.env.local','utf8');
const env={OPENAI_API_KEY:source.match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim(),OPENAI_ORGANIZATION:source.match(/^OPENAI_ORGANIZATION=(.+)$/m)?.[1]?.trim()};
const corpus=JSON.parse(fs.readFileSync('data/corpus.json','utf8'));
const manifestPath='data/indexed-sources.json';
let manifest=fs.existsSync(manifestPath)?JSON.parse(fs.readFileSync(manifestPath,'utf8')):{store_id:null,documents:[]};
const save=()=>fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
if(!manifest.store_id){manifest.store_id=(await openai(env,'/vector_stores',{name:'SEUM official Korean tax sources'})).id;save();}
for(const doc of corpus){
 const digest=await hash(doc.body),id=await hash(doc.url+'|'+digest);
 let item=manifest.documents.find(d=>d.id===id);
 if(!item){const form=new FormData();form.set('purpose','assistants');form.set('file',new File([JSON.stringify(doc)],id+'.txt',{type:'text/plain'}));const file=await openai(env,'/files',form,'POST',true);item={id,digest,file_id:file.id,status:'uploaded'};manifest.documents.push(item);save();}
 if(item.status==='uploaded'){await openai(env,'/vector_stores/'+manifest.store_id+'/files',{file_id:item.file_id,attributes:{document_id:id,kind:doc.kind,verified:true}});item.status='indexing';save();}
 for(let attempt=0;attempt<45&&item.status!=='active';attempt++){const indexed=await openai(env,'/vector_stores/'+manifest.store_id+'/files/'+item.file_id,undefined,'GET');if(indexed.status==='completed'){item.status='active';item.indexed_at=new Date().toISOString();save();break;}if(indexed.status==='failed')throw Error('Official source indexing failed');await new Promise(r=>setTimeout(r,2000));}
 if(item.status!=='active')throw Error('Indexing pending: rerun to resume');
 console.log(JSON.stringify({title:doc.title,status:item.status}));
}
console.log(JSON.stringify({store_id:manifest.store_id,active:manifest.documents.filter(d=>d.status==='active').length}));
