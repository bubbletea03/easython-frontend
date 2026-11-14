import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, ApiError, getClientId, retryAfterMs, readDescription } from '../src/apiCore.ts';

const health = { status: 'ok', model_loaded: true, describe_enabled: false, device: 'cpu' };
const response = (body: unknown, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const client = (fetcher: typeof fetch) => createApiClient({ baseUrl: '/api', apiKey: 'test-only', clientId: () => 'client-test', fetcher });

test('client UUID is persisted and reused', () => {
  const values = new Map(); let calls = 0;
  const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k,v) };
  const uuid = () => { calls++; return '550e8400-e29b-41d4-a716-446655440000'; };
  assert.equal(getClientId(storage, uuid), getClientId(storage, uuid)); assert.equal(calls, 1);
});
test('health loading on HTTP 200 stays loading; auth and client headers are sent', async () => {
  const api = client(async (url, init) => {
    assert.equal(url, '/api/health');
    assert.equal(new Headers(init?.headers).get('X-API-Key'), 'test-only');
    assert.equal(new Headers(init?.headers).get('X-Client-Id'), 'client-test');
    return response({ ...health, status: 'loading', model_loaded: false });
  });
  assert.equal((await api.health()).model_loaded, false);
});
test('detect sends exact multipart fields, preserves normalized boxes and accepts empty results', async () => {
  let calls = 0;
  const api = client(async (url, init) => {
    assert.equal(url, '/api/detect');
    assert.equal(new Headers(init?.headers).has('Content-Type'), false);
    const form = init?.body as FormData;
    assert.equal(form.get('targets'), 'cup,key'); assert.equal(form.get('conf'), '0.25'); assert.equal(form.get('imgsz'), '640');
    assert.ok(form.get('image') instanceof Blob);
    return response({ detections: calls++ ? [] : [{ label:'mug',target:'cup',score:.83,box:{x:.1,y:.2,w:.3,h:.4} }] });
  });
  assert.equal((await api.detect(new Blob(['image']), ['cup','key'])).detections[0].box.x, .1);
  assert.deepEqual((await api.detect(new Blob(['image']), ['cup','key'])).detections, []);
  await assert.rejects(api.detect(new Blob(), [' ']), (e: ApiError) => e.code === 'invalid_targets');
  assert.equal(calls, 2);
});
test('429 retries once after header delay; persistent 429 terminates', async () => {
  let calls = 0;
  const api = client(async () => { calls++; return response({error:{code:'rate_limited',message:'slow'}},429,{'Retry-After':'0'}); });
  await assert.rejects(api.health(), (e: ApiError) => e.status === 429); assert.equal(calls, 2);
  assert.equal(retryAfterMs(null), 2000); assert.equal(retryAfterMs('2'),2000);
  assert.equal(retryAfterMs('Thu, 01 Jan 1970 00:00:03 GMT',1000),2000);
});
test('401 and distinct 503 causes are preserved without retry', async () => {
  for (const [status, code] of [[401,'unauthorized'],[503,'model_loading'],[503,'queue_full'],[503,'describe_disabled'],[503,'parse_disabled']] as const) {
    let calls = 0;
    const api = client(async () => { calls++; return response({error:{code,message:'test',detail:{reason:'test'}}},status); });
    await assert.rejects(api.health(), (e: ApiError) => e.code === code && e.status === status);
    assert.equal(calls, 1);
  }
});
test('network failure is recoverable by callers; invalid success response is rejected', async () => {
  await assert.rejects(client(async () => { throw new TypeError('network'); }).health(), (e: ApiError) => e.code === 'network_error');
  await assert.rejects(client(async () => response({detections:[{box:{x:99}}]})).detect(new Blob(),['cup']), (e: ApiError) => e.code === 'invalid_response');
});
test('abort cancels Retry-After and does not issue a stale second request', async () => {
  let calls = 0; const controller = new AbortController();
  const api = client(async () => { calls++; return response({error:{code:'rate_limited'}},429,{'Retry-After':'30'}); });
  const pending = api.health(controller.signal); setTimeout(() => controller.abort(), 10);
  await assert.rejects(pending); assert.equal(calls,1);
});
test('parse sends text once; disabled describe capability is not a parse readiness check', async () => {
  const api = client(async (url, init) => {
    assert.equal(url,'/api/parse'); assert.equal(JSON.parse(init?.body as string).text,'컵 찾아줘');
    return response({intent:'find',object_ko:'컵',targets:['cup']});
  });
  assert.deepEqual((await api.parse('컵 찾아줘')).targets,['cup']);
});
test('describe reads nested result safely, prioritizes safety and never accepts arbitrary coordinates', async () => {
  const api = client(async (_url,init) => {
    assert.match(String((init?.body as FormData).get('prompt')),/confidence is "low" only when/);
    assert.equal((init?.body as FormData).get('target'),'리모컨');
    return response({ result: { hazard:'hot',safety:'뜨거워요.',grasp:'손잡이',comment:'컵',handle_point:{x:.8,y:.5} }, grasp:'wrong' });
  });
  const result = await api.describe(new Blob(),undefined,'리모컨');
  assert.deepEqual(result.sentences,['뜨거워요.','손잡이','컵']); assert.deepEqual(result.handlePoint,{x:.8,y:.5});
  assert.deepEqual(readDescription([{grasp:'손잡이를 잡아 주세요.'}]),{sentences:['손잡이를 잡아 주세요.'],grasp:'손잡이를 잡아 주세요.'});
  assert.equal(readDescription([{handle_point:{x:.2,y:.3}},{handle_point:{x:.8,y:.5}}]).handlePoint,undefined);
  assert.deepEqual(readDescription({safety:null,grasp:3,handle_point:{x:2,y:.5}}),{sentences:[]});
});
test('all mode omits targets, keeps color metadata and permits a same-origin server-held key',async()=>{
  const api=createApiClient({baseUrl:'/api',apiKey:'',requireApiKey:false,clientId:()=> 'test',fetcher:async(_url,init)=>{
    assert.equal((init?.body as FormData).has('targets'),false);
    return response({mode:'all',detections:[],color_filter:'black',color_rejected:[{color:'white'}]});
  }});
  const result=await api.detect(new Blob());
  assert.equal(result.mode,'all');assert.equal(result.color_filter,'black');assert.deepEqual(result.color_rejected,[{color:'white'}]);
});
test('TTS times out after three seconds and does not queue a delayed rate-limit retry',async context=>{
  context.mock.timers.enable({apis:['setTimeout']});
  const api=client(async(_url,init)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new Error('abort')))));
  const pending=api.tts('테스트');context.mock.timers.tick(3000);
  await assert.rejects(pending,(error:ApiError)=>error.code==='timeout');
  let calls=0;const limited=client(async()=>{calls++;return response({error:{code:'rate_limited'}},429,{'Retry-After':'30'});});
  await assert.rejects(limited.tts('테스트'));assert.equal(calls,1);
});

test('parse times out at fifteen seconds and never waits through a rate-limit retry',async context=>{
  context.mock.timers.enable({apis:['setTimeout']});
  const api=client(async(_url,init)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new Error('abort')))));
  const pending=api.parse('Find cup');context.mock.timers.tick(15000);
  await assert.rejects(pending,(error:ApiError)=>error.code==='timeout');
  let calls=0;const limited=client(async()=>{calls++;return response({error:{code:'rate_limited'}},429,{'Retry-After':'60'});});
  await assert.rejects(limited.parse('Find cup'));assert.equal(calls,1);
});
