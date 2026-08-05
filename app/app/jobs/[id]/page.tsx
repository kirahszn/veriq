import React from "react";
import { JobDetailsView } from "../../../src/components/live-pages";
import { getArcReadState } from "../../../src/lib/arc/read-server";

export default async function JobDetailsPage({params}:{params:{id:string}}){return <JobDetailsView params={params} data={await getArcReadState()}/>}
