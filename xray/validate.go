package xray

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"time"
)

// ValidateConfig uses the installed core, not the old Go statistics client schema.
// The temporary file contains credentials and is always removed.
func ValidateConfig(config *Config) error {
	data, err := json.Marshal(config)
	if err != nil {
		return fmt.Errorf("配置不是有效 JSON: %w", err)
	}
	f, err := os.CreateTemp("bin", ".validate-*.json")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	if _, err = f.Write(data); err != nil {
		f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	// Unlike run -test, conversion does not instantiate a TUN device or alter
	// system routes. It still invokes the installed core's config Build methods.
	output, err := exec.CommandContext(ctx, GetBinaryPath(), "convert", "pb", "-o", os.DevNull, f.Name()).CombinedOutput()
	if ctx.Err() != nil {
		return fmt.Errorf("Xray 配置校验超时，原配置未保存")
	}
	if err != nil {
		return fmt.Errorf("Xray 配置校验失败（请确认核心版本和证书路径）: %s: %w", output, err)
	}
	return nil
}
