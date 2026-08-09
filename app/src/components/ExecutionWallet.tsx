"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { ARC_TESTNET_CHAIN_ID } from "../lib/arc/chain";
import {
  WalletConnectionError,
  connectInjectedWallet,
  getInjectedProvider,
  readInjectedAccounts,
  readInjectedChainId,
  readUsdcBalance,
  subscribeInjectedWallet,
  type InjectedProvider,
} from "../lib/wallet/injectedWallet";
import { AddressDisplay, NetworkBadge } from "./ui";
import { CreateFundedJobStep } from "./CreateFundedJobStep";

type Status = "disconnected" | "not-installed" | "connecting" | "connected" | "wrong-network" | "rejected" | "error";

export function ExecutionWallet() {
  const [status, setStatus] = useState<Status>("disconnected");
  const [address, setAddress] = useState<Address | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const providerRef = useRef<InjectedProvider | null>(null);

  const reset = useCallback(() => {
    requestVersion.current += 1;
    setAddress(null);
    setBalance(null);
    setError(null);
    setStatus("disconnected");
  }, []);

  const refreshBalance = useCallback(async (account: Address) => {
    const version = ++requestVersion.current;
    setBalance(null);
    try {
      const value = await readUsdcBalance(account);
      if (requestVersion.current === version) setBalance(value);
    } catch {
      if (requestVersion.current === version) setError("USDC balance could not be read from Arc Testnet.");
    }
  }, []);

  const acceptValidAccount = useCallback(async (provider: InjectedProvider, account: Address) => {
    requestVersion.current += 1;
    setError(null);
    if (await readInjectedChainId(provider) !== ARC_TESTNET_CHAIN_ID) {
      setAddress(null);
      setBalance(null);
      setStatus("wrong-network");
      setError("Switch the wallet to Arc Testnet, then connect again.");
      return;
    }
    setAddress(account);
    setStatus("connected");
    await refreshBalance(account);
  }, [refreshBalance]);

  useEffect(() => {
    const provider = getInjectedProvider();
    providerRef.current = provider;
    if (!provider) return;
    return subscribeInjectedWallet(provider, {
      accountsChanged(accounts) {
        const account = accounts[0];
        if (!account) return reset();
        void acceptValidAccount(provider, account as Address).catch(() => {
          reset();
          setStatus("error");
          setError("The changed wallet account could not be validated.");
        });
      },
      chainChanged(chainId) {
        requestVersion.current += 1;
        setBalance(null);
        if (Number.parseInt(chainId, 16) !== ARC_TESTNET_CHAIN_ID) {
          setAddress(null);
          setStatus("wrong-network");
          setError("The wallet changed away from Arc Testnet.");
          return;
        }
        void readInjectedAccounts(provider).then(accounts => {
          const account = accounts[0];
          if (!account) return reset();
          return acceptValidAccount(provider, account);
        }).catch(() => {
          reset();
          setStatus("error");
          setError("The wallet network change could not be validated.");
        });
      },
      disconnect: reset,
    });
  }, [acceptValidAccount, reset]);

  async function connect() {
    const provider = providerRef.current ?? getInjectedProvider();
    if (!provider) {
      setStatus("not-installed");
      setError("No injected wallet was found. Install MetaMask or another EIP-1193 wallet.");
      return;
    }
    providerRef.current = provider;
    requestVersion.current += 1;
    setStatus("connecting");
    setError(null);
    setAddress(null);
    setBalance(null);
    try {
      const account = await connectInjectedWallet(provider);
      await acceptValidAccount(provider, account);
    } catch (cause) {
      const walletError = cause instanceof WalletConnectionError ? cause : null;
      setStatus(walletError?.kind === "rejected" ? "rejected" : walletError?.kind === "wrong-network" ? "wrong-network" : "error");
      setError(walletError?.message ?? "Unable to connect the wallet.");
    }
  }

  const connected = status === "connected" && address;
  return <div className="execution-flow"><section className="execution-panel panel" aria-live="polite">
    <header className="execution-step"><span>01 / CONNECT</span><p>Connect a wallet to execute Veriq on Arc Testnet.</p></header>
    {!connected ? <div className="execution-disconnected">
      <button className="button primary" type="button" onClick={connect} disabled={status === "connecting"}>
        {status === "connecting" ? "Connecting…" : "Connect Wallet"}
      </button>
      {error && <p className="execution-error" role="alert">{error}</p>}
    </div> : <>
      <dl className="execution-metadata">
        <div><dt>Wallet</dt><dd><AddressDisplay address={address}/></dd></div>
        <div><dt>Network</dt><dd><NetworkBadge/></dd></div>
        <div><dt>Role</dt><dd>Client</dd></div>
        <div><dt>USDC Balance</dt><dd>{balance ?? "Reading…"}</dd></div>
      </dl>
      {error && <p className="execution-error" role="alert">{error}</p>}
      <button className="button secondary" type="button" onClick={reset}>Disconnect</button>
      <small className="execution-note">Disconnect resets Veriq locally; wallet permissions are managed by your wallet.</small>
    </>}
  </section>{connected && providerRef.current && <CreateFundedJobStep key={address.toLowerCase()} client={address} provider={providerRef.current} onBalanceRefresh={()=>refreshBalance(address)}/>}</div>;
}
