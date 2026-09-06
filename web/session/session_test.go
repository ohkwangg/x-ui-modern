package session

import (
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"x-ui/database/model"
)

func TestLoginCookieRoundTrip(t *testing.T) {
	for _, scheme := range []string{"http", "https"} {
		t.Run(scheme, func(t *testing.T) {
			r := gin.New()
			r.Use(sessions.Sessions("session", cookie.NewStore([]byte("01234567890123456789012345678901"))))
			r.POST("/login", func(c *gin.Context) {
				if err := SetLoginUser(c, &model.User{Id: 1, Username: "test"}); err != nil {
					t.Fatal(err)
				}
			})
			r.GET("/xui/", func(c *gin.Context) {
				if !IsLogin(c) {
					c.Status(http.StatusUnauthorized)
					return
				}
				c.Status(http.StatusOK)
			})
			r.GET("/logout", func(c *gin.Context) { ClearSession(c) })
			base, _ := url.Parse(scheme + "://panel.example.com/")
			jar, _ := cookiejar.New(nil)
			login := httptest.NewRecorder()
			r.ServeHTTP(login, httptest.NewRequest("POST", base.String()+"login", nil))
			cookies := login.Result().Cookies()
			if len(cookies) != 1 {
				t.Fatalf("expected session cookie, got %v", cookies)
			}
			if cookies[0].Secure != (scheme == "https") || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteLaxMode {
				t.Fatalf("incorrect cookie attributes: %s", cookies[0])
			}
			jar.SetCookies(base, cookies)
			request := func(path string) *httptest.ResponseRecorder {
				req := httptest.NewRequest("GET", base.String()+path, nil)
				for _, ck := range jar.Cookies(base) {
					req.AddCookie(ck)
				}
				res := httptest.NewRecorder()
				r.ServeHTTP(res, req)
				jar.SetCookies(base, res.Result().Cookies())
				return res
			}
			if res := request("xui/"); res.Code != http.StatusOK {
				t.Fatalf("login lost on navigation: %d", res.Code)
			}
			request("logout")
			if res := request("xui/"); res.Code != http.StatusUnauthorized {
				t.Fatal("logout did not clear session")
			}
		})
	}
}
