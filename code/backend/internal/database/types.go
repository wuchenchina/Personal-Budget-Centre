package database

type MigrationStatus struct {
	Connected bool               `json:"connected"`
	Database  string             `json:"database"`
	CoreReady bool               `json:"coreReady"`
	Applied   []AppliedMigration `json:"applied"`
	Pending   []PendingMigration `json:"pending"`
}

type AppliedMigration struct {
	Version   string `json:"version"`
	Filename  string `json:"filename"`
	Checksum  string `json:"checksum"`
	AppliedAt string `json:"appliedAt"`
}

type PendingMigration struct {
	Version  string `json:"version"`
	Filename string `json:"filename"`
	Checksum string `json:"checksum"`
}

type migrationFile struct {
	Version  string
	Name     string
	Path     string
	Checksum string
	Content  string
}
