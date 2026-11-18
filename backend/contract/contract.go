// Package contract is shared with the Cloudflare edge through contract.json.
// Readiness covers individual API actions and background/streaming features,
// not just the existence of an umbrella "api" RPC method.
package contract

import (
	"embed"
	"encoding/json"
	"slices"
)

//go:embed contract.json
var files embed.FS

type Limits struct {
	CommandBytes   int64 `json:"commandBytes"`
	ExecutionBytes int   `json:"executionBytes"`
}

var PayloadLimits = Load().Limits

type Contract struct {
	ReferralCredits int64    `json:"referralCredits"`
	Limits          Limits   `json:"limits"`
	Protocol        string   `json:"protocol"`
	Methods         []string `json:"methods"`
	Actions         []string `json:"actions"`
	Streams         []string `json:"streams"`
	Runtime         []string `json:"runtime"`
}

func Load() Contract {
	data, err := files.ReadFile("contract.json")
	if err != nil {
		panic(err)
	}
	var c Contract
	if err := json.Unmarshal(data, &c); err != nil {
		panic(err)
	}
	return c
}

func Required() []string {
	c := Load()
	result := slices.Clone(c.Methods)
	for _, v := range c.Actions {
		result = append(result, "api:"+v)
	}
	for _, v := range c.Streams {
		result = append(result, "stream:"+v)
	}
	for _, v := range c.Runtime {
		result = append(result, "runtime:"+v)
	}
	slices.Sort(result)
	return result
}

func Missing(available []string) []string {
	missing := []string{}
	for _, required := range Required() {
		if !slices.Contains(available, required) {
			missing = append(missing, required)
		}
	}
	return missing
}

// A provider reports the handlers registered by its own module.
type Provider interface{ Capabilities() []string }

type Providers struct {
	Methods, Actions, Streams, Runtime []Provider
}

func (p Providers) Capabilities() []string {
	var result []string
	for prefix, sources := range map[string][]Provider{"": p.Methods, "api:": p.Actions, "stream:": p.Streams, "runtime:": p.Runtime} {
		for _, source := range sources {
			for _, name := range source.Capabilities() {
				result = append(result, prefix+name)
			}
		}
	}
	slices.Sort(result)
	return slices.Compact(result)
}
