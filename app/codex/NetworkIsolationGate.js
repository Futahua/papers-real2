'use strict';

// Fail-closed network policy.
//
// Gate A proved that `networkAccess:false` on a direct command/exec did NOT
// stop an outbound HTTPS request on this Windows runtime. Therefore Papers
// must never treat the App Server sandbox as a network boundary. When a task
// genuinely requires guaranteed offline execution and no verified outer
// isolation provider exists, Papers refuses the task rather than pretend.

const { CodexError, CODE } = require('./CodexErrors');

// The provider interface. Future work can supply a real one (e.g. an outer
// WFP/firewall-backed sandbox). Today only the Unavailable provider exists.
class NetworkIsolationProvider {
  getStatus() { return 'unknown'; }
  canGuaranteeOffline() { return false; }
  async prepareSession() { return { ok: false, reason: 'not implemented' }; }
  async releaseSession() { /* no-op */ }
}

class UnavailableNetworkIsolationProvider extends NetworkIsolationProvider {
  getStatus() { return 'unavailable'; }
  canGuaranteeOffline() { return false; }
  async prepareSession() {
    return { ok: false, reason: 'no verified outer network isolation on this runtime' };
  }
}

class NetworkIsolationGate {
  constructor(provider) {
    this.provider = provider || new UnavailableNetworkIsolationProvider();
  }

  status() { return this.provider.getStatus(); }
  canGuaranteeOffline() { return this.provider.canGuaranteeOffline(); }

  // Enforced before any offline-required task reaches the App Server. Fails
  // closed with a typed error the UI can explain honestly.
  assertOfflineAllowed() {
    if (!this.provider.canGuaranteeOffline()) {
      throw new CodexError(CODE.NETWORK_ISOLATION_UNAVAILABLE,
        'Papers cannot guarantee offline containment on the current runtime, so it will not run a task that requires the network to be blocked.',
        { provider: this.provider.getStatus() });
    }
    return true;
  }

  // A human-facing statement of what the sandbox does and does NOT provide.
  // Used by the approval UI so we never mislabel network access as blocked.
  policyStatement(effectiveNetworkAccess) {
    if (this.provider.canGuaranteeOffline()) {
      return effectiveNetworkAccess
        ? 'Network allowed (outer isolation active).'
        : 'Network blocked by verified outer isolation.';
    }
    return effectiveNetworkAccess
      ? 'Network allowed. No outer isolation — treat as internet-capable.'
      : 'Network requested off, but NOT guaranteed on this runtime. Do not rely on it.';
  }
}

module.exports = {
  NetworkIsolationGate,
  NetworkIsolationProvider,
  UnavailableNetworkIsolationProvider,
};
