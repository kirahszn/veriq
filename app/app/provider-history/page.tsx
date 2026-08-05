import React from "react";
import { ProviderHistoryView } from "../../src/components/live-pages";
import { getArcReadState } from "../../src/lib/arc/read-server";

export default async function ProviderHistoryPage(){return <ProviderHistoryView data={await getArcReadState()}/>}
