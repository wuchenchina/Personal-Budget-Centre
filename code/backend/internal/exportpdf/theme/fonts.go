package theme

func pingFangFontFile(family string, weight string) string {
	style := "Regular"
	switch weight {
	case "500":
		style = "Medium"
	case "600", "700":
		style = "Semibold"
	}

	if family == "PingFang SC" {
		return "PingFang-SC-" + style + ".ttf"
	}

	return "PingFang-HK-" + style + ".ttf"
}

func songtiSCFontFile(weight string) string {
	if weight == "700" {
		return "Songti-SC-Bold.ttf"
	}

	return "Songti-SC-Regular.ttf"
}
