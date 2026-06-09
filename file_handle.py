"""Split or merge the annotated dataset JSON files."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


DEFAULT_INPUT = Path("/home/nguyen-quang-huy/Documents/NCKH/CSSERT/labelit/data/merged.json")
DEFAULT_OUTPUT_DIR = Path("/home/nguyen-quang-huy/Documents/NCKH/CSSERT/labelit/data/split/")
DEFAULT_MERGED_OUTPUT = Path("/home/nguyen-quang-huy/Documents/NCKH/CSSERT/labelit/data/checked.json")
DEFAULT_CHUNK_SIZE = 100


def load_dataset(path: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
	with path.open("r", encoding="utf-8") as file:
		data = json.load(file)

	if not isinstance(data, dict) or "articles" not in data:
		raise ValueError("Expected a JSON object with an 'articles' field.")

	articles = data["articles"]
	if not isinstance(articles, list):
		raise ValueError("Expected 'articles' to be a list.")

	return data, articles


def write_chunks(
	dataset: dict[str, Any],
	articles: list[dict[str, Any]],
	output_dir: Path,
	chunk_size: int,
) -> list[Path]:
	output_dir.mkdir(parents=True, exist_ok=True)

	for old_file in output_dir.glob("split_*.json"):
		old_file.unlink()

	created_files: list[Path] = []
	total_articles = len(articles)
	width = max(4, len(str((total_articles + chunk_size - 1) // chunk_size)))

	for index, start in enumerate(range(0, total_articles, chunk_size), start=1):
		chunk = articles[start : start + chunk_size]
		payload = dict(dataset)
		payload["articles"] = chunk
		payload["total"] = len(chunk)

		output_path = output_dir / f"split_{index:0{width}d}.json"
		with output_path.open("w", encoding="utf-8") as file:
			json.dump(payload, file, ensure_ascii=False, indent=2)
			file.write("\n")

		created_files.append(output_path)

	return created_files


def merge_chunks(input_dir: Path, output_file: Path) -> Path:
	chunk_files = sorted(input_dir.glob("split_*.json"))
	if not chunk_files:
		raise FileNotFoundError(f"No split_*.json files found in {input_dir}")

	merged_dataset: dict[str, Any] | None = None
	merged_articles: list[dict[str, Any]] = []

	for chunk_file in chunk_files:
		with chunk_file.open("r", encoding="utf-8") as file:
			data = json.load(file)

		if not isinstance(data, dict) or "articles" not in data:
			raise ValueError(f"Invalid chunk file: {chunk_file}")

		articles = data["articles"]
		if not isinstance(articles, list):
			raise ValueError(f"Expected 'articles' to be a list in {chunk_file}")

		if merged_dataset is None:
			merged_dataset = dict(data)
		merged_dataset.pop("articles", None)
		merged_dataset.pop("total", None)

		merged_articles.extend(articles)

	if merged_dataset is None:
		raise ValueError(f"No valid chunks found in {input_dir}")

	merged_payload: dict[str, Any] = {"total": len(merged_articles), "articles": merged_articles}
	for key, value in merged_dataset.items():
		if key not in {"total", "articles"}:
			merged_payload[key] = value

	output_file.parent.mkdir(parents=True, exist_ok=True)
	with output_file.open("w", encoding="utf-8") as file:
		json.dump(merged_payload, file, ensure_ascii=False, indent=2)
		file.write("\n")

	return output_file


def parse_args() -> argparse.Namespace:
	parser = argparse.ArgumentParser(description="Split or merge annotated JSON datasets.")
	parser.add_argument("--mode", choices=("split", "merge"), default="split")
	parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
	parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
	parser.add_argument("--output-file", type=Path, default=DEFAULT_MERGED_OUTPUT)
	parser.add_argument("--chunk-size", type=int, default=DEFAULT_CHUNK_SIZE)
	return parser.parse_args()


def main() -> None:
	args = parse_args()
	if args.mode == "split":
		dataset, articles = load_dataset(args.input)
		created_files = write_chunks(dataset, articles, args.output_dir, args.chunk_size)
		print(f"Created {len(created_files)} files in {args.output_dir}")
	else:
		merged_file = merge_chunks(args.output_dir, args.output_file)
		print(f"Created merged file at {merged_file}")


if __name__ == "__main__":
	main()
