SET NAMES utf8mb4;

INSERT INTO budget_templates (
  workspace_id,
  user_id,
  scope_key,
  name,
  template_key,
  style_json,
  structure_json,
  is_default
)
VALUES (
  NULL,
  NULL,
  'global',
  'Personal Living Budget',
  'personal_living_budget',
  JSON_OBJECT(
    'titleFont', 'TimesNewRoman',
    'monoFont', 'SF-Mono',
    'cjkFont', 'TCSongti',
    'titleSize', '14pt',
    'tableBodySize', '7.5pt',
    'tableTitleSize', '10.5pt',
    'sectionHeaderBg', '#A4A4A4',
    'columnHeaderBg', '#D7D7D7'
  ),
  JSON_OBJECT(
    'titleTemplate', '{{budget_title}}',
    'subtitleTemplate', '{{owner_name}}',
    'sections', JSON_ARRAY(
      JSON_OBJECT(
        'key', 'budget_highlights',
        'title', 'Budget Highlights',
        'columns', JSON_ARRAY(
          JSON_OBJECT('key', 'category', 'label', 'Category', 'align', 'left', 'widthPercent', 40, 'dataType', 'text'),
          JSON_OBJECT('key', 'budget', 'label', 'Budget', 'align', 'right', 'widthPercent', 20, 'dataType', 'money'),
          JSON_OBJECT('key', 'estimated_actuals', 'label', 'Estimated Actuals', 'align', 'right', 'widthPercent', 20, 'dataType', 'money'),
          JSON_OBJECT('key', 'variance', 'label', 'Variance', 'align', 'right', 'widthPercent', 20, 'dataType', 'money')
        )
      ),
      JSON_OBJECT(
        'key', 'transaction_breakdown',
        'title', 'Transaction Breakdown',
        'columns', JSON_ARRAY(
          JSON_OBJECT('key', 'transaction_details', 'label', 'Transaction Details', 'align', 'left', 'widthPercent', 40, 'dataType', 'text'),
          JSON_OBJECT('key', 'category', 'label', 'Category', 'align', 'right', 'widthPercent', 20, 'dataType', 'text'),
          JSON_OBJECT('key', 'amount', 'label', 'Amount', 'align', 'right', 'widthPercent', 20, 'dataType', 'money'),
          JSON_OBJECT('key', 'remark', 'label', 'Remark', 'align', 'right', 'widthPercent', 20, 'dataType', 'text')
        )
      )
    )
  ),
  1
)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  style_json = VALUES(style_json),
  structure_json = VALUES(structure_json),
  is_default = VALUES(is_default);
