#!/usr/bin/env bash
set -euo pipefail

repo_root="${1:-.}"
cd "$repo_root"

tmp_files=()
cleanup() {
  if (( ${#tmp_files[@]} > 0 )); then
    rm -f "${tmp_files[@]}"
  fi
}
trap cleanup EXIT

doc_files=(
  "README.md"
  "ABOUT_PANORAFUS.md"
  "GLOBAL_TRUST.md"
  "BIBLICAL_ESCHATOLOGY.md"
  "FIRST_THINGS_LAST_THINGS.md"
  "SEASONED_CHRISTIAN_MINISTRY.md"
  "CHRISTIAN_INSTITUTIONS.md"
  "ISLAMIC_INSTITUTIONS.md"
  "JEWISH_INSTITUTIONS.md"
  "HINDU_INSTITUTIONS.md"
  "BUDDHIST_INSTITUTIONS.md"
  "OTHER_RELIGIOUS_INSTITUTIONS.md"
  "RELIGIOUS_DENOMINATION_CREDENTIALS.md"
  "HUMANITARIAN_ORGANIZATIONS.md"
  "INVESTOR_RELATIONS.md"
  "THEOLOGICAL_SCHOOLS_AND_SEMINARIES.md"
  "RELIGIOUS_MEDIA_AND_BROADCASTING.md"
  "PRAYER_AND_INTERCESSION_NETWORKS.md"
  "MISSIONS_AND_EVANGELISM.md"
  "RELIGIOUS_EDUCATION.md"
  "LIFE_OF_JESUS_CHRIST.md"
  "MAJESTIC_GOD_OUR_FATHER.md"
  "CONTRIBUTE.md"
  "SEE_THE_WORD.md"
  "PANORAFUS_DASHBOARD.md"
  "PANORAFUS_AI_STUDIO.md"
  "PNRF_STOCK.md"
  "ROBOTIC_SERVICES.md"
  "GLOBAL_DEPLOYMENT.md"
  "SECURITY.md"
  "GLOBALNETWORK" # Canonical global index file intentionally tracked without .md extension.
  "PROJECT_SETUP_ROADMAP.md"
  "APOSTLE_PAUL_GENEALOGY.md"
  "APP_ARCHITECTURE_BUILDER.md"
  "BOOK_TARIFF.md"
  "DEVOTIONAL_PRAYER.md"
  "FUTURE_KNOWLEDGE.md"
  "HOLY_SPIRIT_AND_GIFTS.md"
  "PROJECT_COMPENSATION.md"
  "RELEASE_CERTIFICATE_AND_DEGREE.md"
  "RESURRECTION_WITNESSES.md"
  "REIGN_OF_DEATH_ETERNAL_LIFE.md"
  "SPIRITUAL_DARKNESS_LIGHTS_OF_THE_WORLD.md"
  "SATANS_VICTORY_SATANS_DEFEAT.md"
  "SUMMARY.md"
  "THE_LORD_SUPPER.md"
  "VISIONS_AND_REVELATIONS.md"
  "WORSHIP_AND_PRAYER.md"
  "PANORAFUS_AI_FINAL_REVIEW.md"
)

for file in "${doc_files[@]}"; do
  if [[ -d "$file" ]]; then
    echo "Required documentation path is a directory, expected file: '$file'."
    exit 1
  fi
  if [[ ! -f "$file" ]]; then
    echo "Required documentation file missing: '$file'."
    exit 1
  fi
done

for file in "${doc_files[@]}"; do
  if ! grep -q "PANORAFUS.AI" "$file"; then
    echo "PANORAFUS.AI branding validation failed: '$file' must include PANORAFUS.AI."
    exit 1
  fi
done

for file in "${doc_files[@]}"; do
  while IFS= read -r target; do
    clean_target="${target%%#*}"
    [[ -z "$clean_target" ]] && continue
    [[ "$clean_target" =~ ^[A-Za-z][A-Za-z0-9+.-]*: ]] && continue

    check_target="$clean_target"
    if [[ "$check_target" == /* ]]; then
      check_target=".${check_target}"
    fi

    if [[ ! -e "$check_target" ]]; then
      echo "Link target file not found: '$target' (referenced in '$file')."
      exit 1
    fi
  done < <(grep -oE '\[[^]]+\]\(([^)]+)\)' "$file" | sed -E 's/.*\(([^)]+)\)/\1/')
done

if [[ ! -d "lang/ar" || ! -d "lang/es" || ! -d "lang/fr" || ! -d "lang/pt" || ! -d "lang/zh" || ! -d "lang/hi" ]]; then
  echo "Language directory validation failed: expected lang/ar, lang/es, lang/fr, lang/pt, lang/zh, lang/hi."
  exit 1
fi

collect_language_file_set() {
  local language_dir="$1"
  find "$language_dir" -maxdepth 1 -type f \( -name "*.md" -o -name "book.toml" \) \
    -exec basename {} \; | sort
}

collect_root_translation_targets() {
  find "." -maxdepth 1 -type f \( -name "*.md" -o -name "GLOBALNETWORK" -o -name "book.toml" \) \
    -exec basename {} \; | sed 's/^GLOBALNETWORK$/GLOBALNETWORK.md/' | sort
}

reference_list="$(mktemp)"
tmp_files+=("$reference_list")
collect_root_translation_targets > "$reference_list"

for lang in ar es fr pt zh hi; do
  current_list="$(mktemp)"
  tmp_files+=("$current_list")
  collect_language_file_set "lang/${lang}" > "$current_list"
  if ! diff_output="$(diff -u "$reference_list" "$current_list")"; then
    echo "Language parity validation failed: lang/${lang} does not match English framework file set."
    echo "$diff_output"
    exit 1
  fi
done

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "## PANORAFUS.AI Docs Autopilot"
    echo "- Branding header check: passed"
    echo "- Internal link check: passed"
    echo "- Language parity check (ar/es/fr/pt/zh/hi vs en root): passed"
    echo "- Files validated: ${#doc_files[@]}"
  } >> "$GITHUB_STEP_SUMMARY"
fi

echo "PANORAFUS.AI docs validation passed."
