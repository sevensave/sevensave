#!/usr/bin/env bash
# Выкладывает site/ в корень репозитория sevensave/sevensave.github.io (Pages из main, корень).
# Запуск из корня лаунчера: tools/publish-site.sh ["сообщение коммита"]
set -euo pipefail

SITE_REPO="https://github.com/sevensave/sevensave.github.io.git"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_REV="$(git -C "$ROOT" rev-parse --short HEAD)"
MSG="${1:-Сайт из sevensave@$SRC_REV}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

git clone --quiet --depth 1 "$SITE_REPO" "$WORK/site"
# Всё, кроме .git, заменяем содержимым site/.
find "$WORK/site" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R "$ROOT/site/." "$WORK/site/"
# Без Jekyll: файлы отдаются как есть.
touch "$WORK/site/.nojekyll"

cd "$WORK/site"
git add -A
if git diff --cached --quiet; then
  echo "Сайт не изменился."
  exit 0
fi
git commit --quiet -m "$MSG"
git push --quiet origin HEAD:main
echo "Выложено: https://sevensave.github.io (Pages обновится за минуту-две)."
