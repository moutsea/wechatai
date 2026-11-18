package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/moutsea/wechatai/backend/internal/receiverwatchdog"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := receiverwatchdog.Run(ctx); err != nil {
		log.Fatal(err)
	}
}
