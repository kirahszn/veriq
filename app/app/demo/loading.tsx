export default function DemoLoading() {
  return (
    <section className="demo-route state-card" aria-live="polite" aria-busy="true">
      <span className="section-kicker">Read-only demo</span>
      <h1>Veriq Protocol Demo</h1>
      <p className="muted">Checking the verified Job #1 state on Arc Testnet…</p>
      <div className="skeleton" aria-hidden="true"><i /><i /><i /></div>
    </section>
  );
}
