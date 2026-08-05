import React from "react";
import { OverviewView } from "../src/components/live-pages";
import { getArcReadState } from "../src/lib/arc/read-server";

export default async function OverviewPage(){return <div className="overview-route"><OverviewView data={await getArcReadState()}/></div>}
