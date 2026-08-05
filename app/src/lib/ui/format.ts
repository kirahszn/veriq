import { demo } from "../../data/demo";
export function formatAddress(value:string, start=6, end=4):string { return value.length <= start+end+1 ? value : `${value.slice(0,start)}…${value.slice(-end)}`; }
export function formatBps(value:number|null):string { return value === null ? "—" : `${Number((value/100).toFixed(2))}%`; }
export function formatUsdc(value:string):string { return value === "—" ? value : `${value} USDC`; }
export const explorerLinks = Object.freeze({ contract:(value:string)=>`${demo.deployment.explorerBase}/address/${value}`, address:(value:string)=>`${demo.deployment.explorerBase}/address/${value}`, transaction:(value:string)=>`${demo.deployment.explorerBase}/tx/${value}` });
