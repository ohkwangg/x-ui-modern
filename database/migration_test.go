package database

import (
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"path/filepath"
	"testing"
	"x-ui/database/model"
)

func TestOldPortUniqueMigrationPreservesRows(t *testing.T) {
	var err error
	db, err = gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "old.db")), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	connection, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer connection.Close()
	if err = db.Exec("CREATE TABLE inbounds (id integer PRIMARY KEY, port integer UNIQUE, tag text UNIQUE, settings text, remark text)").Error; err != nil {
		t.Fatal(err)
	}
	if err = db.Exec(`INSERT INTO inbounds (id,port,tag,settings,remark) VALUES (1,443,'inbound-443','{"future":true}','旧配置')`).Error; err != nil {
		t.Fatal(err)
	}
	if err = initInbound(); err != nil {
		t.Fatal(err)
	}
	var old model.Inbound
	if err = db.First(&old, 1).Error; err != nil {
		t.Fatal(err)
	}
	if old.Remark != "旧配置" || old.Settings != `{"future":true}` {
		t.Fatalf("migration changed row: %+v", old)
	}
	for _, tag := range []string{"tun-one", "tun-two"} {
		if err = db.Create(&model.Inbound{Protocol: "tun", Port: 0, Tag: tag, Settings: "{}"}).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err = initInbound(); err != nil {
		t.Fatal("second migration", err)
	}
}
