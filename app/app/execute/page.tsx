import React from "react";
import { ExecutionWallet } from "../../src/components/ExecutionWallet";
import { PageHeader } from "../../src/components/ui";

export default function ExecutePage() {
  return <div className="execute-route">
    <PageHeader eyebrow="Interactive execution · Arc Testnet" title="Run a settlement" description="Connect your client wallet to establish a secure Arc Testnet session. Transaction execution is not enabled in this milestone."/>
    <ExecutionWallet/>
  </div>;
}
