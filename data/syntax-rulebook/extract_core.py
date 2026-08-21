# -*- coding: utf-8 -*-
"""構文分析ルールブック正本（PDF・ルール1〜32）をテキスト化する。

正本: quiz_generator/subjects/英語/docs/構文分析ルールブック/構文分析ルールブック_正本_20260820.pdf
（読み取り専用。swallow-srs 側では編集しない。正本が改訂されたら本スクリプトを再実行する）

出力: data/syntax-rulebook/core-extracted.txt
その後 `node data/sync-syntax-rulebook.mjs` で src/lib/syntax-ai/rulebook-text.ts に取り込む。

PDFはデザイン込みのため、抽出テキストに全角文字の字間スペースが入る。
ここで日本語文字どうしの間のスペースを除去して読みやすくする（英単語間のスペースは残す）。

実行: python -X utf8 data/syntax-rulebook/extract_core.py
"""

import re
from pathlib import Path

from pypdf import PdfReader

SOURCE = Path(
    r"C:/Users/gaimo/source/repos/quiz_generator/subjects/英語/docs/構文分析ルールブック"
    r"/構文分析ルールブック_正本_20260820.pdf"
)
OUT = Path(__file__).parent / "core-extracted.txt"

# 日本語（CJK・全角記号）どうしに挟まれたスペースを除去する
CJK = r"\u3000-\u303f\u3040-\u30ff\u4e00-\u9fff\uff01-\uff60\u2015\u2500-\u257f"
BETWEEN_CJK = re.compile(rf"(?<=[{CJK}])[ \t]+(?=[{CJK}])")
# 日本語と英数字の境目のスペースも詰める（「文は S,V」→「文はS,V」は避けたいので片側のみ・控えめに）
AFTER_CJK_PUNCT = re.compile(rf"(?<=[。、．，）」』])[ \t]+")


def clean(text: str) -> str:
    text = BETWEEN_CJK.sub("", text)
    text = AFTER_CJK_PUNCT.sub("", text)
    # 行末スペースと3行以上の空行を詰める
    text = re.sub(r"[ \t]+$", "", text, flags=re.M)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def main() -> None:
    reader = PdfReader(str(SOURCE))
    pages = []
    for i, page in enumerate(reader.pages):
        raw = page.extract_text() or ""
        pages.append(f"── {i + 1}ページ ──\n{clean(raw)}")
    OUT.write_text("\n\n".join(pages) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes, {len(reader.pages)} pages)")


if __name__ == "__main__":
    main()
