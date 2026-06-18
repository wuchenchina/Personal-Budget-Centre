import { WalletCards } from 'lucide-react';
import { useI18n } from '../../i18n';
import styles from './AuthScreen.module.css';

export function AuthLoadingScreen() {
  const { t } = useI18n();

  return (
    <main className={styles.loadingShell}>
      <div className={styles.loadingCard}>
        <div className={styles.formIntro}>
          <div className={styles.logo}>
            <WalletCards size={22} />
          </div>
          <div>
            <span>BudgetCentre</span>
            <h2>{t('sessionLoading')}</h2>
          </div>
        </div>
        <div className={styles.loadingBars} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </main>
  );
}
