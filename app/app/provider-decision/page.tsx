import React from "react";
import { demo } from "../../src/data/demo";
import { PageHeader } from "../../src/components/ui";
import { ProviderDecisionCard } from "../../src/components/providers";

export default function ProviderDecisionPage(){return <><PageHeader eyebrow="Static deterministic fixture · not onchain" title="Economic decision" description="This offchain profitability fixture is not stored in or read from VeriqEscrow."/><div className="decision-grid">{demo.decisions.map(d=><ProviderDecisionCard key={d.label} example={d}/>)}</div><section className="logic-strip"><span>expected payout = payout curve(estimated quality) × budget</span><span>expected profit = expected payout − execution cost</span><span>accept when expected profit ≥ minimum profit</span></section></>}
