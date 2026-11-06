import fs from 'node:fs';
import path from 'node:path';
export function runtimeModules(){
 const root=path.resolve('dist/server');
 return [...['index.js','application.js','marco-runtime.js'].map(name=>({type:'ESModule',path:path.join(root,name)})),...fs.readdirSync(path.join(root,'runtime')).map(name=>({type:name.endsWith('.wasm')?'CompiledWasm':'Data',path:path.join(root,'runtime',name)}))];
}
