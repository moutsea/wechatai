package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
)

// A standby process never opens account SQLite or starts account schedulers.
func checkStandbyDirectory(dir string) error {
	entries, err := os.ReadDir(dir)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if len(entries) != 0 {
		return errors.New("standby requires an empty account directory")
	}
	return nil
}

func standbyHandler() http.Handler {
	mux := http.NewServeMux()
	probe := func(w http.ResponseWriter, r *http.Request) {
		healthy := r.URL.Path == "/healthz"
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		if !healthy {
			w.WriteHeader(http.StatusServiceUnavailable)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": healthy, "version": version, "mode": "standby"})
	}
	mux.HandleFunc("GET /healthz", probe)
	mux.HandleFunc("GET /readyz", probe)
	return mux
}
