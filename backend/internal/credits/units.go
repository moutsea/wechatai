package credits

import (
	"errors"
	"time"
)

// Keep the legacy safe-integer boundary when exchanging amounts with JavaScript.
const MaxUnits int64 = 1<<53 - 1
const UnitsPerCredit int64 = 1000
const TokensPerCredit int64 = 5000
const OutputWeight int64 = 8

var ErrInvalidAmount = errors.New("invalid credit amount")
var ErrInsufficient = errors.New("insufficient credits")
var ErrDuplicate = errors.New("reservation already exists")

// TokenUnits rounds once, using integer arithmetic to avoid floating point drift.
func TokenUnits(input, output int64) (int64, error) {
	if input < 0 || output < 0 || input > MaxUnits/UnitsPerCredit || output > MaxUnits/(OutputWeight*UnitsPerCredit) {
		return 0, ErrInvalidAmount
	}
	weighted := input + output*OutputWeight
	if weighted > MaxUnits/UnitsPerCredit {
		return 0, ErrInvalidAmount
	}
	return (weighted*UnitsPerCredit + TokensPerCredit - 1) / TokensPerCredit, nil
}

func DayWindow(now time.Time) (day string, start, end int64) {
	local := now.In(time.FixedZone("Asia/Shanghai", 8*60*60))
	boundary := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, local.Location())
	return boundary.Format("2006-01-02"), boundary.UnixMilli(), boundary.Add(24 * time.Hour).UnixMilli()
}

func validAmount(amount int64) bool { return amount >= 0 && amount <= MaxUnits }
