package service

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"x-ui/database/model"
	"x-ui/xray"
)

var inboundProtocols = map[string]bool{
	"vmess": true, "vless": true, "trojan": true, "shadowsocks": true,
	"dokodemo-door": true, "tunnel": true, "socks": true, "mixed": true,
	"http": true, "wireguard": true, "hysteria": true, "tun": true,
}

func validateInboundShape(inbound *model.Inbound) error {
	protocol := strings.ToLower(string(inbound.Protocol))
	if !inboundProtocols[protocol] {
		return fmt.Errorf("不支持的入站协议: %s", protocol)
	}
	inbound.Protocol = model.Protocol(protocol)
	if protocol == "tun" {
		inbound.Port = 0
	} else if inbound.Port < 1 || inbound.Port > 65535 {
		return fmt.Errorf("端口必须为 1–65535")
	}
	if inbound.Total < 0 || inbound.ExpiryTime < 0 {
		return fmt.Errorf("流量与到期时间不能为负数")
	}
	for _, field := range []struct {
		name  string
		value *string
	}{
		{"settings", &inbound.Settings}, {"streamSettings", &inbound.StreamSettings}, {"sniffing", &inbound.Sniffing},
	} {
		if *field.value == "" {
			*field.value = "{}"
		}
		var obj map[string]json.RawMessage
		if err := json.Unmarshal([]byte(*field.value), &obj); err != nil || obj == nil {
			return fmt.Errorf("%s 必须是有效的 JSON 对象", field.name)
		}
	}
	return nil
}

func (s *InboundService) validateWithCore(inbound *model.Inbound) error {
	// Disabled legacy entries must remain editable/disableable during migration.
	if !inbound.Enable {
		return nil
	}
	service := XrayService{}
	config, err := service.GetXrayConfig()
	if err != nil {
		return err
	}
	all, err := s.GetAllInbounds()
	if err != nil {
		return err
	}
	oldTag := ""
	for _, old := range all {
		if old.Id == inbound.Id && inbound.Id != 0 {
			oldTag = old.Tag
		}
	}
	filtered := make([]xray.InboundConfig, 0, len(config.InboundConfigs)+1)
	for _, old := range config.InboundConfigs {
		if oldTag == "" || old.Tag != oldTag {
			filtered = append(filtered, old)
		}
	}
	config.InboundConfigs = append(filtered, *inbound.GenXrayInboundConfig())
	return xray.ValidateConfig(config)
}

func inboundTag(inbound *model.Inbound) (string, error) {
	if inbound.Protocol != "tun" {
		return fmt.Sprintf("inbound-%d", inbound.Port), nil
	}
	var id [12]byte
	if _, err := rand.Read(id[:]); err != nil {
		return "", err
	}
	return "inbound-tun-" + hex.EncodeToString(id[:]), nil
}
