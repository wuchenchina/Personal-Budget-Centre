import { useI18n } from '../../i18n';
import styles from './AuthScreen.module.css';

export function AuthLoadingScreen() {
  const { t } = useI18n();

  return (
    <main className={styles.loadingShell}>
      <div className={styles.loadingCard}>
        <div className={styles.loadingBrand}>
          <img
            className={styles.brandLogo}
            src="/favicon.webp"
            alt="BudgetCentre"
            width={48}
            height={48}
          />
          <span className={styles.brandName}>BudgetCentre</span>
          <p className={styles.brandSubtitle}>{t('sessionLoading')}</p>
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
