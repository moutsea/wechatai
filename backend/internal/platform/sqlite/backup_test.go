package sqlite

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"
)

func TestBackupPreservesWALRowsIDsBlobsAndSequence(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	if err := os.Chmod(root, 0700); err != nil {
		t.Fatal(err)
	}
	db, err := Open(ctx, filepath.Join(root, "source.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.ExecContext(ctx, `CREATE TABLE data(id INTEGER PRIMARY KEY AUTOINCREMENT,value BLOB,optional TEXT);INSERT INTO data(id,value) VALUES(7,x'00ff01');INSERT INTO data(id,value) VALUES(100,x'1234');DELETE FROM data WHERE id=100;`); err != nil {
		t.Fatal(err)
	}
	backup := filepath.Join(root, "backup.sqlite")
	info, err := Backup(ctx, db, backup)
	if err != nil {
		t.Fatal(err)
	}
	if info.Bytes == 0 || len(info.SHA256) != 64 {
		t.Fatal("missing backup manifest")
	}
	// A subsequent live write must not change the published snapshot.
	if _, err := db.ExecContext(ctx, `UPDATE data SET value=x'abcd' WHERE id=7`); err != nil {
		t.Fatal(err)
	}
	restored, err := Open(ctx, backup)
	if err != nil {
		t.Fatal(err)
	}
	defer restored.Close()
	var id int64
	var value []byte
	var optional sql.NullString
	if err := restored.QueryRowContext(ctx, `SELECT id,value,optional FROM data`).Scan(&id, &value, &optional); err != nil {
		t.Fatal(err)
	}
	if id != 7 || string(value) != string([]byte{0, 255, 1}) || optional.Valid {
		t.Fatal("backup lost SQLite types or row identity")
	}
	result, err := restored.ExecContext(ctx, `INSERT INTO data(value) VALUES(x'01')`)
	if err != nil {
		t.Fatal(err)
	}
	next, err := result.LastInsertId()
	if err != nil || next != 101 {
		t.Fatalf("AUTOINCREMENT sequence changed: %d %v", next, err)
	}
	if _, err := Backup(ctx, db, backup); !os.IsExist(err) {
		t.Fatalf("existing backup overwritten: %v", err)
	}
	mode, err := os.Stat(backup)
	if err != nil || mode.Mode().Perm() != 0600 {
		t.Fatal("backup not private")
	}
}
