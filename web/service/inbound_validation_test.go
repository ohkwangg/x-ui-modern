package service

import (
	"encoding/json"
	"testing"
	"x-ui/database/model"
)

func TestInboundShapeAndTunTags(t *testing.T) {
	for protocol := range inboundProtocols {
		in := &model.Inbound{Protocol: model.Protocol(protocol), Port: 12345, Settings: `{"future":{"nested":1}}`}
		if err := validateInboundShape(in); err != nil {
			t.Fatal(protocol, err)
		}
		data, err := json.Marshal(in.GenXrayInboundConfig())
		if err != nil {
			t.Fatal(err)
		}
		var config map[string]interface{}
		if err = json.Unmarshal(data, &config); err != nil {
			t.Fatal(err)
		}
		if protocol == "tun" {
			if _, ok := config["port"]; ok {
				t.Fatal("TUN must not emit port")
			}
		}
	}
	for _, settings := range []string{"[]", "null", "{invalid"} {
		if validateInboundShape(&model.Inbound{Protocol: "vless", Port: 443, Settings: settings}) == nil {
			t.Fatal("accepted", settings)
		}
	}
	in := &model.Inbound{Protocol: "tun"}
	a, _ := inboundTag(in)
	b, _ := inboundTag(in)
	if a == b {
		t.Fatal("TUN tags collide")
	}
	if validateInboundShape(&model.Inbound{Protocol: "freedom", Port: 443}) == nil {
		t.Fatal("accepted outbound-only protocol")
	}
}
