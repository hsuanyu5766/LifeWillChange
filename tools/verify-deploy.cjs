// Safe static package audit. Does not connect to GitHub or Supabase.
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname,'..');
const content=fs.readFileSync(path.join(root,'src/content.js'),'utf8');
const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const config=fs.readFileSync(path.join(root,'config.js'),'utf8');
let fatal=0,warnings=0;
const pass=s=>console.log('PASS',s), fail=s=>{console.error('FAIL',s);fatal++}, warn=s=>{console.warn('WARN',s);warnings++};
for(const file of ['src/content.js','src/core.js','src/adapter-supabase.js','src/adapter-local.js','src/photo-flow.js','src/app.js','styles.css','config.js','index.html']){
  if(fs.existsSync(path.join(root,file)))pass(file);else fail('Missing '+file);
}
for(const tag of html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)){
  const src=tag[1].split('?')[0];if(/^https?:\/\//.test(src))continue;
  if(fs.existsSync(path.join(root,src)))pass('script: '+src);else fail('Missing script: '+src);
}
for(const x of [...content.matchAll(/(?:image|thumb):'([^']+)'/g),...css.matchAll(/(?:url\(['"]?)(assets\/[^)'"?]+)/g),...app.matchAll(/(?:src|href)="(assets\/[^"?]+)/g)]){
  const f=x[1];if(!fs.existsSync(path.join(root,f)))fail('Missing referenced asset '+f);
}
for(const f of ['assets/visual-097/cinematic-film-bg.webp','assets/visual-097/ch03-scene-01.webp','assets/visual-097/ch03-scene-02.webp','assets/visual-097/ch03-scene-03.webp','assets/visual-097/expectation-attire.webp','assets/visual-097/expectation-private-life.webp','assets/visual-097/expectation-public.webp','assets/photos/photo-1-v090.webp','assets/photos/photo-2-v090.webp']){
  if(!fs.existsSync(path.join(root,f)))fail('Missing critical media: '+f);
}
if(/sb_secret_|service_role\s*[:=]\s*['"][^'"]+|SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S+/i.test(config))fail('SECRET/SERVICE_ROLE key appears in browser config');
else pass('No obvious secret/service_role key in browser config');
const url=(config.match(/supabaseUrl\s*:\s*['"]([^'"]*)/)||[])[1]||'';
const key=(config.match(/supabasePublishableKey\s*:\s*['"]([^'"]*)/)||[])[1]||'';
if(url&&key)pass('Supabase public config provided');else if(process.argv.includes('--production'))fail('Production requires Supabase URL and publishable/anon key in config.js');else warn('Blank config.js: site will use local demo mode, not realtime Supabase');
if(!html.includes('098-media'))fail('HTML cache-busting version must be 098-media');
if(!app.includes("rpc('lecture_host_create_safe")){// Actual RPC is in adapter, not app.
  const adapter=fs.readFileSync(path.join(root,'src/adapter-supabase.js'),'utf8');
  if(!adapter.includes("rpc('lecture_host_create_safe"))fail('Missing non-destructive session endpoint');
}
if(!fs.existsSync(path.join(root,'.nojekyll')))warn('Missing .nojekyll, GitHub Pages may process site through Jekyll');
console.log(`DEPLOY CHECK: ${fatal} failure(s), ${warnings} warning(s)`);
if(fatal)process.exitCode=1;
