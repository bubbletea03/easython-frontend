import test from 'node:test';
import assert from 'node:assert/strict';
import {captureFrame,captureRegion} from '../src/capture.ts';
test('uploads 640px JPEG at 0.7 while retaining original camera quality',async()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
  let args:unknown[]=[],quality:unknown;
  const canvas={width:0,height:0,getContext:()=>({drawImage(...values:unknown[]){args=values;}}),toBlob(callback:(blob:Blob)=>void,type:string,q:number){assert.equal(type,'image/jpeg');quality=q;callback(new Blob(['image'],{type}));}};
  Object.assign(globalThis,{document:{createElement:()=>canvas}});
  try {
    const video={readyState:4,videoWidth:1920,videoHeight:1080,paused:false} as HTMLVideoElement;
    await captureFrame(video);assert.equal(canvas.width,640);assert.equal(canvas.height,360);assert.equal(quality,.7);
    assert.deepEqual(args.slice(1,5),[0,0,1920,1080]);assert.equal(video.videoWidth,1920);
    const box={x:.25,y:.25,width:.25,height:.5};await captureFrame(video,undefined,box);
    assert.deepEqual(args.slice(1,5),[480,270,480,540]);
    assert.equal(canvas.width,480);assert.equal(canvas.height,540);
    const clipped=captureRegion({x:.8,y:.2,width:.4,height:.5});assert.ok(Math.abs(clipped.width-.2)<1e-8);
  } finally {if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');}
});
