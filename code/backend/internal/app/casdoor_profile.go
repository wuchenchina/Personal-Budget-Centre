package app

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
)

func normalizeCasdoorUserinfo(decoded map[string]any) (map[string]any, error) {
	if status := stringValue(decoded["status"]); status != "" && status != "ok" {
		return nil, apiError("CASDOOR_CALLBACK_REJECTED", stringDefault(stringValue(decoded["msg"]), "Casdoor callback was rejected."), http.StatusBadGateway)
	}
	for _, key := range []string{"", "data", "user", "userinfo"} {
		var candidate any = decoded
		if key != "" {
			candidate = decoded[key]
		}
		if item, ok := candidate.(map[string]any); ok && stringValue(item["sub"]) != "" {
			return item, nil
		}
	}
	for _, key := range []string{"id_token", "access_token", "token"} {
		if claims := jwtPayload(stringValue(decoded[key])); claims != nil && stringValue(claims["sub"]) != "" {
			for k, v := range decoded {
				if _, ok := claims[k]; !ok {
					claims[k] = v
				}
			}
			return claims, nil
		}
	}
	return nil, apiError("CASDOOR_USERINFO_INVALID", "Casdoor user info is missing subject.", http.StatusBadGateway)
}

func normalizeOAuthUserinfo(decoded map[string]any) (map[string]any, error) {
	for _, key := range []string{"", "data", "user", "userinfo"} {
		var candidate any = decoded
		if key != "" {
			candidate = decoded[key]
		}
		if item, ok := candidate.(map[string]any); ok {
			if normalized := normalizeOAuthUserinfoItem(item); normalized != nil {
				return normalized, nil
			}
		}
	}
	for _, key := range []string{"id_token", "access_token", "token"} {
		if claims := jwtPayload(stringValue(decoded[key])); claims != nil {
			if normalized := normalizeOAuthUserinfoItem(claims); normalized != nil {
				for k, v := range decoded {
					if _, ok := normalized[k]; !ok {
						normalized[k] = v
					}
				}
				return normalized, nil
			}
		}
	}
	return nil, apiError("SSO_USERINFO_INVALID", "SSO user info is missing subject.", http.StatusBadGateway)
}

func normalizeOAuthUserinfoItem(item map[string]any) map[string]any {
	subject := nonEmptyString(item["sub"], item["id"], item["user_id"], item["uid"])
	if subject == "" {
		return nil
	}
	normalized := map[string]any{}
	for key, value := range item {
		normalized[key] = value
	}
	normalized["sub"] = subject
	if stringValue(normalized["preferred_username"]) == "" {
		normalized["preferred_username"] = nonEmptyString(item["username"], item["login"], item["name"])
	}
	if stringValue(normalized["name"]) == "" {
		normalized["name"] = nonEmptyString(item["display_name"], item["displayName"], item["username"], item["login"])
	}
	if stringValue(normalized["picture"]) == "" {
		normalized["picture"] = nonEmptyString(item["picture"], item["avatar_url"], item["avatarUrl"], item["avatar"])
	}
	return normalized
}

func jwtPayload(token string) map[string]any {
	if token == "" {
		return nil
	}
	parts := strings.Split(token, ".")
	if len(parts) < 2 {
		return nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil
	}
	return out
}

func publicCasdoorAccount(subject string, userinfo map[string]any) map[string]any {
	provider := oauthProvider{ID: ssoProviderCasdoor, Name: "Axchen SSO"}
	return publicSSOAccount(provider, subject, userinfo)
}

func publicSSOAccount(provider oauthProvider, subject string, userinfo map[string]any) map[string]any {
	return map[string]any{
		"provider":     provider.ID,
		"providerName": provider.Name,
		"subject":      subject,
		"username":     nullableStringValue(ssoUsername(userinfo)),
		"email":        nullableStringValue(normalizedEmail(userinfo["email"])),
		"displayName":  ssoDisplayName(userinfo),
		"avatarUrl":    nullableStringValue(ssoAvatarURL(userinfo)),
	}
}

func casdoorUsername(userinfo map[string]any) string {
	return ssoUsername(userinfo)
}

func casdoorDisplayName(userinfo map[string]any) string {
	return ssoDisplayName(userinfo)
}

func casdoorAvatarURL(userinfo map[string]any) string {
	return ssoAvatarURL(userinfo)
}

func ssoUsername(userinfo map[string]any) string {
	return nonEmptyString(userinfo["preferred_username"], userinfo["username"], userinfo["login"], userinfo["name"])
}

func ssoDisplayName(userinfo map[string]any) string {
	return nonEmptyDefault(userinfo["displayName"], nonEmptyDefault(userinfo["display_name"], nonEmptyDefault(userinfo["name"], nonEmptyDefault(userinfo["preferred_username"], nonEmptyDefault(userinfo["username"], nonEmptyDefault(userinfo["email"], "SSO User"))))))
}

func ssoAvatarURL(userinfo map[string]any) string {
	for _, key := range []string{"picture", "avatar", "avatarUrl", "avatar_url"} {
		value := stringValue(userinfo[key])
		if len(value) <= 512 && (strings.HasPrefix(value, "http://") || strings.HasPrefix(value, "https://")) {
			return value
		}
	}
	return ""
}
