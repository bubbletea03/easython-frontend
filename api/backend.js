import {createProxyHandler} from '../server/proxyCore.mjs';
const handler=createProxyHandler(process.env);
export const GET=handler;
export const POST=handler;
