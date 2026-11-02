import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
export function localDB(filename=':memory:'){
  const db=new DatabaseSync(filename);db.exec('PRAGMA journal_mode=WAL');
  db.exec('CREATE TABLE IF NOT EXISTS __local_migrations (name TEXT PRIMARY KEY)');
  for(const name of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort()){
    if(!db.prepare('SELECT name FROM __local_migrations WHERE name=?').get(name)){db.exec(fs.readFileSync('drizzle/'+name,'utf8'));db.prepare('INSERT INTO __local_migrations VALUES (?)').run(name);}
  }
  const prepare=(sql,args=[])=>({bind(...values){return prepare(sql,values)},async first(column){const result=db.prepare(sql).get(...args)||null;return column?result?.[column]??null:result},async all(){return {results:db.prepare(sql).all(...args)}},async run(){const result=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(result.changes)}}}});
  return {prepare,close:()=>db.close(),raw:db};
}
