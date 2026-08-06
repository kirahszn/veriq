import React from "react";
import { OverviewView } from "../src/components/live-pages";
import { getArcReadState } from "../src/lib/arc/read-server";

export default async function OverviewPage({searchParams}:{searchParams?:{refresh?:string}}){return <div className="overview-route"><OverviewView data={await getArcReadState({fresh:searchParams?.refresh==="1"})}/></div>}
