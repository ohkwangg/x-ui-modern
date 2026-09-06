package sys

import "github.com/shirou/gopsutil/net"

func GetTCPCount() (int, error) {
	connections, err := net.Connections("tcp")
	return len(connections), err
}

func GetUDPCount() (int, error) {
	connections, err := net.Connections("udp")
	return len(connections), err
}
