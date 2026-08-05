import React from "react";
import { JobsView } from "../../src/components/live-pages";
import { getArcReadState } from "../../src/lib/arc/read-server";

export default async function JobsPage(){return <JobsView data={await getArcReadState()}/>}
