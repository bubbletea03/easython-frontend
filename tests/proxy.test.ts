import test from 'node:test';
import assert from 'node:assert/strict';
import {createProxyHandler} from '../server/proxyCore.mjs';
const id='550e8400-e29b-41d4-a716-446655440000';
const env={BACKEND_API_URL:'https://backend.test',BACKEND_API_KEY:'server-only-test'};
test('proxy injects server credentials, forwards multipart bytes and retry headers',async()=>{
  const form=new FormData();form.append('image',new Blob(['image']),'image.jpg');
  const request=new Request('https://app.test/api/backend?endpoint=detect',{method:'POST',headers:{'X-Client-Id':id,'X-API-Key':'untrusted-browser-key'},body:form});
  const expected=new Uint8Array(await request.clone().arrayBuffer());
  const handler=createProxyHandler(env,async(url,init)=>{
    assert.equal(url,'https://backend.test/detect');assert.equal(init.headers['X-API-Key'],'server-only-test');
    assert.equal(init.headers['X-Client-Id'],id);assert.deepEqual(new Uint8Array(init.body),expected);
    assert.match(init.headers['Content-Type'],/multipart\/form-data; boundary=/);
    return new Response('{"error":{"code":"rate_limited"}}',{status:429,headers:{'Retry-After':'2','Content-Type':'application/json'}});
  });
  const response=await handler(request);assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'2');
  assert.equal((await response.text()).includes('server-only-test'),false);
});
test('proxy rejects unknown paths, missing config and invalid client IDs without upstream calls',async()=>{
  const handler=createProxyHandler({},()=>{throw new Error('must not call');});
  assert.equal((await handler(new Request('https://app.test/api/backend?endpoint=evil'))).status,404);
  assert.equal((await handler(new Request('https://app.test/api/backend?endpoint=health'))).status,503);
  assert.equal((await createProxyHandler(env)(new Request('https://app.test/api/backend?endpoint=health'))).status,400);
});
test('proxy forwards JSON and protects the upload size boundary',async()=>{
  const handler=createProxyHandler(env,async(_url,init)=>{
    assert.deepEqual(JSON.parse(new TextDecoder().decode(init.body)),{text:'컵 찾아줘'});
    return Response.json({intent:'find',targets:['cup'],object_ko:'컵'});
  });
  assert.equal((await handler(new Request('https://app.test/api/backend?endpoint=parse',{method:'POST',headers:{'X-Client-Id':id,'Content-Type':'application/json'},body:'{"text":"컵 찾아줘"}'}))).status,200);
  assert.equal((await handler(new Request('https://app.test/api/backend?endpoint=detect',{method:'POST',headers:{'X-Client-Id':id},body:new Uint8Array(2*1024*1024+1)}))).status,413);
});
