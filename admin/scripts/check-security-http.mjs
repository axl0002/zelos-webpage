// Production-build HTTP checks only. No browser, cookies, user data or writes.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const directory=fileURLToPath(new URL('../',import.meta.url));
const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
const port=reservation.address().port;await new Promise(done=>reservation.close(done));
const base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{
 cwd:directory,env:{...process.env,ADMIN_ORIGIN:base},stdio:['ignore','pipe','pipe'],
});
let output='';server.stdout.on('data',chunk=>output+=chunk);server.stderr.on('data',chunk=>output+=chunk);
try{
 await new Promise((resolve,reject)=>{
  const deadline=setTimeout(()=>reject(Error('Local Next server did not start')),20000);
  const ready=()=>{if(output.includes('Ready in')){clearTimeout(deadline);resolve();}};
  server.stdout.on('data',ready);server.stderr.on('data',ready);
  server.once('exit',()=>{clearTimeout(deadline);reject(Error('Local Next server exited before readiness'));});ready();
 });
 const checks=[];
 for(const path of ['/','/about','/stats','/equipment','/support','/legal/privacy.html','/admin/login','/profile/11111111-1111-4111-8111-111111111111']){
  const response=await fetch(base+path,{redirect:'manual'});assert.equal(response.status,200,path);
  const html=await response.text(),policy=response.headers.get('content-security-policy')??'';
  assert.equal(response.headers.get('x-frame-options'),'DENY',path);
  assert.equal(response.headers.get('x-content-type-options'),'nosniff',path);
  assert.ok(policy.includes("frame-ancestors 'none'"),path);
  const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  const nonce=policy.match(/'nonce-([^']+)'/)?.[1];
  if(path==='/admin/login'||path.startsWith('/profile/')){
   assert.ok(nonce,`Missing nonce on ${path}`);assert.ok(scripts.length>0,path);
   for(const [,attrs]of scripts)assert.ok(attrs.includes(`nonce="${nonce}"`),`Unnonced Next script on ${path}`);
  }else{
   for(const [,attrs,body]of scripts)if(!attrs.includes('src=')&&body.trim()){
    assert.ok(policy.includes(`'sha256-${createHash('sha256').update(body).digest('base64')}'`),`Blocked static script on ${path}`);
   }
  }
  checks.push({path,status:response.status,script_policy:nonce?'nonce':'hash',scripts:scripts.length});
 }
 for(const path of ['/admin','/admin/ranked-uploads','/admin/ranking-flags','/admin/reports/legacy','/admin/scoring-lab','/admin/users']){
  for(const headers of [{},{rsc:'1','next-router-prefetch':'1'}]){
   const response=await fetch(base+path,{redirect:'manual',headers});assert.equal(response.status,307,path);
   assert.equal(new URL(response.headers.get('location'),base).pathname,'/admin/login');
   const html=await response.text();assert.ok(!html.includes('aria-label="Admin workspace"'),path);
   assert.equal(response.headers.get('cache-control'),'private, no-store');
  }
  checks.push({path,status:307,signed_out_html:false,rsc_checked:true});
 }
 console.log(JSON.stringify({checks,server_requests_with_credentials:0,backend_writes:0},null,2));
}finally{
 const stopped=once(server,'exit');server.kill('SIGTERM');await stopped;
}
