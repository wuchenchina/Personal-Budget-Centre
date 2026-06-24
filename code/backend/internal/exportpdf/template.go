package exportpdf

import (
	"encoding/json"
)

type Template struct {
	TitleTemplate    string
	SubtitleTemplate string
	Sections         []Section
}

type Section struct {
	Key     string
	Title   string
	Columns []Column
}

type Column struct {
	Key          string
	Label        string
	Align        string
	WidthPercent float64
	DataType     string
}

func TemplateKey(budget map[string]any) string {
	key := "personal_living_budget"
	if templateMap, ok := budget["template"].(map[string]any); ok {
		if templateKey := stringValue(templateMap["key"]); templateKey != "" {
			key = templateKey
		}
	}
	return key
}

func TemplateFromJSON(raw string) Template {
	template := DefaultTemplate()
	if raw == "" {
		return template
	}
	var decoded map[string]any
	if json.Unmarshal([]byte(raw), &decoded) == nil {
		template = TemplateFromMap(decoded)
	}
	return template
}

func TemplateFromMap(raw map[string]any) Template {
	template := DefaultTemplate()
	if title := stringValue(raw["titleTemplate"]); title != "" {
		template.TitleTemplate = title
	}
	if subtitle := stringValue(raw["subtitleTemplate"]); subtitle != "" {
		template.SubtitleTemplate = subtitle
	}
	sections, ok := raw["sections"].([]any)
	if !ok {
		return template
	}
	out := []Section{}
	for _, item := range sections {
		sectionMap, ok := item.(map[string]any)
		if !ok {
			continue
		}
		section := Section{
			Key:   stringValue(sectionMap["key"]),
			Title: stringValue(sectionMap["title"]),
		}
		for _, columnItem := range anyList(sectionMap["columns"]) {
			columnMap, ok := columnItem.(map[string]any)
			if !ok {
				continue
			}
			width := floatValue(columnMap["widthPercent"])
			if width <= 0 {
				width = 25
			}
			section.Columns = append(section.Columns, Column{
				Key:          stringValue(columnMap["key"]),
				Label:        stringValue(columnMap["label"]),
				Align:        enumString(stringValue(columnMap["align"]), []string{"left", "right", "center"}, "left"),
				WidthPercent: width,
				DataType:     enumString(stringValue(columnMap["dataType"]), []string{"text", "money", "date", "currency", "rate", "code"}, "text"),
			})
		}
		if section.Key != "" && section.Title != "" && len(section.Columns) > 0 {
			out = append(out, section)
		}
	}
	if len(out) > 0 {
		template.Sections = out
	}
	return template
}

func DefaultTemplate() Template {
	return Template{
		TitleTemplate:    "{{budget_title}}",
		SubtitleTemplate: "{{owner_name}}",
		Sections: []Section{
			{
				Key:   "budget_highlights",
				Title: "Budget Highlights",
				Columns: []Column{
					{Key: "category", Label: "Category", Align: "left", WidthPercent: 40, DataType: "text"},
					{Key: "budget", Label: "Budget", Align: "right", WidthPercent: 20, DataType: "money"},
					{Key: "estimated_actuals", Label: "Estimated Actuals", Align: "right", WidthPercent: 20, DataType: "money"},
					{Key: "variance", Label: "Variance", Align: "right", WidthPercent: 20, DataType: "money"},
				},
			},
			{
				Key:   "transaction_breakdown",
				Title: "Transaction Breakdown",
				Columns: []Column{
					{Key: "transaction_details", Label: "Transaction Details", Align: "left", WidthPercent: 40, DataType: "text"},
					{Key: "category", Label: "Category", Align: "right", WidthPercent: 20, DataType: "text"},
					{Key: "amount", Label: "Amount", Align: "right", WidthPercent: 20, DataType: "money"},
					{Key: "remark", Label: "Remark", Align: "right", WidthPercent: 20, DataType: "text"},
				},
			},
			{
				Key:   "installments",
				Title: "Installments",
				Columns: []Column{
					{Key: "sequence", Label: "No.", Align: "center", WidthPercent: 4, DataType: "text"},
					{Key: "category", Label: "Category", Align: "left", WidthPercent: 15, DataType: "text"},
					{Key: "period", Label: "Period", Align: "left", WidthPercent: 15, DataType: "text"},
					{Key: "target_amount", Label: "Target", Align: "right", WidthPercent: 16, DataType: "money"},
					{Key: "period_amount", Label: "Amount", Align: "right", WidthPercent: 19, DataType: "money"},
					{Key: "progress", Label: "Done", Align: "center", WidthPercent: 5, DataType: "text"},
					{Key: "remark", Label: "Remark", Align: "right", WidthPercent: 26, DataType: "text"},
				},
			},
		},
	}
}
