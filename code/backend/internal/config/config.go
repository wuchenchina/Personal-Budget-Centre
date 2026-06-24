package config

import (
	"bufio"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type Config struct {
	AppEnv        string
	AppKey        string
	AppURL        string
	APIURL        string
	ListenAddr    string
	DatabaseDir   string
	FontDir       string
	ExportDir     string
	ExportTempDir string
	ExportKeep    int
	ChromeBin     string
	AppLogFile    string
	SessionCookie string

	DBHost     string
	DBPort     int
	DBName     string
	DBUser     string
	DBPassword string

	SMTPHost     string
	SMTPPort     int
	SMTPUsername string
	SMTPPassword string
	MailFrom     string
	MailFromName string

	CasdoorServerURL    string
	CasdoorClientID     string
	CasdoorRedirectURI  string
	CasdoorClientSecret string

	WebAuthnRPID   string
	WebAuthnRPName string
	WebAuthnOrigin string
}

func Load() Config {
	loadDotEnv(".env")
	loadDotEnv(filepath.Join("..", ".env"))
	loadDotEnv(filepath.Join("..", "..", ".env"))

	fontDir := env("FONT_DIR", "")
	if fontDir == "" {
		fontDir = defaultFontDir()
	}

	return Config{
		AppEnv:        env("APP_ENV", "production"),
		AppKey:        env("APP_KEY", ""),
		AppURL:        env("APP_URL", "https://bc.tool.axchen.top"),
		APIURL:        env("API_URL", "https://bc.tool.axchen.top"),
		ListenAddr:    env("LISTEN_ADDR", ":8080"),
		DatabaseDir:   env("DATABASE_DIR", "/app/database"),
		FontDir:       fontDir,
		ExportDir:     env("EXPORT_STORAGE_DIR", "/app/storage/exports"),
		ExportTempDir: env("EXPORT_TEMP_DIR", env("PDF_TEMP_DIR", "/app/storage/tmp/pdf")),
		ExportKeep:    envInt("EXPORT_RETENTION_PER_BUDGET", 3),
		ChromeBin:     env("CHROME_BIN", "chromium"),
		AppLogFile:    env("APP_LOG_FILE", "/app/storage/logs/app.log"),
		SessionCookie: env("SESSION_COOKIE", "budgetcentre_session"),

		DBHost:     env("DB_HOST", "172.17.0.1"),
		DBPort:     envInt("DB_PORT", 3306),
		DBName:     env("DB_NAME", ""),
		DBUser:     env("DB_USER", ""),
		DBPassword: env("DB_PASSWORD", ""),

		SMTPHost:     env("SMTP_HOST", ""),
		SMTPPort:     envInt("SMTP_PORT", 465),
		SMTPUsername: env("SMTP_USERNAME", ""),
		SMTPPassword: env("SMTP_PASSWORD", ""),
		MailFrom:     env("MAIL_FROM", env("SMTP_USERNAME", "")),
		MailFromName: env("MAIL_FROM_NAME", "BudgetCentre"),

		CasdoorServerURL:    env("CASDOOR_SERVER_URL", "https://sso.axchen.top"),
		CasdoorClientID:     env("CASDOOR_CLIENT_ID", "3e4912a22fdbce3dd6ca"),
		CasdoorRedirectURI:  env("CASDOOR_REDIRECT_URI", "https://bc.tool.axchen.top/api/callback"),
		CasdoorClientSecret: env("CASDOOR_CLIENT_SECRET", ""),

		WebAuthnRPID:   env("WEBAUTHN_RP_ID", "bc.tool.axchen.top"),
		WebAuthnRPName: env("WEBAUTHN_RP_NAME", "BudgetCentre"),
		WebAuthnOrigin: env("WEBAUTHN_ORIGIN", "https://bc.tool.axchen.top"),
	}
}

func defaultFontDir() string {
	candidates := []string{"/app/font"}
	if wd, err := os.Getwd(); err == nil {
		candidates = append(candidates,
			filepath.Join(wd, "code", "font"),
			filepath.Join(wd, "font"),
			filepath.Join(wd, "..", "font"),
			filepath.Join(wd, "..", "code", "font"),
			filepath.Join(wd, "..", "..", "code", "font"),
		)
	}
	for _, candidate := range candidates {
		if hasPDFFonts(candidate) {
			return candidate
		}
	}
	return "/app/font"
}

func hasPDFFonts(dir string) bool {
	for _, file := range []string{
		"Arial.ttf",
		"Arial Bold.ttf",
		"PingFang.ttc",
		"Songti.ttc",
		"Songti-TC-Regular.ttf",
		"Songti-TC-Bold.ttf",
	} {
		if info, err := os.Stat(filepath.Join(dir, file)); err != nil || info.IsDir() {
			return false
		}
	}
	return true
}

func loadDotEnv(path string) {
	file, err := os.Open(path)
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.Trim(strings.TrimSpace(value), `"'`)
		if key != "" {
			_ = os.Setenv(key, value)
		}
	}
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func envInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}
