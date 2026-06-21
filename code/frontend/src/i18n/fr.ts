import frFR from 'antd/es/locale/fr_FR';
import type { UserStatus } from '../types/auth';
import type {
  BudgetSharePrincipalType,
  BudgetShareRole,
  BudgetStatus,
  CurrencyRate,
  Visibility,
  WorkspaceRole,
} from '../types/budget';
import { enDictionary } from './en';
import type { AppLanguage, WorkspaceType } from './types';

export const frLanguage = 'fr' satisfies AppLanguage;

export const frLanguageLabel = 'Français';

export const frLanguageOption = { label: frLanguageLabel, value: frLanguage };

export const frAntdLocale = frFR;

export const frDictionary = {
  ...enDictionary,
  active: 'Actif',
  add: 'Ajouter',
  admin: 'Administration',
  all: 'Tous',
  amount: 'Montant',
  archived: 'Archive',
  budget: 'Budget',
  budgetProjects: 'Projets budgetaires',
  bookkeeping: 'Comptabilite',
  cancel: 'Annuler',
  categories: 'Categories',
  closed: 'Cloture',
  create: 'Creer',
  createBudgetProject: 'Creer un projet budgetaire',
  currentWorkspace: 'Espace de travail actuel',
  dashboard: 'Tableau de bord',
  delete: 'Supprimer',
  deleteBudgetDescription: 'Supprimer ce projet budgetaire avec tous ses postes et transactions ? Cette action est irreversible.',
  deleteBudgetTitle: 'Supprimer ce projet budgetaire ?',
  draft: 'Brouillon',
  estimatedActuals: 'Reel estime',
  exportPdf: 'Exporter le PDF',
  loadingBudgetProjects: 'Chargement des projets budgetaires...',
  logout: 'Se deconnecter',
  newTabEdit: 'Modifier',
  noMatchingBudgetProjects: 'Aucun projet budgetaire correspondant',
  pdfExportApplySettings: 'Appliquer les parametres',
  pdfExportLanguages: 'Langues PDF',
  pdfExportLanguagesDescription: 'Les langues selectionnees sont combinees dans le meme document PDF.',
  pdfExportLanguageRequired: 'Selectionnez au moins une langue PDF.',
  pdfExportPreview: 'Apercu instantane',
  pdfExportPreviewSection: 'Resume du budget',
  pdfExportPreviewSubtitle: 'Exemple de mise en page exportee',
  pdfExportPreviewTitle: 'Titre du budget',
  pdfExportSettings: 'Parametres d export',
  pdfExportSettingsDescription: 'Choisissez les parametres pour cet export PDF.',
  pdfExportShowWorkspace: 'Afficher Workspace',
  pdfExportShowWorkspaceDescription: 'Afficher le vrai nom du Workspace dans les themes PDF compatibles.',
  pdfTheme: 'Theme PDF',
  pdfThemeClassic: 'Classique',
  pdfThemeClassicDescription: 'Conserve le modele d export actuel.',
  pdfThemeHsbc: 'Style HSBC',
  pdfThemeHsbcDescription: 'Inspire des documents officiels, adapte aux exports budgetaires et comptables.',
  pdfThemeProfileHelp: 'Cette preference est utilisee pour les exports PDF budgetaires et comptables.',
  pdfThemeRequired: 'Selectionnez un theme PDF.',
  personal: 'Personnel',
  personalFinance: 'Finances personnelles',
  projectInfo: 'Infos du projet',
  projectLibrary: 'Bibliotheque de projets',
  projectLibraryDesc: 'Les projets budgetaires restent independants ; pour collaborer, reliez-les aux espaces de travail ou aux utilisateurs via les regles de partage.',
  projectLibraryTitle: 'Bibliotheque des projets budgetaires',
  rate: 'Taux',
  rates: 'Taux',
  save: 'Enregistrer',
  searchBudgetProjects: 'Rechercher des projets budgetaires',
  setCurrent: 'Definir comme actuel',
  variance: 'Ecart',
  workspace: 'Espace de travail',
} satisfies Record<keyof typeof enDictionary, string>;

export const frRoleLabels = {
  owner: "Propriétaire",
  admin: "Administrateur",
  editor: "Éditeur",
  viewer: "Lecteur",
  auditor: "Auditeur",
} satisfies Record<WorkspaceRole, string>;

export const frBudgetShareRoleLabels = {
  owner: "Propriétaire",
  editor: "Éditeur",
  viewer: "Lecteur",
  auditor: "Auditeur",
} satisfies Record<BudgetShareRole, string>;

export const frBudgetStatusLabels = {
  draft: "Brouillon",
  active: "Actif",
  closed: "Clôturé",
  archived: "Archivé",
} satisfies Record<BudgetStatus, string>;

export const frVisibilityLabels = {
  private: "Privé",
  workspace: "Espace de travail",
  custom: "Personnalisé",
} satisfies Record<Visibility, string>;

export const frPrincipalTypeLabels = {
  user: "Utilisateur",
  workgroup: "Groupe de travail",
  workspace: "Espace de travail",
} satisfies Record<BudgetSharePrincipalType, string>;

export const frUserStatusLabels = {
  active: "Actif",
  pending: "En attente",
  disabled: "Désactivé",
} satisfies Record<UserStatus, string>;

export const frWorkspaceTypeLabels = {
  personal: "Personal",
  family: "Famille",
  team: "Équipe",
  custom: "Personnalisé",
} satisfies Record<WorkspaceType, string>;

export const frCurrencyRateSourceLabels = {
  manual: "Manuel",
  budget_default: "Budget par défaut",
  bochk: "BOCHK",
} satisfies Record<CurrencyRate['source'], string>;

export const frApiErrorMessages = {
  AUTHENTICATION_FAILED: "Échec de l’authentification. Veuillez vous reconnecter.",
  BUDGET_NOT_FOUND: "Le budget n’existe pas ou a été supprimé.",
  CSRF_TOKEN_INVALID: "Votre session a expiré. Veuillez vous reconnecter.",
  DATABASE_NOT_CONFIGURED: "La base de données n’a pas encore été configurée.",
  DATABASE_UNAVAILABLE: "La base de données est temporairement indisponible.",
  EMAIL_ALREADY_EXISTS: "Cette adresse e-mail est déjà enregistrée.",
  EMAIL_NOT_VERIFIED: "L’adresse e-mail n’est pas vérifiée. Veuillez terminer la vérification.",
  EXCHANGE_RATE_NOT_FOUND: "Le taux de change est manquant. Actualisez les taux BOCHK ou saisissez un taux manuel.",
  EXCHANGE_RATE_PROVIDER_DISABLED: "Ce fournisseur de taux est désactivé. Utilisez BOCHK ou des taux manuels.",
  EXCHANGE_RATE_PROVIDER_EMPTY: "Aucun taux disponible n’a été retourné. Réessayez plus tard ou saisissez un taux manuel.",
  EXCHANGE_RATE_PROVIDER_FAILED: "Le fournisseur de taux est temporairement indisponible.",
  EXCHANGE_RATE_PROVIDER_INVALID: "Le fournisseur de taux a retourné une réponse invalide.",
  EXPORT_FAILED: "La création du fichier d’export a échoué. Vérifiez les extensions PHP et les droits du répertoire.",
  EXPORT_STORAGE_UNWRITABLE: "Le répertoire d’export n’est pas inscriptible. Définissez EXPORT_STORAGE_DIR ou accordez les droits d’écriture.",
  FORBIDDEN: "Ce compte n’a pas l’autorisation d’effectuer cette action.",
  INVALID_CREDENTIALS: "Le nom d’utilisateur, l’e-mail ou le mot de passe est incorrect.",
  INVALID_EMAIL_TOKEN: "Le lien de vérification e-mail est invalide ou expiré.",
  MAIL_DELIVERY_FAILED: "L’e-mail de vérification n’a pas pu être envoyé. Veuillez réessayer plus tard.",
  MISSING_SEED_DATA: "Les données de base sont manquantes. Initialisez d’abord la base de données.",
  NOT_FOUND: "Le point d’accès API n’existe pas.",
  PERMISSION_DENIED: "Ce compte n’a pas l’autorisation d’effectuer cette action.",
  SERVER_ERROR: "Le serveur ne peut pas traiter la demande pour le moment. Veuillez réessayer plus tard.",
  SSO_CREATE_TOKEN_INVALID: "La création du compte SSO a expiré. Recommencez la connexion SSO.",
  SSO_BIND_FROM_SSO_ONLY_REQUIRED: "La liaison SSO doit être démarrée depuis un compte SSO uniquement.",
  SSO_EMAIL_ALREADY_EXISTS: "Un compte avec cet e-mail existe déjà. Connectez-vous avec ce compte, puis liez le SSO depuis le profil.",
  SSO_EMAIL_REQUIRED: "Ce compte SSO ne fournit pas d’e-mail, BudgetCentre ne peut donc pas créer de compte.",
  SSO_MERGE_BINDING_REQUIRED: "Ce compte n’est pas lié au SSO.",
  SSO_MERGE_SOURCE_NOT_SSO_ONLY: "Seuls les comptes SSO uniquement peuvent être fusionnés dans un compte existant.",
  SSO_MERGE_TARGET_PASSWORD_REQUIRED: "Le compte cible doit être un compte avec mot de passe.",
  SSO_MERGE_TOKEN_INVALID: "La liaison SSO a expiré. Recommencez depuis le profil.",
  SSO_ONLY_EMAIL_LOCKED: "Les comptes SSO uniquement ne peuvent pas modifier directement l’e-mail.",
  SSO_ONLY_PASSWORD_DISABLED: "Les comptes SSO uniquement ne peuvent pas créer de mot de passe.",
  SSO_ONLY_UNLINK_DISABLED: "Liez d’abord un compte existant avant de délier le SSO.",
  SSO_TARGET_ALREADY_BOUND: "Le compte existant est déjà lié à un compte SSO.",
  TEMPLATE_NOT_FOUND: "Le modèle de budget est manquant. Initialisez d’abord les données de modèle.",
  UNAUTHENTICATED: "Veuillez vous connecter d’abord.",
  USER_NOT_FOUND: "L’utilisateur n’existe pas ou a été supprimé.",
  USERNAME_ALREADY_EXISTS: "Ce nom d’utilisateur est déjà enregistré.",
  VALIDATION_ERROR: "La saisie est invalide.",
} satisfies Record<string, string>;
