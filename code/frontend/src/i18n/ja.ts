import jaJP from 'antd/es/locale/ja_JP';
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

export const jaLanguage = 'ja' satisfies AppLanguage;

export const jaLanguageLabel = '日本語';

export const jaLanguageOption = { label: jaLanguageLabel, value: jaLanguage };

export const jaAntdLocale = jaJP;

export const jaDictionary = {
  ...enDictionary,
  active: '有効',
  add: '追加',
  admin: '管理',
  all: 'すべて',
  amount: '金額',
  archived: 'アーカイブ済み',
  budget: '予算',
  budgetProjects: '予算プロジェクト',
  bookkeeping: '記帳',
  cancel: 'キャンセル',
  categories: 'カテゴリ',
  closed: '終了',
  create: '作成',
  createBudgetProject: '予算プロジェクトを作成',
  currentWorkspace: '現在のワークスペース',
  dashboard: 'ダッシュボード',
  delete: '削除',
  deleteBudgetDescription: 'この予算プロジェクトとすべての予算項目、取引を削除しますか？この操作は元に戻せません。',
  deleteBudgetTitle: 'この予算プロジェクトを削除しますか？',
  draft: '下書き',
  estimatedActuals: '見込実績',
  exportPdf: 'PDF をエクスポート',
  loadingBudgetProjects: '予算プロジェクトを読み込み中...',
  logout: 'サインアウト',
  newTabEdit: '編集',
  noMatchingBudgetProjects: '一致する予算プロジェクトはありません',
  pdfExportApplySettings: '設定を適用',
  pdfExportLanguages: 'PDF 言語',
  pdfExportLanguagesDescription: '選択した言語は同じ PDF 文書内にまとめて表示されます。',
  pdfExportLanguageRequired: '少なくとも 1 つの PDF 言語を選択してください。',
  pdfExportPreview: '即時プレビュー',
  pdfExportPreviewSection: '予算概要',
  pdfExportPreviewSubtitle: 'エクスポートレイアウトの例',
  pdfExportPreviewTitle: '予算タイトル',
  pdfExportSettings: 'エクスポート設定',
  pdfExportSettingsDescription: '今回の PDF エクスポート設定を選択します。',
  pdfExportShowWorkspace: 'ワークスペースを表示',
  pdfExportShowWorkspaceDescription: '対応する PDF テーマで実際のワークスペース名を表示します。',
  pdfTheme: 'PDF テーマ',
  pdfThemeClassic: 'クラシック',
  pdfThemeClassicDescription: '既存のエクスポートテンプレートを維持します。',
  pdfThemeHsbc: 'HSBC スタイル',
  pdfThemeHsbcDescription: '正式な帳票レイアウトを参考にした、予算と記帳のエクスポート向けテーマです。',
  pdfThemeProfileHelp: 'この設定は予算と記帳の PDF エクスポートで使用されます。',
  pdfThemeRequired: 'PDF テーマを選択してください。',
  personal: '個人',
  personalFinance: '個人財務',
  projectInfo: 'プロジェクト情報',
  projectLibrary: 'プロジェクトライブラリ',
  projectLibraryDesc: '予算プロジェクトは独立して保持され、共同作業が必要な場合は共有ルールでワークスペースやユーザーに接続します。',
  projectLibraryTitle: '予算プロジェクトライブラリ',
  rate: '為替レート',
  rates: '為替レート',
  save: '保存',
  searchBudgetProjects: '予算プロジェクトを検索',
  setCurrent: '現在に設定',
  variance: '差異',
  workspace: 'ワークスペース',
} satisfies Record<keyof typeof enDictionary, string>;

export const jaRoleLabels = {
  owner: "所有者",
  admin: "管理者",
  editor: "編集者",
  viewer: "閲覧者",
  auditor: "監査者",
} satisfies Record<WorkspaceRole, string>;

export const jaBudgetShareRoleLabels = {
  owner: "所有者",
  editor: "編集者",
  viewer: "閲覧者",
  auditor: "監査者",
} satisfies Record<BudgetShareRole, string>;

export const jaBudgetStatusLabels = {
  draft: "下書き",
  active: "有効",
  closed: "終了",
  archived: "アーカイブ済み",
} satisfies Record<BudgetStatus, string>;

export const jaVisibilityLabels = {
  private: "非公開",
  workspace: "ワークスペース",
  custom: "カスタム",
} satisfies Record<Visibility, string>;

export const jaPrincipalTypeLabels = {
  user: "ユーザー",
  workgroup: "ワークグループ",
  workspace: "ワークスペース",
} satisfies Record<BudgetSharePrincipalType, string>;

export const jaUserStatusLabels = {
  active: "有効",
  pending: "保留中",
  disabled: "無効",
} satisfies Record<UserStatus, string>;

export const jaWorkspaceTypeLabels = {
  personal: "Personal",
  family: "家族",
  team: "チーム",
  custom: "カスタム",
} satisfies Record<WorkspaceType, string>;

export const jaCurrencyRateSourceLabels = {
  manual: "手動",
  budget_default: "予算既定",
  bochk: "BOCHK",
} satisfies Record<CurrencyRate['source'], string>;

export const jaApiErrorMessages = {
  AUTHENTICATION_FAILED: "認証に失敗しました。もう一度サインインしてください。",
  BUDGET_NOT_FOUND: "予算が存在しないか、削除されています。",
  CSRF_TOKEN_INVALID: "セッションの有効期限が切れました。もう一度サインインしてください。",
  DATABASE_NOT_CONFIGURED: "データベースがまだ設定されていません。",
  DATABASE_UNAVAILABLE: "データベースは一時的に利用できません。",
  EMAIL_ALREADY_EXISTS: "このメールアドレスは既に登録されています。",
  EMAIL_NOT_VERIFIED: "メールアドレスが確認されていません。先に確認を完了してください。",
  EXCHANGE_RATE_NOT_FOUND: "為替レートが不足しています。BOCHK レートを更新するか、手動レートを入力してください。",
  EXCHANGE_RATE_PROVIDER_DISABLED: "この為替レート提供元は無効です。BOCHK または手動レートを使用してください。",
  EXCHANGE_RATE_PROVIDER_EMPTY: "利用可能なレートが返されませんでした。後でもう一度試すか、手動レートを入力してください。",
  EXCHANGE_RATE_PROVIDER_FAILED: "為替レート提供元は一時的に利用できません。",
  EXCHANGE_RATE_PROVIDER_INVALID: "為替レート提供元から無効な応答が返されました。",
  EXPORT_FAILED: "エクスポートファイルの作成に失敗しました。PHP 拡張機能と出力先権限を確認してください。",
  EXPORT_STORAGE_UNWRITABLE: "エクスポート先ディレクトリに書き込めません。EXPORT_STORAGE_DIR を設定するか、書き込み権限を付与してください。",
  FORBIDDEN: "このアカウントには、この操作を実行する権限がありません。",
  INVALID_CREDENTIALS: "ユーザー名、メールアドレス、またはパスワードが正しくありません。",
  INVALID_EMAIL_TOKEN: "メール確認リンクが無効、または期限切れです。",
  MAIL_DELIVERY_FAILED: "確認メールを送信できませんでした。後でもう一度お試しください。",
  MISSING_SEED_DATA: "基礎データが不足しています。先にデータベースを初期化してください。",
  NOT_FOUND: "API エンドポイントが存在しません。",
  PERMISSION_DENIED: "このアカウントには、この操作を実行する権限がありません。",
  SERVER_ERROR: "サーバーは現在リクエストを完了できません。後でもう一度お試しください。",
  SSO_CREATE_TOKEN_INVALID: "SSO アカウント作成の有効期限が切れました。SSO サインインをやり直してください。",
  SSO_BIND_FROM_SSO_ONLY_REQUIRED: "SSO の連携は SSO 専用アカウントから開始する必要があります。",
  SSO_EMAIL_ALREADY_EXISTS: "このメールアドレスのアカウントは既に存在します。そのアカウントでサインインしてから、プロフィールで SSO を連携してください。",
  SSO_EMAIL_REQUIRED: "この SSO アカウントにはメールアドレスがないため、BudgetCentre アカウントを作成できません。",
  SSO_MERGE_BINDING_REQUIRED: "このアカウントは SSO に連携されていません。",
  SSO_MERGE_SOURCE_NOT_SSO_ONLY: "既存アカウントに統合できるのは SSO 専用アカウントのみです。",
  SSO_MERGE_TARGET_PASSWORD_REQUIRED: "統合先アカウントはパスワードアカウントである必要があります。",
  SSO_MERGE_TOKEN_INVALID: "SSO 連携の有効期限が切れました。プロフィールからやり直してください。",
  SSO_ONLY_EMAIL_LOCKED: "SSO 専用アカウントではメールアドレスを直接変更できません。",
  SSO_ONLY_PASSWORD_DISABLED: "SSO 専用アカウントではパスワードを作成できません。",
  SSO_ONLY_UNLINK_DISABLED: "SSO 連携を解除する前に、既存アカウントを連携してください。",
  SSO_TARGET_ALREADY_BOUND: "既存アカウントは既に別の SSO アカウントに連携されています。",
  TEMPLATE_NOT_FOUND: "予算テンプレートがありません。先にテンプレートデータを初期化してください。",
  UNAUTHENTICATED: "先にサインインしてください。",
  USER_NOT_FOUND: "ユーザーが存在しないか、削除されています。",
  USERNAME_ALREADY_EXISTS: "このユーザー名は既に登録されています。",
  VALIDATION_ERROR: "入力内容が無効です。",
} satisfies Record<string, string>;
