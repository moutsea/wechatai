// Package config reads deployment configuration without logging credentials.
package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type Config struct {
	Standby                                             bool
	CloudOrigin, CloudAppID, CloudTenantID, CloudAppKey string
	GrokDispatchSecret                                  string
	AppURL                                              string
	PublicSiteURL                                       string
	Listen                                              string
	DataDir                                             string
	RPCSecret                                           string
	EncryptionKey                                       string
	CallbackKeyVersion                                  string
	CallbackKeys                                        map[string]string
	MaxOpenAccounts                                     int
	FreeDailyUnits                                      int64
	PlusDailyUnits                                      int64
}

// DataDirectory keeps systemd's state directory and local development defaults
// separate. Both the service and release preflight call this resolver.
func DataDirectory() string {
	if dir := os.Getenv("WECHATAI_DATA_DIR"); dir != "" {
		return dir
	}
	if dir := os.Getenv("STATE_DIRECTORY"); dir != "" {
		return filepath.Join(dir, "accounts")
	}
	return "./data/accounts"
}

type DeploymentSettings struct {
	Standby      bool   `json:"standby"`
	DataDir      string `json:"dataDir"`
	HealthOrigin string `json:"healthOrigin"`
}

func (c Config) DeploymentSettings() (DeploymentSettings, error) {
	dir, err := filepath.Abs(c.DataDir)
	if err != nil {
		return DeploymentSettings{}, err
	}
	host, port, err := net.SplitHostPort(c.Listen)
	if err != nil {
		return DeploymentSettings{}, err
	}
	n, err := strconv.Atoi(port)
	if err != nil || n < 1 || n > 65535 {
		return DeploymentSettings{}, errors.New("VPS deployment requires a fixed numeric port in WECHATAI_LISTEN")
	}
	// A wildcard accepts local requests but is not a destination address.
	switch host {
	case "", "0.0.0.0":
		host = "127.0.0.1"
	case "::":
		host = "::1"
	}
	origin := url.URL{Scheme: "http", Host: net.JoinHostPort(host, port)}
	return DeploymentSettings{Standby: c.Standby, DataDir: dir, HealthOrigin: origin.String()}, nil
}

func Load() (Config, error) {
	c := Config{PublicSiteURL: os.Getenv("PUBLIC_SITE_URL"), AppURL: os.Getenv("APP_URL"), Listen: os.Getenv("WECHATAI_LISTEN"), DataDir: DataDirectory(), MaxOpenAccounts: 32, FreeDailyUnits: 100000, PlusDailyUnits: 1000000}
	if c.Listen == "" {
		c.Listen = "127.0.0.1:8088"
	}
	host, _, err := net.SplitHostPort(c.Listen)
	if err != nil {
		return c, errors.New("invalid WECHATAI_LISTEN")
	}
	c.GrokDispatchSecret, err = secretValue("GROK_DISPATCH_SECRET")
	if err != nil {
		return c, err
	}
	c.GrokDispatchSecret = strings.TrimSpace(c.GrokDispatchSecret)
	if c.GrokDispatchSecret != "" && len(c.GrokDispatchSecret) < 32 {
		return c, errors.New("GROK_DISPATCH_SECRET must contain at least 32 bytes")
	}
	switch os.Getenv("WECHATAI_DEPLOY_MODE") {
	case "", "accounts":
	case "standby":
		if !net.ParseIP(host).IsLoopback() {
			return c, errors.New("standby must listen on a loopback IP")
		}
		c.Standby = true
		return c, nil
	default:
		return c, errors.New("invalid WECHATAI_DEPLOY_MODE")
	}
	if value := os.Getenv("WECHATAI_MAX_OPEN_ACCOUNTS"); value != "" {
		n, err := strconv.Atoi(value)
		if err != nil || n < 1 || n > 1024 {
			return c, errors.New("WECHATAI_MAX_OPEN_ACCOUNTS must be 1–1024")
		}
		c.MaxOpenAccounts = n
	}
	if c.RPCSecret, err = readSecret("WECHATAI_RPC_SECRET"); err != nil {
		return c, err
	}
	if c.EncryptionKey, err = readSecret("ENCRYPTION_KEY"); err != nil {
		return c, err
	}
	c.CloudOrigin = strings.TrimRight(strings.TrimSpace(os.Getenv("AGT_ORIGIN")), "/")
	c.CloudAppID = strings.TrimSpace(os.Getenv("AGT_APP_ID"))
	c.CloudTenantID = strings.TrimSpace(os.Getenv("AGT_TENANT_ID"))
	if c.CloudAppKey, err = secretValue("AGT_APP_KEY"); err != nil {
		return c, err
	}
	c.CloudAppKey = strings.TrimSpace(c.CloudAppKey)
	c.CallbackKeyVersion = strings.TrimSpace(os.Getenv("AGT_CALLBACK_KEY_VERSION"))
	ring, err := secretValue("AGT_CALLBACK_KEYS")
	if err != nil {
		return c, err
	}
	if strings.TrimSpace(ring) != "" {
		if json.Unmarshal([]byte(ring), &c.CallbackKeys) != nil || c.CallbackKeys == nil {
			return c, errors.New("invalid AGT_CALLBACK_KEYS")
		}
	}
	for _, entry := range []struct {
		name   string
		target *int64
	}{{"FREE_DAILY_CREDITS", &c.FreeDailyUnits}, {"PLUS_DAILY_CREDITS", &c.PlusDailyUnits}} {
		if value := os.Getenv(entry.name); value != "" {
			n, err := strconv.ParseFloat(value, 64)
			if err != nil || math.IsNaN(n) || math.IsInf(n, 0) || n < 0 || n > 9007199254740 {
				return c, fmt.Errorf("invalid %s", entry.name)
			}
			*entry.target = int64(math.Round(n * 1000))
		}
	}
	return c, nil
}

func secretValue(name string) (string, error) {
	value, path := os.Getenv(name), os.Getenv(name+"_FILE")
	if value != "" && path != "" {
		return "", fmt.Errorf("configure either %s or %s_FILE", name, name)
	}
	if path != "" {
		data, err := os.ReadFile(path)
		if err != nil {
			return "", fmt.Errorf("read %s_FILE: %w", name, err)
		}
		value = string(data)
	}
	return value, nil
}
func readSecret(name string) (string, error) {
	value, err := secretValue(name)
	if err != nil {
		return "", err
	}
	// Match ECMAScript String.trim() used by the existing Worker before AES
	// key derivation. RPC signing uses the configured bytes verbatim.
	if name == "ENCRYPTION_KEY" {
		value = strings.Trim(value, " \t\n\r\v\f\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff")
	}
	switch strings.TrimSpace(value) {
	case "REPLACE_WITH_A_SEPARATE_RANDOM_RPC_SECRET", "REPLACE_WITH_THE_EXISTING_ENCRYPTION_KEY":
		return "", fmt.Errorf("replace the example value for %s", name)
	}
	if len(value) < 32 || strings.TrimSpace(value) == "" {
		return "", fmt.Errorf("%s must contain at least 32 bytes", name)
	}
	return value, nil
}
