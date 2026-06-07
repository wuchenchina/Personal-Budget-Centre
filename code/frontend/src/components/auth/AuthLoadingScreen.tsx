import { WalletCards } from 'lucide-react';
import { useI18n } from '../../i18n';

export function AuthLoadingScreen() {
  const { t } = useI18n();

  return (
    <main className="auth-shell">
      <div className="auth-loading-panel">
        <div className="auth-brand">
          <div className="auth-mark">
            <WalletCards size={20} />
          </div>
          <div>
            <h1>BudgetCentre</h1>
            <p>{t('sessionLoading')}</p>
          </div>
        </div>
      </div>
    </main>
  );
}
