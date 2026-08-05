import React from "react";
import { DemoWalkthrough } from "../../src/components/DemoWalkthrough";
import { buildDemoPresentation } from "../../src/data/demo-stages";
import { getArcReadState } from "../../src/lib/arc/read-server";

export default async function DemoPage(){return <DemoWalkthrough presentation={buildDemoPresentation(await getArcReadState())}/>}
