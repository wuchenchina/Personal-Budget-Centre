import { WalletCards } from 'lucide-react';

export function AuthLoadingScreen() {
  return (
    <main className="auth-shell">
      <div className="auth-loading-panel">
        <div className="auth-brand">
          <div className="auth-mark">
            <WalletCards size={20} />
          </div>
          <div>
            <h1>BudgetCentre</h1>
            <p>Loading session...</p>
          </div>
        </div>
      </div>
    </main>
  );
}
