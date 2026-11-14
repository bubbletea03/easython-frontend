const methods = {health:'GET',stats:'GET',detect:'POST',parse:'POST',describe:'POST',tts:'POST'};
export function createProxyHandler(env, fetcher=fetch) {
  return async function handler(request) {
    const endpoint=new URL(request.url).searchParams.get('endpoint');
    const error=(status,code,message)=>Response.json({error:{code,message}},{status,headers:{'Cache-Control':'no-store'}});
    if(!Object.hasOwn(methods,endpoint))return error(404,'not_found','지원하지 않는 API입니다.');
    if(request.method!==methods[endpoint])return error(405,'method_not_allowed','지원하지 않는 요청입니다.');
    if(!env.BACKEND_API_URL||!env.BACKEND_API_KEY)return error(503,'proxy_not_configured','Vercel 서버의 BACKEND_API_URL과 BACKEND_API_KEY를 설정해 주세요.');
    let target;
    try {target=new URL(env.BACKEND_API_URL);if(!['http:','https:'].includes(target.protocol)||target.username||target.password||target.search||target.hash)throw new Error();}
    catch{return error(503,'proxy_not_configured','백엔드 주소 설정을 확인해 주세요.');}
    const clientId=request.headers.get('X-Client-Id');
    if(!clientId||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId))return error(400,'invalid_client_id','브라우저 기기 ID를 확인해 주세요.');
    if(Number(request.headers.get('Content-Length'))>2*1024*1024)return error(413,'image_too_large','이미지 크기를 줄여 주세요.');
    const controller=new AbortController(),abort=()=>controller.abort();
    request.signal.addEventListener('abort',abort,{once:true});
    if(request.signal.aborted)controller.abort();
    const timer=setTimeout(abort,50000);
    try {
      const body=request.method==='POST'?await request.arrayBuffer():undefined;
      if(body?.byteLength>2*1024*1024)return error(413,'image_too_large','이미지 크기를 줄여 주세요.');
      const headers={'X-API-Key':env.BACKEND_API_KEY,'X-Client-Id':clientId};
      if(request.headers.has('Content-Type'))headers['Content-Type']=request.headers.get('Content-Type');
      const response=await fetcher(target.href.replace(/\/$/,'')+'/'+endpoint,{method:request.method,headers,body,signal:controller.signal,redirect:'error'});
      const responseHeaders={'Cache-Control':'no-store'};
      for(const key of ['content-type','retry-after']){const value=response.headers.get(key);if(value)responseHeaders[key]=value;}
      return new Response(await response.arrayBuffer(),{status:response.status,headers:responseHeaders});
    } catch {return error(502,controller.signal.aborted?'timeout':'network_error','백엔드 연결을 확인해 주세요.');}
    finally {clearTimeout(timer);request.signal.removeEventListener('abort',abort);}
  };
}
