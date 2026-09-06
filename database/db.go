package database

import (
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"io/fs"
	"os"
	"path"
	"x-ui/config"
	"x-ui/database/model"
)

var db *gorm.DB

func initUser() error {
	err := db.AutoMigrate(&model.User{})
	if err != nil {
		return err
	}
	var count int64
	err = db.Model(&model.User{}).Count(&count).Error
	if err != nil {
		return err
	}
	if count == 0 {
		user := &model.User{
			Username: "admin",
			Password: "admin",
		}
		return db.Create(user).Error
	}
	return nil
}

func initInbound() error {
	if db.Migrator().HasTable(&model.Inbound{}) {
		columns, err := db.Migrator().ColumnTypes(&model.Inbound{})
		if err != nil {
			return err
		}
		for _, column := range columns {
			if unique, _ := column.Unique(); column.Name() == "port" && unique {
				if err := db.Migrator().AlterColumn(&model.Inbound{}, "Port"); err != nil {
					return err
				}
			}
		}
	}
	// Original x-ui created a named UNIQUE constraint on port. TUN has no port.
	if db.Migrator().HasConstraint(&model.Inbound{}, "uni_inbounds_port") {
		if err := db.Migrator().DropConstraint(&model.Inbound{}, "uni_inbounds_port"); err != nil {
			return err
		}
	}
	return db.AutoMigrate(&model.Inbound{})
}

func initSetting() error {
	return db.AutoMigrate(&model.Setting{})
}

func InitDB(dbPath string) error {
	dir := path.Dir(dbPath)
	err := os.MkdirAll(dir, fs.ModeDir)
	if err != nil {
		return err
	}

	var gormLogger logger.Interface

	if config.IsDebug() {
		gormLogger = logger.Default
	} else {
		gormLogger = logger.Discard
	}

	c := &gorm.Config{
		Logger: gormLogger,
	}
	db, err = gorm.Open(sqlite.Open(dbPath), c)
	if err != nil {
		return err
	}

	err = initUser()
	if err != nil {
		return err
	}
	err = initInbound()
	if err != nil {
		return err
	}
	err = initSetting()
	if err != nil {
		return err
	}

	return nil
}

func GetDB() *gorm.DB {
	return db
}

func IsNotFound(err error) bool {
	return err == gorm.ErrRecordNotFound
}
