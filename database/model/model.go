package model

import (
	"crypto/ecdh"
	"encoding/base64"
	"encoding/json"
	"x-ui/util/json_util"
	"x-ui/xray"
)

type Protocol string

const (
	VMess       Protocol = "vmess"
	VLESS       Protocol = "vless"
	Dokodemo    Protocol = "Dokodemo-door"
	Http        Protocol = "http"
	Trojan      Protocol = "trojan"
	Shadowsocks Protocol = "shadowsocks"
)

type User struct {
	Id       int    `json:"id" gorm:"primaryKey;autoIncrement"`
	Username string `json:"username"`
	Password string `json:"password"`
}

type Inbound struct {
	SharePublicKey string `json:"sharePublicKey,omitempty" gorm:"-"`
	Id             int    `json:"id" form:"id" gorm:"primaryKey;autoIncrement"`
	UserId         int    `json:"-"`
	Up             int64  `json:"up" form:"up"`
	Down           int64  `json:"down" form:"down"`
	Total          int64  `json:"total" form:"total"`
	Remark         string `json:"remark" form:"remark"`
	Enable         bool   `json:"enable" form:"enable"`
	ExpiryTime     int64  `json:"expiryTime" form:"expiryTime"`

	// config part
	Listen         string   `json:"listen" form:"listen"`
	Port           int      `json:"port" form:"port"`
	Protocol       Protocol `json:"protocol" form:"protocol"`
	Settings       string   `json:"settings" form:"settings"`
	StreamSettings string   `json:"streamSettings" form:"streamSettings"`
	Tag            string   `json:"tag" form:"tag" gorm:"unique"`
	Sniffing       string   `json:"sniffing" form:"sniffing"`
}

func (i *Inbound) SetSharePublicKey() {
	var stream struct {
		Reality struct {
			PrivateKey string `json:"privateKey"`
		} `json:"realitySettings"`
	}
	if json.Unmarshal([]byte(i.StreamSettings), &stream) != nil {
		return
	}
	data, err := base64.RawURLEncoding.DecodeString(stream.Reality.PrivateKey)
	if err != nil {
		return
	}
	key, err := ecdh.X25519().NewPrivateKey(data)
	if err == nil {
		i.SharePublicKey = base64.RawURLEncoding.EncodeToString(key.PublicKey().Bytes())
	}
}

func (i *Inbound) GenXrayInboundConfig() *xray.InboundConfig {
	listen := i.Listen
	if listen != "" {
		encoded, _ := json.Marshal(listen)
		listen = string(encoded)
	}
	return &xray.InboundConfig{
		Listen:         json_util.RawMessage(listen),
		Port:           i.Port,
		Protocol:       string(i.Protocol),
		Settings:       json_util.RawMessage(i.Settings),
		StreamSettings: json_util.RawMessage(i.StreamSettings),
		Tag:            i.Tag,
		Sniffing:       json_util.RawMessage(i.Sniffing),
	}
}

type Setting struct {
	Id    int    `json:"id" form:"id" gorm:"primaryKey;autoIncrement"`
	Key   string `json:"key" form:"key"`
	Value string `json:"value" form:"value"`
}
