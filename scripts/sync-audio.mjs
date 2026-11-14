import {readFile,mkdir,writeFile} from 'node:fs/promises';
const env=Object.fromEntries((await readFile('.env.local','utf8')).split(/\r?\n/).filter(x=>x.includes('=')&&!x.startsWith('#')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1).trim()]));
const base=process.env.AUDIO_SOURCE_URL || env.VITE_API_BASE_URL;
if (!base?.startsWith('https://')) throw new Error('Set AUDIO_SOURCE_URL to the actual HTTPS backend.');
const manifestResponse=await fetch(base+'/app/audio/manifest.json');
if (!manifestResponse.ok) throw new Error('Audio manifest unavailable');
const manifest=await manifestResponse.json();
const files=[];
for (const [id,count] of Object.entries(manifest)) {
  if (!/^[a-z0-9_]+$/.test(id)||!Number.isInteger(count)||count<1||count>50) throw new Error('Invalid audio manifest');
  for(let n=1;n<=count;n++) files.push(`${id}_${n}.mp3`);
}
await mkdir('public/audio',{recursive:true});
let index=0;
await Promise.all(Array.from({length:4},async()=>{
  while(index<files.length) {
    const file=files[index++],r=await fetch(base+'/app/audio/'+file);
    if(!r.ok||!r.headers.get('content-type')?.startsWith('audio/')) throw new Error('Invalid recording: '+file);
    await writeFile('public/audio/'+file,new Uint8Array(await r.arrayBuffer()));
  }
}));
await writeFile('public/audio/manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(`Verified and downloaded ${files.length} recordings.`);
