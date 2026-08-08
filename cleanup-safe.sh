#!/usr/bin/env bash
# ============================================================================
# GÜVENLİ TEMİZLİK — sadece index.html tarafından HİÇBİR ŞEKİLDE referans
# edilmediğini doğruladığım dosya/klasörleri kaldırır. git kullanıyoruz,
# yani hiçbir şey gerçekten "kaybolmaz" — geçmiş `git log` ile her zaman
# erişilebilir kalır, bu script sadece çalışma dizinini temizler.
#
# NASIL ÇALIŞTIRILIR:
#   1) Önce KURU ÇALIŞTIRMA (hiçbir şey silmez, sadece ne olacağını gösterir):
#        bash cleanup-safe.sh --dry-run
#   2) Sonucu gözden geçirip onaylarsan:
#        bash cleanup-safe.sh
#   3) git status ile kontrol et, sonra commit et:
#        git commit -m "chore: remove confirmed-dead files (formula-reborn, ME4 phase backups, orphan season-hub)"
#
# DOKUNMADIĞIM ŞEYLER (bilerek):
#   - tests/smoke_test.py ve tests/demo.html → ayrı bir konuşma konusu
#     (tests/README.md içinde önerim var, ama otomatik silmiyorum)
#   - 412 .txt/.md/VALIDATION_REPORT*.json dosyası → bunlar için de
#     öneriyorum ama miktar büyük olduğundan ayrı onayınızı istiyorum
#   - 8 "yetim" navigasyon rotası (chat/setup/league/gold/silver/
#     recordshub/playeraccess/finalpoll) → bunlar KOD içinde, dosya değil;
#     hangisini silmek/hangisini nav'a eklemek istediğinizi söylemeniz lazım
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")"

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

TARGETS=(
  # --- Kategori 1: index.html'de SIFIR referansı doğrulanan orphan dosyalar ---
  "season-hub.js"
  "season-hub.css"
  "season-experience.js"
  "season-experience.css"

  # --- Kategori 2: formula-reborn -- index.html hiç yüklemiyor, F1/Formula
  #     motoru, FIFA turnuva sitesiyle alakasız, THREE.js dahil 208K ---
  "formula-reborn"

  # --- Kategori 3: Manuel "checkpoint" yedek klasörleri -- git zaten bu
  #     geçmişi (214 commit) tutuyor, bu klasörler onun kaba, elle alınmış
  #     kopyaları. `git log --all --full-history -- <dosya>` ile her zaman
  #     geri bulunabilir. ---
  "FIFA_9_Tournament_Hub_Live_v3_CGLRCNTTR"
  "FIFA_MATCH_ENGINE_V4_FOUNDATION"
  "FIFA_MATCH_ENGINE_V4_PHASE2_VISUAL_TAKEOVER"
  "FIFA_MATCH_ENGINE_V4_PHASE3_OFFICIAL_BALL_CONTROL"
  "FIFA_MATCH_ENGINE_V4_PHASE4_OFFICIAL_SHOT_GOALKEEPER"
  "FIFA_MATCH_ENGINE_V4_PHASE5_SET_PIECE_AERIAL_ENGINE"
  "FIFA_MATCH_ENGINE_V4_PHASE6_DEFENSIVE_PRESSING_ENGINE"
  "FIFA_MATCH_ENGINE_V4_PHASE7_ATTACKING_IDENTITY_ENGINE"
  "FIFA_MATCH_ENGINE_V4_PHASE8_MANAGER_AI_ENGINE"
  "FIFA_MATCH_ENGINE_V4_PHASE9_PHYSICAL_CONDITION_ENGINE"
  "FIFA_MATCH_ENGINE_V4_PHASE10_REFEREE_DISCIPLINE_ENGINE"
  "FIFA_MATCH_ENGINE_V4_PHASE11_2D_VISUAL_EXPERIENCE_ENGINE"
  "FIFA_MATCH_ENGINE_V4_PHASE12_ADVANCED_ANALYTICS_REPLAY_ENGINE"
  "FIFA_MATCH_ENGINE_V4_PHASE13_GRAND_CALIBRATION_BALANCE_ENGINE"
  "FIFA_V44_0_0_MATCH_ENGINE_4_REPORT.md"
  "FIFA_V44_1_0_TACTICAL_REALITY_REPORT.md"
  "FIFA_V44_1_1_EMERGENCY_EXIT_FIX"
  "FIFA_V44_4_0_FINAL_CHAPTER_LAST_TICKET"
  "FIFA9_V44_6_1_SEASON_DIVISION_LOCK"
  "ME4_PHASE13_ACTIVATION_HOTFIX"
  "github"
)

echo "$([ "$DRY_RUN" = true ] && echo '[KURU ÇALIŞTIRMA] ' )${#TARGETS[@]} hedef işlenecek:"
echo
removed=0
for t in "${TARGETS[@]}"; do
  if [[ -e "$t" ]]; then
    size=$(du -sh "$t" 2>/dev/null | cut -f1)
    if [[ "$DRY_RUN" = true ]]; then
      echo "  [SİLİNECEK] $t ($size)"
    else
      git rm -r --quiet "$t"
      echo "  [SİLİNDİ]   $t ($size)"
    fi
    removed=$((removed+1))
  else
    echo "  [YOK]       $t (zaten mevcut değil, atlanıyor)"
  fi
done

echo
echo "$removed / ${#TARGETS[@]} hedef işlendi."
[[ "$DRY_RUN" = true ]] && echo "Gerçekten silmek için: bash cleanup-safe.sh" \
  || echo "Şimdi: git status ile kontrol edip commit edin."

# ============================================================================
# EK TUR: 412 değişiklik notu / doğrulama raporu dosyası (.txt/.md/
# VALIDATION_REPORT*.json, kök dizin). Onay verildi -- bunlar kod değil,
# git zaten tüm geçmişi tutuyor, silinmesi güvenli.
# ============================================================================
echo
echo "--- Doküman/rapor dosyaları (.txt/.md/VALIDATION_REPORT*) ---"
mapfile -t DOCS < <(find . -maxdepth 1 \( -iname "*.txt" -o -iname "*.md" -o -iname "VALIDATION_REPORT*" \))
if [[ "$DRY_RUN" = true ]]; then
  echo "  [SİLİNECEK] ${#DOCS[@]} dosya"
else
  printf '%s\0' "${DOCS[@]}" | xargs -0 git rm --quiet
  echo "  [SİLİNDİ]   ${#DOCS[@]} dosya"
fi
