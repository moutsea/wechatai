package receiverwatchdog

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCompleteScanRenewsOnlyAfterCheckingEveryPage(t *testing.T) {
	const a = "00000000-0000-4000-8000-000000000001"
	const b = "00000000-0000-4000-8000-000000000002"
	for _, fault := range []string{"", "local-unreachable", "bad-cursor", "incomplete-list", "recovery-failed"} {
		t.Run("fault="+fault, func(t *testing.T) {
			beats, recoveries, pages := 0, 0, 0
			local := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("Authorization") != "" {
					t.Error("operator secret sent to local endpoint")
				}
				if fault == "local-unreachable" {
					http.Error(w, "offline", 503)
					return
				}
				json.NewEncoder(w).Encode(sessions{Sessions: []string{a}})
			}))
			defer local.Close()
			edge := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("Authorization") != "Bearer fixture" {
					t.Error("missing authentication")
				}
				switch r.URL.Path {
				case route + "/sessions":
					pages++
					if r.URL.Query().Get("after") == "" {
						next := a
						if fault == "bad-cursor" {
							next = b
						}
						json.NewEncoder(w).Encode(sessions{[]string{a}, next})
					} else if fault == "incomplete-list" {
						w.Write([]byte("{}"))
					} else {
						json.NewEncoder(w).Encode(sessions{Sessions: []string{b}})
					}
				case route + "/recover/" + b:
					recoveries++
					if fault == "recovery-failed" {
						http.Error(w, "retry", 503)
						return
					}
					w.Write([]byte(`{"ok":true}`))
				case route + "/heartbeat":
					beats++
					w.Write([]byte(`{"ok":true}`))
				default:
					t.Errorf("unexpected request %s", r.URL.Path)
					http.NotFound(w, r)
				}
			}))
			defer edge.Close()
			s := Supervisor{local.URL, edge.URL, "fixture", edge.Client()}
			err := s.Check(t.Context())
			if fault == "" {
				if err != nil || pages != 2 || recoveries != 1 || beats != 1 {
					t.Fatal(err, pages, recoveries, beats)
				}
			} else if err == nil || beats != 0 {
				t.Fatalf("incomplete scan renewed lease: %v, %d", err, beats)
			}
		})
	}
}
