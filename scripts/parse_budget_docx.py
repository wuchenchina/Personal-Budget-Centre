#!/usr/bin/env python3
"""Parse personal budget DOCX files into reusable template data.

The parser intentionally uses only the Python standard library. A DOCX file is
just a ZIP archive with WordprocessingML files inside, and the current template
only needs document paragraphs and tables from word/document.xml.
"""

from __future__ import annotations

import argparse
import json
import re
import zipfile
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET


WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": WORD_NS}
W = f"{{{WORD_NS}}}"

MONEY_RE = re.compile(
    r"^\s*([A-Z]{3})\s*([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*$"
)
PERIOD_RE = re.compile(r"^\s*Date:\s*(.*?)\s+to\s+(.*?)\s*$", re.IGNORECASE)
SUBTITLE_RE = re.compile(r"^\((\d{4})\s+(.+?)\)$")


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def text_content(element: ET.Element) -> str:
    parts: list[str] = []
    for node in element.iter():
        name = local_name(node.tag)
        if name == "t" and node.text:
            parts.append(node.text)
        elif name == "tab":
            parts.append("\t")
        elif name in {"br", "cr"}:
            parts.append("\n")
    return "".join(parts).strip()


def attr_value(element: ET.Element | None, attr: str = "val") -> str | None:
    if element is None:
        return None
    return element.get(f"{W}{attr}")


def paragraph_style(paragraph: ET.Element) -> str | None:
    return attr_value(paragraph.find("./w:pPr/w:pStyle", NS))


def table_style(table: ET.Element) -> str | None:
    return attr_value(table.find("./w:tblPr/w:tblStyle", NS))


def cell_grid_span(cell: ET.Element) -> int:
    raw = attr_value(cell.find("./w:tcPr/w:gridSpan", NS))
    if not raw:
        return 1
    try:
        return int(raw)
    except ValueError:
        return 1


def cell_vertical_merge(cell: ET.Element) -> str | None:
    merge = cell.find("./w:tcPr/w:vMerge", NS)
    if merge is None:
        return None
    return attr_value(merge) or "continue"


def slugify(value: str) -> str:
    key = value.lower().replace("&", " and ")
    key = re.sub(r"[^a-z0-9]+", "_", key).strip("_")
    return key or "field"


def unique_keys(labels: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    keys: list[str] = []
    for label in labels:
        base = slugify(label)
        count = seen.get(base, 0) + 1
        seen[base] = count
        keys.append(base if count == 1 else f"{base}_{count}")
    return keys


def parse_money(value: str) -> dict[str, str] | None:
    match = MONEY_RE.match(value)
    if not match:
        return None
    currency, amount_text = match.groups()
    try:
        amount = Decimal(amount_text.replace(",", ""))
    except InvalidOperation:
        return None
    return {
        "currency": currency,
        "amount": format(amount, "f"),
        "display": value.strip(),
    }


def parse_date_label(value: str) -> dict[str, str]:
    for fmt in ("%d %B, %Y", "%d %b, %Y"):
        try:
            parsed = datetime.strptime(value.strip(), fmt)
            return {"label": value.strip(), "iso": parsed.date().isoformat()}
        except ValueError:
            continue
    return {"label": value.strip()}


def parse_period(value: str) -> dict[str, Any] | None:
    match = PERIOD_RE.match(value)
    if not match:
        return None
    start, end = match.groups()
    return {
        "label": f"{start.strip()} to {end.strip()}",
        "start": parse_date_label(start),
        "end": parse_date_label(end),
    }


def parse_subtitle(value: str | None) -> dict[str, Any]:
    if not value:
        return {}
    match = SUBTITLE_RE.match(value.strip())
    if not match:
        return {"raw": value}
    year, owner_name = match.groups()
    return {
        "raw": value,
        "year": int(year),
        "owner_name": owner_name,
        "template": "({{year}} {{owner_name}})",
    }


def parse_cell_value(value: str) -> Any:
    stripped = value.strip()
    if not stripped:
        return None
    money = parse_money(stripped)
    if money:
        return money
    return stripped


def parse_table(table: ET.Element) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    for row_index, row in enumerate(table.findall("w:tr", NS), start=1):
        cells: list[dict[str, Any]] = []
        for cell_index, cell in enumerate(row.findall("w:tc", NS), start=1):
            cells.append(
                {
                    "index": cell_index,
                    "text": text_content(cell),
                    "grid_span": cell_grid_span(cell),
                    "vertical_merge": cell_vertical_merge(cell),
                }
            )
        rows.append({"index": row_index, "cells": cells})

    return {
        "style": table_style(table),
        "rows": rows,
        "normalized": normalize_budget_table(rows),
    }


def row_texts(row: dict[str, Any]) -> list[str]:
    return [cell["text"] for cell in row["cells"] if cell["text"]]


def normalize_budget_table(rows: list[dict[str, Any]]) -> dict[str, Any]:
    useful_rows = [row for row in rows if row_texts(row)]
    if not useful_rows:
        return {}

    title = row_texts(useful_rows[0])[0]
    period: dict[str, Any] | None = None
    header_index: int | None = None

    for index, row in enumerate(useful_rows):
        texts = row_texts(row)
        if len(texts) == 1:
            maybe_period = parse_period(texts[0])
            if maybe_period:
                period = maybe_period
        if len(texts) > 1 and header_index is None:
            header_index = index

    if header_index is None:
        return {"title": title, "period": period}

    headers = row_texts(useful_rows[header_index])
    keys = unique_keys(headers)
    records: list[dict[str, Any]] = []
    total: dict[str, Any] | None = None

    for row in useful_rows[header_index + 1 :]:
        texts = row_texts(row)
        if not texts:
            continue
        padded = texts + [""] * (len(keys) - len(texts))
        values = {
            key: parse_cell_value(padded[column_index])
            for column_index, key in enumerate(keys)
        }
        record = {
            "row_index": row["index"],
            "raw": padded[: len(keys)],
            "values": values,
        }
        first_value = str(padded[0]).strip().lower()
        if first_value == "total":
            total = record
        else:
            records.append(record)

    return {
        "key": slugify(title),
        "title": title,
        "period": period,
        "columns": [{"key": key, "label": label} for key, label in zip(keys, headers)],
        "rows": records,
        "total": total,
    }


def parse_docx(path: Path) -> dict[str, Any]:
    with zipfile.ZipFile(path) as docx:
        document_xml = docx.read("word/document.xml")

    root = ET.fromstring(document_xml)
    body = root.find("w:body", NS)
    if body is None:
        raise ValueError(f"No word/document.xml body found in {path}")

    blocks: list[dict[str, Any]] = []
    sections: list[dict[str, Any]] = []
    paragraphs: list[str] = []

    for block_index, child in enumerate(list(body), start=1):
        name = local_name(child.tag)
        if name == "p":
            text = text_content(child)
            if not text:
                continue
            paragraphs.append(text)
            blocks.append(
                {
                    "index": block_index,
                    "type": "paragraph",
                    "style": paragraph_style(child),
                    "text": text,
                }
            )
        elif name == "tbl":
            table = parse_table(child)
            block_table = {
                key: value for key, value in table.items() if key != "normalized"
            }
            blocks.append({"index": block_index, "type": "table", **block_table})
            if table["normalized"]:
                sections.append(table["normalized"])

    period = first_period(sections)
    currency = first_currency(sections)
    title = paragraphs[0] if paragraphs else None
    subtitle = paragraphs[1] if len(paragraphs) > 1 else None

    return {
        "source_file": str(path),
        "template_kind": "personal_living_budget",
        "document": {
            "title": title,
            "title_template": infer_title_template(title),
            "subtitle": parse_subtitle(subtitle),
            "period": period,
            "currency": currency,
        },
        "template_fields": template_fields(period, currency, parse_subtitle(subtitle)),
        "sections": sections,
        "blocks": blocks,
    }


def first_period(sections: list[dict[str, Any]]) -> dict[str, Any] | None:
    for section in sections:
        period = section.get("period")
        if period:
            return period
    return None


def first_currency(sections: list[dict[str, Any]]) -> str | None:
    for section in sections:
        for record in section.get("rows", []):
            for value in record.get("values", {}).values():
                if isinstance(value, dict) and value.get("currency"):
                    return value["currency"]
        total = section.get("total")
        if total:
            for value in total.get("values", {}).values():
                if isinstance(value, dict) and value.get("currency"):
                    return value["currency"]
    return None


def infer_title_template(title: str | None) -> str | None:
    if not title:
        return None
    return re.sub(
        r"of\s+.+?\s+to\s+.+$",
        "of {{period_start_title}} to {{period_end_title}}",
        title,
        flags=re.IGNORECASE,
    )


def template_fields(
    period: dict[str, Any] | None,
    currency: str | None,
    subtitle: dict[str, Any],
) -> list[dict[str, Any]]:
    fields: list[dict[str, Any]] = []
    start = (period or {}).get("start", {})
    end = (period or {}).get("end", {})
    fields.extend(
        [
            {
                "key": "owner_name",
                "label": "Budget owner",
                "example": subtitle.get("owner_name"),
            },
            {
                "key": "year",
                "label": "Budget year",
                "example": subtitle.get("year"),
            },
            {
                "key": "period_start",
                "label": "Period start date",
                "example": start.get("iso") or start.get("label"),
            },
            {
                "key": "period_end",
                "label": "Period end date",
                "example": end.get("iso") or end.get("label"),
            },
            {
                "key": "currency",
                "label": "Budget currency",
                "example": currency,
            },
        ]
    )
    return fields


def write_outputs(parsed: dict[str, Any], output_dir: Path) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    stem = slugify(Path(parsed["source_file"]).stem)
    json_path = output_dir / f"{stem}.json"
    md_path = output_dir / f"{stem}.md"

    json_path.write_text(
        json.dumps(parsed, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    md_path.write_text(render_markdown(parsed), encoding="utf-8")
    return [json_path, md_path]


def render_markdown(parsed: dict[str, Any]) -> str:
    document = parsed["document"]
    lines = [
        f"# {document.get('title') or 'Personal Budget Template'}",
        "",
        f"- Source: `{parsed['source_file']}`",
        f"- Kind: `{parsed['template_kind']}`",
    ]
    if document.get("currency"):
        lines.append(f"- Currency: `{document['currency']}`")
    period = document.get("period")
    if period:
        lines.append(f"- Period: {period['label']}")
    subtitle = document.get("subtitle") or {}
    if subtitle.get("owner_name"):
        lines.append(f"- Owner: {subtitle['owner_name']}")

    lines.extend(["", "## Template Fields", ""])
    lines.extend(["| Key | Label | Example |", "| --- | --- | --- |"])
    for field in parsed["template_fields"]:
        lines.append(
            "| {key} | {label} | {example} |".format(
                key=field["key"],
                label=field["label"],
                example="" if field.get("example") is None else field["example"],
            )
        )

    for section in parsed["sections"]:
        lines.extend(["", f"## {section['title']}", ""])
        if section.get("period"):
            lines.append(f"Date: {section['period']['label']}")
            lines.append("")
        headers = [column["label"] for column in section.get("columns", [])]
        keys = [column["key"] for column in section.get("columns", [])]
        if not headers:
            continue
        lines.append("| " + " | ".join(headers) + " |")
        lines.append("| " + " | ".join("---" for _ in headers) + " |")
        for record in section.get("rows", []):
            lines.append(markdown_row(record, keys))
        if section.get("total"):
            lines.append(markdown_row(section["total"], keys))

    return "\n".join(lines) + "\n"


def markdown_row(record: dict[str, Any], keys: list[str]) -> str:
    cells: list[str] = []
    for key in keys:
        value = record["values"].get(key)
        if isinstance(value, dict) and "display" in value:
            cells.append(value["display"])
        elif value is None:
            cells.append("")
        else:
            cells.append(str(value))
    return "| " + " | ".join(escape_markdown_cell(cell) for cell in cells) + " |"


def escape_markdown_cell(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", "<br>")


def collect_docx_files(input_path: Path) -> list[Path]:
    if input_path.is_file():
        if input_path.suffix.lower() != ".docx":
            raise ValueError(f"Input file is not a DOCX: {input_path}")
        return [input_path]
    if not input_path.exists():
        raise FileNotFoundError(input_path)
    return sorted(input_path.rglob("*.docx"))


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Parse DOCX budget templates into JSON and Markdown files."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("template"),
        help="A DOCX file or a directory containing DOCX files.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("parsed_templates"),
        help="Directory for generated JSON and Markdown files.",
    )
    return parser


def main() -> int:
    args = build_arg_parser().parse_args()
    docx_files = collect_docx_files(args.input)
    if not docx_files:
        print(f"No DOCX files found under {args.input}")
        return 1

    for docx_file in docx_files:
        parsed = parse_docx(docx_file)
        outputs = write_outputs(parsed, args.output_dir)
        print(f"Parsed {docx_file}")
        for output in outputs:
            print(f"  -> {output}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
