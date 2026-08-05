"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AddressDisplay, NetworkBadge } from "./ui";
import { demo } from "../data/demo";
export const navigation = Object.freeze([{href:"/",label:"Overview"},{href:"/jobs",label:"Jobs"},{href:"/provider-selection",label:"Provider Selection"},{href:"/provider-decision",label:"Provider Decision"},{href:"/provider-history",label:"Provider History"}]);
export function AppShell({children}:{children:React.ReactNode}) { const pathname=usePathname()??"/"; return <div className="app-shell"><header className="topbar"><Link className="wordmark" href="/" aria-label="Veriq overview"><span className="mark">V</span>veriq</Link><nav aria-label="Primary navigation">{navigation.map(item=>{const active=item.href==="/"?pathname==="/":pathname===item.href||pathname.startsWith(`${item.href}/`);return <Link key={item.href} href={item.href} className={active?"active":undefined} aria-current={active?"page":undefined}>{item.label}</Link>})}</nav><div className="network-meta"><NetworkBadge /><AddressDisplay address={demo.deployment.contract} href /></div></header><main className="page">{children}</main><footer><span>Veriq · Quality-based settlement protocol</span><span>Static Testnet Demo · No wallet connected</span></footer></div> }
