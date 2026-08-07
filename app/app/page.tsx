import React from "react";
import { OverviewTerminal } from "../src/components/OverviewTerminal";
import { getArcReadState } from "../src/lib/arc/read-server";

export default async function OverviewPage({searchParams}:{searchParams?:{refresh?:string}}){return <div className="overview-route"><OverviewTerminal data={await getArcReadState({fresh:searchParams?.refresh==="1"})}/></div>}
